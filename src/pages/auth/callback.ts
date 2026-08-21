/**
 * The SSO handoff landing. Verifies the token the customer's product signed,
 * then swaps it for this site's own session cookie. The handoff token lives
 * only in this one redirect — it is never stored.
 *
 * `/auth/**` is deliberately outside the guard (`classifyPath` returns `auth`,
 * and `src/middleware.ts` passes it straight through): this endpoint is how a
 * session comes into existence, so guarding it would make sign-in impossible.
 * Everything it reads is therefore attacker-controlled — the `token` query
 * parameter and the unsigned state cookie both — and nothing here may assume
 * otherwise.
 */
import type { APIContext, APIRoute } from 'astro';
import {
	auth,
	authSecrets,
	authConfigured,
	sessionCookieAttributes,
} from '../../config/auth.mjs';
import { escapeHtml, withBase } from '../../lib/auth/http.mjs';
import { verifyHandoffToken, createSessionToken } from '../../lib/auth/tokens.mjs';
import {
	readStateCookie,
	writeStateCookie,
	clearStateCookie,
	type StateCookie,
} from '../../middleware';

export const prerender = false;

export const GET: APIRoute = async (context) => {
	// Fail closed in the same shape as the guard: an unconfigured site has no
	// sign-in endpoint, rather than one that reports a deployment fault.
	if (!authConfigured()) return new Response('Not found', { status: 404 });

	const token = context.url.searchParams.get('token');
	const stored = readStateCookie(context.cookies.get(auth.stateCookie)?.value);
	const returnTo = safeReturnTo(stored?.returnTo);

	if (!token || !stored) {
		return rejected(context, stored, 'The sign-in link is missing its token or state.', returnTo);
	}

	// No non-null assertions on the secrets, for the reason `src/middleware.ts`
	// gives at its own session lookup: `authConfigured()` above has established
	// both, and `verifyHandoffToken`/`createSessionToken` take the secret as
	// `unknown` and throw on an empty key. An `!` here would be the thing that
	// silences the compiler if `authConfigured()` ever stops implying it.
	let session;
	try {
		session = await verifyHandoffToken(token, {
			secret: authSecrets.sso,
			expectedState: stored.state,
		});
	} catch (error) {
		console.error('[auth] handoff token rejected:', error);
		return rejected(context, stored, 'The sign-in token was invalid or expired.', returnTo);
	}

	const value = await createSessionToken(session, {
		secret: authSecrets.session,
		ttlSeconds: auth.sessionTtlSeconds,
	});
	context.cookies.set(auth.sessionCookie, value, {
		...sessionCookieAttributes,
		maxAge: auth.sessionTtlSeconds,
	});
	// Success clears the state cookie — and with it the loop-guard counter.
	clearStateCookie(context);
	return context.redirect(returnTo);
};

/**
 * Only same-site paths; anything else falls back to the private index.
 *
 * An allowlist, not a denylist. The obvious spelling — "starts with `/`, but
 * not `//`" — admits `/"><script>…`, which breaks out of the `href` attribute
 * in `failure()` below. `returnTo` arrives from the unsigned state cookie, so
 * reaching a victim needs cookie-forcing first; that is a real position on a
 * docs site, not a theoretical one. Restricting the character set is cheaper
 * to get right than escaping, and nothing legitimate needs the rest: this
 * value is always a path this site generated.
 */
function safeReturnTo(value: string | undefined): string {
	// `withBase`, not a bare `/private/`. The value being replaced came from
	// `context.url.pathname` and therefore carries the configured `base`; the
	// fallback has to as well, or a reader whose state cookie is missing — a
	// bookmarked callback URL, an expired cookie, a second tab — finishes
	// signing in and lands on a 404 outside the site. `context.redirect()`
	// writes `Location` verbatim and applies no base of its own.
	const fallback = withBase('/private/');
	if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
	return /^\/[A-Za-z0-9/_\-.~%?=&]*$/.test(value) ? value : fallback;
}

/**
 * One failed round trip: count it, then say so.
 *
 * This endpoint is the only place that can tell a *failed* sign-in from a
 * redirect merely being issued, which is why the loop guard's counter is
 * incremented here rather than in the middleware. The middleware reads the
 * number and refuses once it is at `MAX_SSO_ATTEMPTS`; a successful callback
 * deletes the cookie, which resets it. Counting redirects instead put honest
 * readers on the error page after three logged-out clicks — see the comment on
 * `MAX_SSO_ATTEMPTS` in `src/middleware.ts` for the measured transcript.
 *
 * `state` and `returnTo` are written back untouched. The nonce is spent, but the
 * middleware overwrites both the moment it issues the next redirect, and
 * `readStateCookie` rejects a cookie missing either field — so a partial write
 * here would silently discard the increment it exists to make.
 *
 * Nothing is counted when there is no valid cookie to count on. That is not the
 * broken-SSO case the guard is for: the middleware writes the cookie
 * immediately before redirecting, so an endpoint that returns a bad token
 * returns it *with* the cookie present. A missing one means the round trip was
 * never started from this browser — a bookmarked callback URL, an expired
 * cookie, a browser refusing it — and inventing a counter for it would let any
 * unauthenticated GET to this endpoint push a reader towards the error page.
 */
function rejected(
	context: APIContext,
	stored: StateCookie | null,
	reason: string,
	returnTo: string
) {
	if (stored) writeStateCookie(context, { ...stored, attempts: stored.attempts + 1 });
	return failure(reason, returnTo);
}

function failure(reason: string, returnTo: string) {
	// The retry link restarts SSO via the middleware, which reads the counter
	// `rejected()` just raised — so a genuinely broken SSO endpoint reaches the
	// loop guard on the second retry rather than redirecting forever.
	//
	// `reason` is one of this file's own literals and `returnTo` has been
	// through `safeReturnTo`, so neither can carry markup — but escape anyway.
	// The alternative is that the safety of this string depends on a reader
	// tracing both arguments to their sources.
	return new Response(
		`<!doctype html><title>Sign-in failed</title>
		<h1>Sign-in failed</h1><p>${escapeHtml(reason)}</p>
		<p><a href="${escapeHtml(returnTo)}">Try again</a></p>`,
		{ status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);
}

