// src/middleware.ts
/**
 * The guard on `/private/**`.
 *
 * This is the entire enforcement point. Every private and per-org page in this
 * template is protected here and nowhere else; the pages themselves render
 * whatever they are asked for. Read `wiki/private-docs.md` before changing it.
 *
 * It runs on every on-demand request — all of `/private/**` and `/auth/**`,
 * which is everything this template renders on demand — and, at build time,
 * once per prerendered public page. Prerendered pages are then served as static
 * files and never pass through here again, which is fine: they have nothing to
 * guard. It is also why the public early-return below happens *before* any
 * configuration or session work: `astro build` must not require SSO to be
 * configured.
 *
 * ## Nothing this file returns may be cached by anything but the reader
 *
 * The obvious case is the private HTML: a CDN or corporate proxy that
 * heuristically caches a 200 carrying no cache headers would serve it to
 * whoever asks next, which defeats the whole design in one hop. The less
 * obvious case is the SSO redirect, which carries a `Set-Cookie` with a
 * single-use `state` nonce — a cached copy hands every later reader the same
 * nonce. So every response that leaves here, including the ones from `next()`,
 * is marked `no-store`.
 */
import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { auth, authConfigured, authSecrets, ssoEndpoint } from './config/auth.mjs';
import { classifyPath } from './lib/auth/guards.mjs';
import { verifySessionToken } from './lib/auth/tokens.mjs';

/**
 * The one SSO round trip in flight, as stored in `auth.stateCookie`.
 *
 * Written here, read back here (for the loop guard) and by `/auth/callback`
 * (for `state` and `returnTo`). It is unsigned JSON in a cookie, so in the wild
 * every field is whatever the reader's browser says it is; this type describes
 * only the shape that survives `readStateCookie`.
 */
type StateCookie = { state: string; returnTo: string; attempts: number };

/**
 * Failed round trips tolerated before the loop guard gives up — one to be
 * unlucky, two to be a pattern.
 */
const MAX_SSO_ATTEMPTS = 2;

/** `private` for the intermediaries that only honour that; `no-store` for the rest. */
const NO_STORE = 'private, no-store';

export const onRequest = defineMiddleware(async (context, next) => {
	// Two independent signals, and the stricter one wins. Neither is sufficient
	// alone — each fails open in a case the other catches.
	//
	// `originPathname`, NOT `url.pathname`: measured against Astro 6.3.1 in
	// Task 3, `url.pathname` still carries the configured `base`, so on a site
	// built with `base: '/docs'` a request for `/docs/private/secret/`
	// classifies as PUBLIC while Astro strips the base and renders the private
	// page anyway. A complete bypass, costing a customer nothing but deploying
	// under a subpath. `originPathname` is base-stripped and agreed with the
	// router in every non-rewrite probe, including the multi-level-encoding
	// cases (`%252e%252e`) where `url.pathname` and the router disagree about
	// which org segment is being asked for. See `src/lib/auth/guards.mjs`.
	//
	// `routePattern` covers what `originPathname` cannot: Astro re-enters the
	// whole middleware chain after ANY `Astro.rewrite()` — including one issued
	// by a page or a third-party integration — and on that second pass
	// `originPathname` is still pinned to the pre-rewrite path. So a public page
	// that rewrites into `/private/**` renders private content with the guard
	// reporting `public`. Nothing in this template rewrites today, which is why
	// this is defence in depth rather than a live hole; but "no integration ever
	// rewrites" is not a property a template can promise on behalf of its
	// customers.
	//
	// `routePattern` is the route Astro actually settled on
	// (`/private/[...slug]`), and it cannot drift from what is about to render:
	// a rewrite reassigns it (`core/middleware/sequence.js`) or drops the cached
	// context entirely (`FetchState.invalidateContexts`). It is documented
	// public API on `APIContext`, typed as a non-optional `string` — no `?.`
	// here, because if a future Astro drops it, `astro check` failing the build
	// loudly beats an optional chain quietly turning this guard off.
	const kind = classifyPath(context.originPathname);
	const routeIsPrivate = routeIsUnderPrivate(context.routePattern);

	if ((kind.type === 'public' || kind.type === 'auth') && !routeIsPrivate) return next();

	// A private route reached with a public-looking path means the two signals
	// disagree — only possible via a rewrite. Refuse rather than guess which org
	// it is: there is no trustworthy org slug in that state, and the path that
	// would supply one belongs to a different page.
	if (routeIsPrivate && kind.type !== 'private' && kind.type !== 'org') {
		console.error(
			`[auth] refusing ${context.routePattern}: route is private but the ` +
				`request path (${context.originPathname}) is not. A rewrite into ` +
				`/private/** cannot be authorised — see wiki/private-docs.md.`
		);
		return notFound();
	}

	// The same disagreement one level down, and the half a `private`/`public`
	// comparison cannot see: an org route has to name the same org twice — once
	// in the path this guard classified, once in the `org` param the page will
	// read. Only a rewrite can separate them, and both ways it separates them
	// are a bypass of the membership check below. Measured on Astro 6.3.1 with
	// a session holding `orgs: ["acme"]`:
	//
	//     /private/to-org      rewrites to /private/orgs/globex/
	//       → path says `private`, params say globex, membership never checked
	//     /private/orgs/acme/x rewrites to /private/orgs/globex/
	//       → path says acme (which passes), params say globex
	//
	// Both served globex's page, HTTP 200, to a reader who is not in globex.
	// The route is the authority on what is about to render, so it is the route
	// that has to agree with the path, not the other way round.
	//
	// In every non-rewrite shape the two are byte-identical, including the ones
	// where the encoding might suggest otherwise (`%61cme` → `acme` on both
	// sides; `a%2fb` and `a%25b` likewise), because both are read off the same
	// pathname after Astro has decoded it once. So this refuses nothing that a
	// reader can ask for directly.
	//
	// It also refuses a non-`[org]` route placed under `/private/orgs/`, which
	// is the right answer: that prefix is the org namespace (`orgs/` is reserved
	// inside `private-docs/` for the same reason), and a page there would answer
	// to an org name without ever checking membership of it.
	const routeIsOrg = context.routePattern.startsWith('/private/orgs/');
	if (routeIsOrg && (kind.type !== 'org' || kind.org !== context.params.org)) {
		console.error(
			`[auth] refusing ${context.routePattern}: it resolved to org ` +
				`"${context.params.org}" but the request path (${context.originPathname}) ` +
				`names ${kind.type === 'org' ? `"${kind.org}"` : 'no org'}. Only a rewrite ` +
				'into /private/orgs/** can produce this — see wiki/private-docs.md.'
		);
		return notFound();
	}

	// Fail closed: without configuration, private routes do not exist as far as
	// an anonymous visitor can tell.
	if (!authConfigured()) {
		if (import.meta.env.DEV) return devSetupPage();
		console.error(
			'[auth] request to a /private route but SSO is not configured — ' +
				'set DOCS_SSO_URL, DOCS_SSO_SECRET and DOCS_SESSION_SECRET (see .env.example).'
		);
		return notFound();
	}

	// `verifySessionToken` takes the secret as `unknown` and throws on an empty
	// one, so there is no non-null assertion to make here: `authConfigured()`
	// has already established it, and if that ever stops being true the failure
	// is loud rather than a session that verifies against an empty key.
	const cookie = context.cookies.get(auth.sessionCookie)?.value;
	const session = cookie ? await verifySessionToken(cookie, { secret: authSecrets.session }) : null;
	if (!session) return redirectToSso(context);

	// Wrong org is a 404, not a 403: org names must not be confirmable by
	// probing, and a 403 confirms one.
	//
	// Compare the bytes verbatim — no lowercasing, trimming or decoding on
	// either side. `kind.org` is byte-identical to the `params.org` the page will
	// receive (the check above now requires exactly that), and normalising here
	// would make the guard and the page disagree about which org this is.
	// (No `!` needed: the union narrows `org` to `string` under this `type`.)
	if (kind.type === 'org' && !session.orgs.includes(kind.org)) return notFound();

	context.locals.session = session;
	return noStore(await next());
});

/**
 * Does the route Astro settled on live under `/private/**`?
 *
 * Deliberately segment-exact rather than `startsWith('/private')`, which also
 * matches a page at `src/pages/privateer.astro` — route pattern `/privateer`,
 * entirely public. That page's path classifies as public while its route looked
 * private, which is precisely the disagreement this file refuses outright, so a
 * loose prefix would turn an innocent filename into a permanent 404. Same rule
 * shape as `classifyPath`, for the same reason it uses one.
 */
function routeIsUnderPrivate(routePattern: string): boolean {
	return routePattern === '/private' || routePattern.startsWith('/private/');
}

/**
 * Start (or refuse to restart) an SSO round trip.
 *
 * @param context The middleware's own context. Typed as `APIContext` rather
 *   than the `Parameters<Parameters<typeof defineMiddleware>[0]>[0]` spelling:
 *   both resolve to the same type, and `APIContext` is the documented public
 *   name for it.
 */
function redirectToSso(context: APIContext) {
	// `authConfigured()` has already established this. Narrowing it again keeps
	// a non-null assertion out of the one function that builds a redirect, and
	// if the two ever drift, drifting into a 404 is the right direction.
	if (!ssoEndpoint) return notFound();

	const prior = readStateCookie(context.cookies.get(auth.stateCookie)?.value);
	const attempts = (prior?.attempts ?? 0) + 1;
	// Loop guard: an SSO endpoint that bounces readers straight back would
	// otherwise redirect forever, and a redirect loop is a much worse failure to
	// debug than a page that says what broke.
	if (attempts > MAX_SSO_ATTEMPTS) {
		context.cookies.delete(auth.stateCookie, { path: '/' });
		return errorPage(
			'Sign-in did not complete',
			'The sign-in service redirected back without a valid token twice. ' +
				'This usually means the SSO endpoint or the shared secret is misconfigured.'
		);
	}

	const state = crypto.randomUUID();
	const value: StateCookie = {
		state,
		// `url.pathname`, deliberately — the one place in this file where
		// `originPathname` would be the wrong input. This string is handed back
		// to the browser as a location to navigate to after sign-in, so it has
		// to be the URL the reader actually asked for, `base` and all;
		// `originPathname` has the base stripped off and would send them to a
		// path that does not exist. It is re-checked by `/auth/callback`
		// (`safeReturnTo`) rather than trusted, because by then it is cookie
		// data like everything else here.
		returnTo: context.url.pathname + context.url.search,
		attempts,
	};
	context.cookies.set(auth.stateCookie, JSON.stringify(value), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		// Vite compiles `import.meta.env.DEV` to a literal `false` in a
		// production build, so this is `Secure` everywhere except `astro dev` —
		// which needs it off to work over plain http on localhost.
		secure: !import.meta.env.DEV,
		maxAge: 600,
	});

	// A copy: `ssoEndpoint` is shared by every request and `searchParams.set`
	// mutates. Re-parsing an already-valid href cannot throw.
	const target = new URL(ssoEndpoint);
	target.searchParams.set('redirect_uri', callbackUrl(context));
	target.searchParams.set('state', state);
	return noStore(context.redirect(target.href));
}

/**
 * The absolute URL of `/auth/callback` as a browser must ask for it.
 *
 * Built from `BASE_URL` rather than written out, because Astro serves every
 * route under the configured `base`: on a site with `base: '/docs'` the
 * callback lives at `/docs/auth/callback`, and a hardcoded `/auth/callback`
 * would send the customer's SSO endpoint to a 404 — breaking sign-in on exactly
 * the subpath deployments the guard above is hardened for. `BASE_URL` is `/`
 * when no base is set, and may or may not carry a trailing slash depending on
 * `trailingSlash`, so the join normalises rather than assuming.
 */
function callbackUrl(context: APIContext): string {
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	return new URL(`${base}/auth/callback`, context.url.origin).href;
}

/**
 * Parse the state cookie. Exported for `/auth/callback`, which needs `state`
 * and `returnTo` out of the same cookie.
 *
 * Everything here is attacker-controlled: the cookie is unsigned JSON that any
 * reader can write, and it is read before anyone is authenticated. So this
 * validates rather than casts, because two things go wrong if it does not:
 *
 * - `returnTo` is typed `string` and reached as `value.startsWith('/')` in
 *   `/auth/callback`. A cookie claiming `{"returnTo":7}` makes that a
 *   TypeError — a 500 on the sign-in endpoint, produced by a cookie.
 * - `attempts` feeds the loop guard. `{"attempts":"x"}` turns `attempts + 1`
 *   into the string `"x1"`, and `"x1" > 2` is `false` forever: the guard is
 *   switched off from outside and the reader redirects in a circle. Numbers
 *   that are not counts do the same job more quietly — `-5` buys extra rounds,
 *   `1.5` never lands on an integer, and `1e400` parses as `Infinity`.
 *
 * A cookie failing any check is treated as absent, which restarts the round
 * trip with a freshly written one and resets the counter. That is the right
 * trade: the counter exists to stop a *broken SSO endpoint* from bouncing an
 * honest reader forever, and in that scenario the cookie is one this file
 * wrote. A reader who forges their own counter is choosing to keep redirecting
 * their own browser, and no content is reachable either way.
 *
 * `JSON.parse` throws on malformed input and on deeply nested input
 * (`RangeError`); `catch` takes both. Length needs no rule of its own — an
 * over-long cookie never reaches this code, because the HTTP server rejects the
 * request at its header limit first (Node's default is 16 KB, answered with
 * 431).
 */
export function readStateCookie(raw: string | undefined): StateCookie | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	// Arrays and `null` are objects to `typeof`, and a JSON array has no named
	// members to destructure, so both are rejected before the field checks.
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const { state, returnTo, attempts } = parsed as Record<string, unknown>;
	// An empty `state` would be rejected by `verifyHandoffToken` anyway; it is
	// refused here so the two sides cannot disagree about what counts as a nonce.
	if (typeof state !== 'string' || state === '') return null;
	if (typeof returnTo !== 'string') return null;
	// `typeof` first so the rest narrows; `isInteger` then excludes NaN,
	// Infinity and fractions, which `> MAX_SSO_ATTEMPTS` alone would not.
	if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0) return null;
	return { state, returnTo, attempts };
}

/**
 * Mark a response as un-cacheable by anything shared.
 *
 * Almost every response arrives with mutable headers, including the ones Astro
 * builds for `context.redirect()`. `Response.redirect()` does not: the platform
 * marks those headers immutable, and setting one throws. A private page or
 * endpoint returning that is unusual but entirely legal, and this header must
 * not be the reason a page that worked before starts answering 500 — so the
 * rare case is rebuilt rather than mutated. Rebuilding every response instead
 * would give up streaming for all of them.
 */
function noStore(response: Response): Response {
	try {
		response.headers.set('cache-control', NO_STORE);
		return response;
	} catch {
		const headers = new Headers(response.headers);
		headers.set('cache-control', NO_STORE);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}
}

/**
 * Deliberately not the site's styled 404: this is served for org names that do
 * not exist *and* for org names the reader may not have, so it has to look
 * identical in both cases and carry nothing from either collection.
 */
function notFound() {
	return new Response('<!doctype html><title>404</title><h1>404 — Not found</h1>', {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': NO_STORE },
	});
}

function errorPage(title: string, body: string) {
	return new Response(`<!doctype html><title>${title}</title><h1>${title}</h1><p>${body}</p>`, {
		status: 502,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': NO_STORE },
	});
}

/** Dev-only. In production an unconfigured site 404s instead (fail closed). */
function devSetupPage() {
	return new Response(
		`<!doctype html><title>SSO not configured</title>
		<h1>Private docs: SSO not configured</h1>
		<p>This page renders in <code>astro dev</code> only. To enable the
		logged-in experience locally:</p>
		<ol>
			<li>Copy <code>.env.example</code> to <code>.env</code>.</li>
			<li>Run <code>npm run dev:sso</code> in another terminal.</li>
			<li>Reload this page.</li>
		</ol>
		<p>See <code>wiki/private-docs.md</code> for how production SSO works.</p>`,
		{ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': NO_STORE } }
	);
}
