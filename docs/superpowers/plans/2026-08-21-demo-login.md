# Demo Login (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An env-gated `/demo-login` route in the template that plays the customer's SSO endpoint, so the Vercel demo (and any customer staging deploy) gets a working sign-in with three fake personas — without touching the guard.

**Architecture:** One new on-demand route signs the same handoff JWT `tests/mock-sso/server.mjs` signs, then redirects into the existing `/auth/callback`. Zero changes to `src/middleware.ts` or `src/lib/auth/` — the demo exercises the real guard, callback and session issuance. Gated on `DOCS_UNSAFE_DEMO_LOGIN` **and** `authConfigured()`, both required; a fork gets an inert file. Spec: `docs/superpowers/specs/2026-08-21-demo-login-and-monorepo-design.md` (read it first — especially the attack that justifies the `UNSAFE` name).

**Tech Stack:** Astro 6 (`.astro` on-demand route, `astro:env/server`), `jose` (already a dependency), `node --test`, Playwright.

**Branch:** already on `pa-claude/demo-login-private-docs-e4f30b` in a worktree. Commit per task; PR at the end.

**Read before starting:** `wiki/private-docs.md` (the constraints), `src/config/auth.mjs` (the config/lib split this plan copies), `src/pages/auth/logout.ts` (route style).

---

### Task 1: Pure demo-login logic (`src/lib/demo-login.mjs`)

The personas and validation rules, importable by `node --test`. No `astro:env`
import — that is the whole point of the `src/lib/` vs `src/config/` split
documented at the top of `src/config/auth.mjs`.

> **Amended after code review.** Four changes landed on top of the code below,
> and later tasks assume them: the redirect check is
> **`parseDemoRedirectUri(value, requestOrigin)` returning `URL | null`** (not
> a boolean — the caller must redirect to the *parsed* href, never the raw
> input, which is how CR/LF in a query value becomes a 500 instead of a clean
> refusal); it **rejects non-http(s) schemes**, mirroring `parseSsoUrl` in
> `src/config/auth.mjs`, because `blob:http://origin/x` shares the origin;
> the persona field `describes` is renamed **`description`**; and the sitemap
> assertion moved to `tests/private-leaks.test.mjs`, which already owns
> build-output tests, so `node --test tests/demo-login.test.mjs` is green
> without a build.

**Files:**
- Create: `tests/demo-login.test.mjs`
- Create: `src/lib/demo-login.mjs`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/demo-login.test.mjs`:

```js
/**
 * Unit tests for the demo login's pure logic.
 *
 * `/demo-login` mints real handoff tokens when enabled, so what these tests
 * pin down is the refusals: an unknown persona id must never reach a JWT, a
 * cross-origin `redirect_uri` must never become a redirect target (it would be
 * an open redirector handing a signed token to an arbitrary site), and the
 * flag must not answer to creative spellings.
 *
 * Run:  node --test tests/demo-login.test.mjs
 * (The sitemap test at the end needs a build; `npm test` provides one.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	personas,
	findPersona,
	isDemoFlagEnabled,
	isDemoRedirectUri,
} from '../src/lib/demo-login.mjs';
import { staticDir } from './helpers/static-dir.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

test('every persona id resolves to itself', () => {
	for (const persona of personas) {
		assert.equal(findPersona(persona.id), persona);
	}
});

test('unknown, empty and non-string ids resolve to null', () => {
	for (const id of ['initech', 'ACME', ' acme', '', undefined, null, 7, ['acme']]) {
		assert.equal(findPersona(id), null, String(id));
	}
});

test('persona orgs name real folders under src/content/org-docs/', () => {
	// The demo signs `orgs` claims; the guard compares them byte-verbatim to
	// folder names (wiki/private-docs.md). A persona pointing at a folder that
	// does not exist demos an empty section and looks like a broken feature.
	const folders = readdirSync(join(ROOT, 'src/content/org-docs'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	for (const persona of personas) {
		for (const org of persona.orgs) {
			assert.ok(folders.includes(org), `persona "${persona.id}" names missing org "${org}"`);
		}
	}
});

test('at least one persona demonstrates each side of org isolation', () => {
	// The demo's job is showing that Acme cannot read Globex. That needs two
	// personas in different single orgs, plus one in none.
	assert.ok(personas.some((p) => p.orgs.length === 1 && p.orgs[0] === 'acme'));
	assert.ok(personas.some((p) => p.orgs.length === 1 && p.orgs[0] === 'globex'));
	assert.ok(personas.some((p) => p.orgs.length === 0));
});

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

test('the flag answers only to its two documented spellings', () => {
	assert.equal(isDemoFlagEnabled('1'), true);
	assert.equal(isDemoFlagEnabled('true'), true);
	for (const value of ['', '0', 'false', 'TRUE', 'True', 'yes', 'on', ' 1', undefined, null, 1, true]) {
		assert.equal(isDemoFlagEnabled(value), false, String(value));
	}
});

// ---------------------------------------------------------------------------
// redirect_uri
// ---------------------------------------------------------------------------

const ORIGIN = 'http://localhost:4321';

test('a same-origin absolute redirect_uri is accepted', () => {
	assert.equal(isDemoRedirectUri('http://localhost:4321/auth/callback', ORIGIN), true);
	// The base path rides in the path, not the origin, so a subpath deployment
	// passes the same check.
	assert.equal(isDemoRedirectUri('http://localhost:4321/docs/auth/callback', ORIGIN), true);
});

test('anything not same-origin is refused', () => {
	for (const value of [
		'https://evil.example/auth/callback', // wrong host
		'http://localhost:9999/auth/callback', // wrong port
		'https://localhost:4321/auth/callback', // wrong scheme, so wrong origin
		'//evil.example/auth/callback', // protocol-relative: not absolute, URL() throws
		'/auth/callback', // relative: URL() throws
		'javascript:alert(1)', // no origin to match
		'not a url',
		'',
		undefined,
		null,
		7,
	]) {
		assert.equal(isDemoRedirectUri(value, ORIGIN), false, String(value));
	}
});

// ---------------------------------------------------------------------------
// Build output (needs `npm run build` first; `npm test` runs one)
// ---------------------------------------------------------------------------

test('the sitemap does not reference /demo-login', () => {
	// `/demo-login` is a *static* pathname with `prerender = false` — exactly
	// the shape `@astrojs/sitemap` advertises unless filtered, because it never
	// consults `isPrerendered` (measured; see wiki/private-docs.md). The filter
	// lives in `astro.config.mjs`; this pins it.
	const STATIC = staticDir(ROOT);
	const files = readdirSync(STATIC).filter((file) => /^sitemap.*\.xml$/.test(file));
	assert.ok(files.length > 0, 'no sitemap files found');
	for (const file of files) {
		const xml = readFileSync(join(STATIC, file), 'utf8');
		assert.ok(!xml.includes('demo-login'), `${file} advertises /demo-login`);
	}
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/demo-login.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/demo-login.mjs'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/demo-login.mjs`:

```js
/**
 * Pure logic for the demo login — the persona list and the two validation
 * rules `/demo-login` applies. See "The demo login" in wiki/private-docs.md.
 *
 * No `astro:env` import, the same split `src/config/auth.mjs` documents: this
 * stays importable from `node --test` and from `astro.config.mjs`, while the
 * env-reading gate lives in `src/config/demo-login.mjs`.
 */

/**
 * The fake readers the demo offers. `orgs` values are folder names under
 * `src/content/org-docs/`, compared byte-verbatim by the guard — the same
 * contract a real SSO token is under (wiki/private-docs.md). A customer who
 * keeps the demo enabled on a staging deployment edits this list to match
 * their own org folders; `tests/demo-login.test.mjs` fails if a persona names
 * a folder that does not exist.
 *
 * Three on purpose: org isolation is half the feature, and it takes a reader
 * in Acme, a reader in Globex and a reader in neither to see it — Acme's
 * persona reads `/private/orgs/acme/` and gets a bare 404 on Globex's.
 */
export const personas = [
	{
		id: 'acme',
		name: 'Dana Reed',
		email: 'dana@acme.test',
		orgs: ['acme'],
		describes: 'Acme member — private docs plus the Acme section, 404 on Globex',
	},
	{
		id: 'globex',
		name: 'Sam Patel',
		email: 'sam@globex.test',
		orgs: ['globex'],
		describes: 'Globex member — private docs plus the Globex section, 404 on Acme',
	},
	{
		id: 'no-org',
		name: 'Alex Kim',
		email: 'alex@example.test',
		orgs: [],
		describes: 'No orgs — private docs only, no org sections in the sidebar',
	},
];

/**
 * The persona for a `?as=` value, or `null`. The raw query value is never
 * placed into a JWT — only a persona from the list above is signed.
 *
 * @param {unknown} id
 * @returns {(typeof personas)[number] | null}
 */
export function findPersona(id) {
	if (typeof id !== 'string' || id === '') return null;
	return personas.find((persona) => persona.id === id) ?? null;
}

/**
 * Is `DOCS_UNSAFE_DEMO_LOGIN` set to one of its two documented spellings?
 *
 * Deliberately not a general truthiness check: this flag makes private
 * content world-readable (see wiki/private-docs.md), so `"TRUE"`, `"yes"` and
 * friends stay off rather than being helpfully accepted. The documented
 * values are the only values.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDemoFlagEnabled(value) {
	return value === '1' || value === 'true';
}

/**
 * Is `value` usable as the demo's redirect target — an absolute URL on the
 * same origin as the request?
 *
 * Without this check `/demo-login` is an open redirector that hands a freshly
 * signed handoff token to any site named in the query string. The mock SSO
 * server (`tests/mock-sso/server.mjs`) deliberately skips the equivalent
 * check and says why — it exists to prove the round trip, not to be deployed.
 * This route is deployed, so it validates, and in doing so models what a
 * customer's real endpoint should do: check `redirect_uri` against an
 * allowlist before redirecting to it.
 *
 * @param {unknown} value
 * @param {string} requestOrigin `Astro.url.origin` — the same origin the
 *   middleware built the `redirect_uri` from, so a legitimate round trip
 *   always matches, localhost quirks and all.
 * @returns {boolean}
 */
export function isDemoRedirectUri(value, requestOrigin) {
	if (typeof value !== 'string' || value === '') return false;
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		return false;
	}
	return parsed.origin === requestOrigin;
}
```

- [ ] **Step 4: Run the tests again**

Run: `node --test tests/demo-login.test.mjs`
Expected: all tests PASS **except** `the sitemap does not reference /demo-login`,
which needs a build — it may pass vacuously against a stale `dist/` (the route
does not exist yet, so no sitemap mentions it) or fail with "No static build
output found" on a clean checkout. Either is fine at this point; `npm test` in
Task 7 is the binding run.

- [ ] **Step 5: Commit**

```bash
git add tests/demo-login.test.mjs src/lib/demo-login.mjs
git commit -m "feat: demo-login personas and validation rules (EK-2373)"
```

---

### Task 2: The env gate (`src/config/demo-login.mjs` + env schema)

**Files:**
- Modify: `astro.config.mjs` (env schema block, ~line 90)
- Create: `src/config/demo-login.mjs`

- [ ] **Step 1: Add the env var to the schema**

In `astro.config.mjs`, inside `env: { schema: { … } }`, after the
`DOCS_SESSION_SECRET` line:

```js
			DOCS_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
			// Turns /demo-login into a working sign-in that accepts ANYONE. For the
			// template's own demo deployment and for staging sites evaluating the
			// feature — never for a site with real private content. The name is the
			// warning; the attack it abbreviates is in wiki/private-docs.md.
			DOCS_UNSAFE_DEMO_LOGIN: envField.string({ context: 'server', access: 'secret', optional: true }),
```

- [ ] **Step 2: Create the gate**

Create `src/config/demo-login.mjs`:

```js
/**
 * The demo login's env gate. Server code only — it imports `astro:env/server`,
 * so neither `astro.config.mjs` nor the `node --test` suites can import it;
 * the pure logic lives in `src/lib/demo-login.mjs` for exactly that reason
 * (the split `src/config/auth.mjs` documents).
 */
import { DOCS_UNSAFE_DEMO_LOGIN } from 'astro:env/server';
import { authConfigured } from './auth.mjs';
import { isDemoFlagEnabled } from '../lib/demo-login.mjs';

/**
 * Is the demo login live? Two conditions, both required, checked
 * independently:
 *
 * - The flag, in one of its two documented spellings. Unset — every fork,
 *   every ordinary deployment — means `/demo-login` answers the same bare 404
 *   as everything else the auth surface refuses.
 * - `authConfigured()`, because the token this route signs is verified by
 *   `/auth/callback` with `DOCS_SSO_SECRET`. A picker that hands out tokens
 *   nothing can verify would be a dead end wearing a working UI.
 */
export function demoLoginConfigured() {
	return isDemoFlagEnabled(DOCS_UNSAFE_DEMO_LOGIN) && authConfigured();
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: 0 errors, 0 warnings, 0 hints (the schema entry is what makes the
`astro:env/server` import resolve; if `DOCS_UNSAFE_DEMO_LOGIN` is reported
missing, the schema edit didn't take).

- [ ] **Step 4: Commit**

```bash
git add astro.config.mjs src/config/demo-login.mjs
git commit -m "feat: env gate for the demo login (EK-2373)"
```

---

### Task 3: The route (`src/pages/demo-login.astro`)

**Files:**
- Create: `src/pages/demo-login.astro`
- Modify: `.env.test` (add the flag, so dev/preview servers started from it have the route live)

> **Carried in from the Task 2 review.** `demoLoginConfigured()` returning true
> means *configured*, not *signing will succeed*: `authConfigured()` only checks
> that `DOCS_SSO_SECRET` is a non-empty string, so a truncated or
> whitespace-only secret passes the gate and then fails inside `jose`. Wrap the
> `SignJWT(...).sign()` call in a try/catch and treat a failure as a refusal —
> log at error level and fall through to the explanation page with a 500-free
> response. An unhandled throw here is a stack trace on the sign-in path, which
> is precisely the failure mode `src/config/auth.mjs` argues against.

- [ ] **Step 1: Add the flag to `.env.test`**

Append to `.env.test`:

```
# The demo login is on for the test build and preview server: the Playwright
# suite drives /demo-login directly (tests/visual/demo-login.spec.mjs). The
# flag's off-state is covered at the unit level (tests/demo-login.test.mjs);
# the mock SSO server remains DOCS_SSO_URL here, so the existing auth specs
# keep exercising the customer-endpoint round trip unchanged.
DOCS_UNSAFE_DEMO_LOGIN=1
```

- [ ] **Step 2: Create the route**

Create `src/pages/demo-login.astro`:

```astro
---
/**
 * The demo sign-in: this route plays the part the customer's product plays in
 * production, so the template can be demonstrated (and evaluated on a staging
 * deploy) with no real SSO endpoint behind it. It is the deployable
 * equivalent of `tests/mock-sso/server.mjs`, plus the persona picker and the
 * `redirect_uri` validation a deployed endpoint cannot skip.
 *
 * Point `DOCS_SSO_URL` at this route's own absolute URL and set
 * `DOCS_UNSAFE_DEMO_LOGIN=1`, and the ordinary flow does the rest: the
 * middleware redirects here with `redirect_uri` and `state`, a persona link
 * signs the same handoff JWT a real product would, and `/auth/callback`
 * verifies it none the wiser. Nothing in `src/middleware.ts` or
 * `src/lib/auth/` knows this route exists — the demo exercises the real
 * guard, the real callback and the real session issuance, which is the point.
 *
 * **This sign-in accepts anyone.** With the flag set on a site holding real
 * private content, that content is world-readable — the attack is spelled out
 * in wiki/private-docs.md, and no check in this file prevents it. The flag
 * staying unset is the entire defence, which is why it is named UNSAFE, why
 * the gate below fails to the same bare 404 as the rest of the auth surface,
 * and why every token issued logs at error level.
 */
import { authSecrets } from '../config/auth.mjs';
import { demoLoginConfigured } from '../config/demo-login.mjs';
import { personas, findPersona, parseDemoRedirectUri } from '../lib/demo-login.mjs';
import { withBase, NO_STORE } from '../lib/auth/http.mjs';
import { SignJWT } from 'jose';

// Never prerendered. A static build of this page could not read the query
// string or sign a fresh token — and the middleware's isPrerendered refusal
// does not cover this route (it is outside the guarded prefix), so the flag
// has to be here.
export const prerender = false;

// The two refusals below inline the guard's bare 404 rather than importing
// `notFound()` from `src/lib/auth/http.mjs`, for the reason
// `src/pages/private/[...slug].astro` documents: `astro check` does not
// analyse the body of a top-level early return in Astro frontmatter, so a
// symbol referenced only there is reported as an unused import.
if (!demoLoginConfigured()) {
	return new Response('<!doctype html><title>404</title><h1>404 — Not found</h1>', {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': NO_STORE },
	});
}

// `demoLoginConfigured()` implies `authConfigured()` implies this is set; the
// explicit check narrows the type without a non-null assertion, for the reason
// `/auth/callback` gives at its own secret lookup.
const ssoSecret = authSecrets.sso;
if (!ssoSecret) {
	return new Response('<!doctype html><title>404</title><h1>404 — Not found</h1>', {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': NO_STORE },
	});
}

// Everything below varies on the query string and mints credentials — nothing
// here may be cached.
Astro.response.headers.set('cache-control', NO_STORE);

const redirectUri = Astro.url.searchParams.get('redirect_uri');
const state = Astro.url.searchParams.get('state');

// Validation order (see the design spec): round-trip parameters first, then
// the persona. `roundTrip` is null unless `redirect_uri` parses to a
// same-origin http(s) URL and `state` is non-empty — and it carries the
// *parsed* target plus the narrowed state, so neither the signing branch nor
// the template can reach the raw nullable query values. That is the point of
// `parseDemoRedirectUri` returning a URL rather than a boolean: redirecting to
// the raw string would hand `Location:` a value the parser had already
// normalised (CR/LF stripped, case folded), turning a hostile query parameter
// into a header the runtime refuses to write, instead of the clean refusal
// below.
//
// A request that fails this gets the explanation page whether or not it
// carries `?as=`; a token is only ever signed when every check passes.
const redirectTarget = parseDemoRedirectUri(redirectUri, Astro.url.origin);
const roundTrip =
	redirectTarget && typeof state === 'string' && state !== ''
		? { redirectTarget, state }
		: null;

// Set when the round trip and persona were both valid but signing failed, so
// the page can say the demo is misconfigured rather than silently re-offering
// a picker that cannot work.
let signingFailed = false;

if (roundTrip) {
	const persona = findPersona(Astro.url.searchParams.get('as'));
	if (persona) {
		// Same claims and lifetime as tests/mock-sso/server.mjs — the contract
		// documented in the README's sample endpoint. Five minutes, and the
		// reason is worth keeping: `state` binds the token to this round trip
		// but does not stop a stolen token being replayed; the short exp is
		// what limits that (wiki/private-docs.md, "The SSO handoff").
		//
		// Wrapped as defence in depth, not because a known input reaches the
		// catch. `demoLoginConfigured()` establishes only that the secret is a
		// non-empty string, so the worry was that a truncated or
		// whitespace-only `DOCS_SSO_SECRET` would fail here — measured against
		// jose 6, it does not: HS256 accepts a key of any non-zero length, and
		// no non-empty JS string encodes to zero bytes, so a single space
		// signs happily. The branch was reached in testing only by handing
		// `.sign()` an empty `Uint8Array` directly.
		//
		// It stays because that is a property of this jose version rather than
		// a guarantee, and because the cost of being wrong is asymmetric: an
		// unhandled rejection on the sign-in path is a stack trace where the
		// design calls for a stated failure.
		let token = null;
		try {
			token = await new SignJWT({
				email: persona.email,
				name: persona.name,
				orgs: persona.orgs,
				state: roundTrip.state,
			})
				.setProtectedHeader({ alg: 'HS256' })
				.setSubject(`demo-${persona.id}`)
				.setIssuedAt()
				.setExpirationTime('5m')
				.sign(new TextEncoder().encode(ssoSecret));
		} catch (error) {
			console.error(
				'[demo-login] could not sign the handoff token — check DOCS_SSO_SECRET:',
				error
			);
			signingFailed = true;
		}

		if (token) {
			// Error level on purpose: if this flag is ever on where it should
			// not be, this line is how production logs say so.
			console.error(
				`[demo-login] UNSAFE demo sign-in issued a handoff token for persona "${persona.id}". ` +
					'If this is not a demo or staging deployment, unset DOCS_UNSAFE_DEMO_LOGIN now.'
			);
			// A copy: `searchParams.set` mutates. `roundTrip` established
			// same-origin http(s), so this cannot leave the site.
			const target = new URL(roundTrip.redirectTarget);
			target.searchParams.set('token', token);
			return Astro.redirect(target.href);
		}
	}
}

// Three outcomes reach the page below, and they need different statuses.
//
// A signing failure is a deployment fault: say so with a 500, because a 200
// would tell an operator watching status codes that the demo works.
// A validation failure *with parameters present* is a refusal — a foreign
// `redirect_uri`, most likely — so 400. Absent parameters just mean somebody
// browsed here directly, which deserves directions and a plain 200.
if (signingFailed) {
	Astro.response.status = 500;
} else if (!roundTrip && (redirectUri !== null || state !== null)) {
	Astro.response.status = 400;
}

// Links prebuilt here so the template stays declarative. Values are echoed
// only out of a validated `roundTrip`, so the picker never propagates
// parameters it would refuse to act on.
const pickerLinks =
	roundTrip && !signingFailed
		? personas.map((persona) => ({
				...persona,
				href: `${Astro.url.pathname}?${new URLSearchParams({
					as: persona.id,
					redirect_uri: roundTrip.redirectTarget.href,
					state: roundTrip.state,
				})}`,
			}))
		: [];
---

<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<!-- Belt to the sitemap filter's braces: this page must not be indexed. -->
		<meta name="robots" content="noindex" />
		<title>Demo sign-in</title>
		<style>
			body {
				font-family: ui-sans-serif, system-ui, sans-serif;
				max-width: 34rem;
				margin: 4rem auto;
				padding: 0 1rem;
				line-height: 1.6;
				color: #1c1c1c;
				background: #fff;
			}
			@media (prefers-color-scheme: dark) {
				body {
					color: #e6e6e6;
					background: #17181c;
				}
				.warning {
					background: #3a2c14;
					border-color: #8a6d3b;
				}
				.persona {
					border-color: #3a3d45;
				}
			}
			.warning {
				background: #fdf3d7;
				border: 1px solid #e0c36e;
				border-radius: 0.5rem;
				padding: 0.75rem 1rem;
				font-size: 0.9rem;
			}
			.persona {
				display: block;
				border: 1px solid #d5d8de;
				border-radius: 0.5rem;
				padding: 0.75rem 1rem;
				margin: 0.75rem 0;
				text-decoration: none;
				color: inherit;
			}
			.persona:hover {
				border-color: #6e56cf;
			}
			.persona strong {
				display: block;
			}
			.persona span {
				font-size: 0.85rem;
				opacity: 0.75;
			}
		</style>
	</head>
	<body>
		<h1>Demo sign-in</h1>
		<p class="warning">
			This is a demonstration sign-in: it accepts anyone, no password asked. It
			exists so the template's private and per-org docs can be seen working,
			and must never be enabled on a site with real private content.
		</p>
		{
			signingFailed ? (
				<p>
					This demo sign-in is misconfigured: the handoff token could not be
					signed. Check <code>DOCS_SSO_SECRET</code> on the deployment — the
					server log names the underlying error.
				</p>
			) : roundTrip ? (
				<>
					<p>Pick a reader. Each one shows a different slice of the private docs:</p>
					{pickerLinks.map((persona) => (
						<a class="persona" href={persona.href} data-astro-prefetch="false">
							<strong>
								{persona.name} ({persona.email})
							</strong>
							<span>{persona.description}</span>
						</a>
					))}
				</>
			) : (
				<p>
					This sign-in only works as part of a round trip that starts at the
					docs site, so it needs parameters this request did not carry (or
					carried pointing somewhere else). Start from{' '}
					<a href={withBase('/private/')} data-astro-prefetch="false">
						the private docs
					</a>{' '}
					and you will be sent back here properly.
				</p>
			)
		}
	</body>
</html>
```

Notes for the implementer, so nothing gets "tidied":

- Astro escapes `{expression}` interpolations in templates, so persona fields
  and the `URLSearchParams` string need no manual `escapeHtml`.
- `data-astro-prefetch="false"` on every link that GETs a state-changing or
  round-trip URL — the wiki's prefetch section is the law here, and on this
  page it is **load-bearing, not documentation**. An earlier draft of this plan
  claimed it was "arguably redundant" because the page does not mount
  `<ClientRouter />`; that was wrong, and was measured wrong. Astro's prefetch
  is independent of view transitions — it ships as a `stage: 'page'` script
  that lands on every page in the project, and Starlight sets
  `prefetch: { prefetchAll: true }` with the default hover strategy.
  `/demo-login` does serve that script. Without the attribute, hovering a
  persona link fires a real GET that mints a token and completes the round trip
  through `/auth/callback`, signing the reader in as whichever persona their
  mouse crossed — the bug `69d9b0a` fixed elsewhere in this repo. Each link
  carries a comment saying so, matching the four existing ones.
- The persona links echo `redirect_uri`/`state` only out of a validated
  `roundTrip`, so the picker never propagates values it would refuse to act on.

- [ ] **Step 3: Verify against a dev server**

Start the dev server with the test env in one terminal (or backgrounded):

```bash
node --env-file=.env.test ./node_modules/.bin/astro dev --port 4321
```

Then (expected results in comments; `http://localhost:4321` origin is real
under `astro dev`):

```bash
# Direct visit, no params → 200 explanation page pointing at /private/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/demo-login
# → 200
curl -s http://localhost:4321/demo-login | grep -c "round trip"
# → 1 (explanation branch rendered)

# Params present and valid, no persona → 200 picker with three personas
curl -s "http://localhost:4321/demo-login?redirect_uri=http%3A%2F%2Flocalhost%3A4321%2Fauth%2Fcallback&state=teststate" | grep -c 'class="persona'
# → 3 — note the unterminated quote in the pattern. Astro appends a scoped
#   style hash to every class attribute in the file, so the rendered markup is
#   `class="persona astro-dtbjepfk"` and an exact `class="persona"` matches
#   nothing. (Playwright's `.persona` selector is unaffected — a CSS class
#   selector matches one class among several.)

# Valid persona → 302 with a token, back to the callback
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:4321/demo-login?as=acme&redirect_uri=http%3A%2F%2Flocalhost%3A4321%2Fauth%2Fcallback&state=teststate"
# → 302 http://localhost:4321/auth/callback?token=eyJ…

# Unknown persona → 200 picker again (no token, ever)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4321/demo-login?as=initech&redirect_uri=http%3A%2F%2Flocalhost%3A4321%2Fauth%2Fcallback&state=teststate"
# → 200

# Cross-origin redirect_uri → 400 refusal, no redirect
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4321/demo-login?as=acme&redirect_uri=https%3A%2F%2Fevil.example%2Fx&state=teststate"
# → 400
```

Then prove the signing-failure branch, which is the one the Task 2 review
added. **It has no reachable input**, and that was measured rather than
assumed: `jose` 6 accepts an HS256 key of any non-zero length, and every
non-empty JS string encodes to at least one UTF-8 byte, so no value that
passes `authConfigured()` can make `.sign()` throw. A single space signs
happily.

Demonstrate the branch by temporarily handing `.sign()` an empty key, then
revert:

```bash
# In src/pages/demo-login.astro, temporarily replace
#   .sign(new TextEncoder().encode(ssoSecret));
# with
#   .sign(new Uint8Array(0));
node --env-file=.env.test ./node_modules/.bin/astro dev --port 4321
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4321/demo-login?as=acme&redirect_uri=http%3A%2F%2Flocalhost%3A4321%2Fauth%2Fcallback&state=teststate"
# → 500, page says "misconfigured", server log carries
#   "Zero-length key is not supported", client gets no stack trace
```

Revert the edit and re-run the valid-persona request to confirm 302 is back.
What must be demonstrated is the branch, not a particular input: **a signing
failure renders the page and logs, rather than throwing.**

Also confirm the off-state: stop the server, start it *without* the env file
(`npx astro dev --port 4321`), and:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/demo-login
# → 404
```

Stop the dev server.

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: 0 errors, 0 warnings, 0 hints.

- [ ] **Step 5: Commit**

```bash
git add src/pages/demo-login.astro .env.test
git commit -m "feat: /demo-login persona picker, gated on DOCS_UNSAFE_DEMO_LOGIN (EK-2373)"
```

---

### Task 4: Sitemap filter and env-overridable `site`

**Files:**
- Modify: `astro.config.mjs` (the `loadEnv` destructure ~line 33, `site:` ~line 68, the `sitemap(…)` call ~line 100)

- [ ] **Step 1: Extend the `loadEnv` destructure**

```js
const { DOCS_SSO_URL, DOCS_SSO_SECRET, DOCS_SESSION_SECRET, DOCS_SITE_URL } = loadEnv(
	process.env.NODE_ENV ?? 'production',
	process.cwd(),
	''
);
```

- [ ] **Step 2: Make `site` env-overridable**

Replace:

```js
	// TODO: replace with your deployed site URL. Required for sitemap and llms-txt
	// to emit absolute URLs.
	site: 'https://example.com',
```

with:

```js
	// TODO: replace with your deployed site URL (or set DOCS_SITE_URL in the build
	// environment). Required for sitemap and llms-txt to emit absolute URLs.
	site: DOCS_SITE_URL || 'https://example.com',
```

- [ ] **Step 3: Extend the sitemap filter**

Replace the existing `sitemap({ filter: … })` call (keep its comment block, and
append to it):

```js
		// /demo-login is filtered for the same reason with one difference: it is a
		// *static* pathname (`src/pages/demo-login.astro`), exactly the shape the
		// sitemap advertises unless told otherwise — the route-shape defence the
		// /private/ routes get for free does not exist here.
		sitemap({ filter: (page) => !page.includes('/private/') && !page.includes('/demo-login') }),
```

- [ ] **Step 4: Build and run the sitemap test**

```bash
npm run build
node --test tests/private-leaks.test.mjs
```

Expected: all PASS, including the `/demo-login` sitemap assertion (it lives in
`tests/private-leaks.test.mjs` alongside the `/private/` one — see the Task 1
amendment). Until this task it passed vacuously, because there was no route to
advertise; from here it has something to catch.

To see the filter is doing work, remove `&& !page.includes('/demo-login')`,
rebuild, and confirm the test FAILS naming `/demo-login`; then restore it and
rebuild. Do this — a filter that was never observed failing is a filter you do
not know is wired up.

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs
git commit -m "feat: keep /demo-login out of the sitemap; allow DOCS_SITE_URL to set site (EK-2373)"
```

---

### Task 5: Playwright round trip (`tests/visual/demo-login.spec.mjs`)

**Files:**
- Create: `tests/visual/demo-login.spec.mjs`

- [ ] **Step 1: Write the spec**

Create `tests/visual/demo-login.spec.mjs`:

```js
/**
 * The demo login's round trip, in a real browser against the preview server.
 *
 * The preview's `DOCS_SSO_URL` still points at the mock SSO server — the
 * existing auth suite proves that path and keeps doing so. These tests drive
 * `/demo-login` directly instead, which is exactly what a demo visitor's
 * browser does after the middleware redirect; the middleware does not care
 * where the token came from, only that `DOCS_SSO_SECRET` signed it.
 *
 * Getting a valid `state` without following the redirect: `page.request`
 * shares the browser context's cookie jar, so a `maxRedirects: 0` GET of
 * `/private/` makes the middleware set the state cookie right where the
 * browser will present it, and hands back the nonce to put in the URL.
 *
 * Nothing here is tagged `@screenshot`, so all of it runs in CI.
 */
import { test, expect } from '@playwright/test';

/** See tests/visual/auth.spec.mjs — the marker for "private content rendered". */
const SENTINEL = 'EKLINE-PRIVATE-SENTINEL';

const CALLBACK = 'http://localhost:4321/auth/callback';

/** Start the SSO round trip without leaving the site; return the state nonce. */
async function beginRoundTrip(page) {
	const response = await page.request.get('/private/', { maxRedirects: 0 });
	expect(response.status()).toBe(302);
	const cookie = (await page.context().cookies()).find((c) => c.name === 'docs_sso_state');
	expect(cookie).toBeTruthy();
	// Astro percent-encodes cookie values; the JSON shape is StateCookie in
	// src/middleware.ts.
	const { state } = JSON.parse(decodeURIComponent(cookie.value));
	expect(typeof state).toBe('string');
	return state;
}

function demoLoginUrl(params) {
	return `/demo-login?${new URLSearchParams(params)}`;
}

test('the picker lists the personas and leads with the warning', async ({ page }) => {
	const state = await beginRoundTrip(page);
	await page.goto(demoLoginUrl({ redirect_uri: CALLBACK, state }));
	await expect(page.locator('.warning')).toContainText('accepts anyone');
	await expect(page.locator('a.persona')).toHaveCount(3);
});

test('choosing a persona lands the reader on the private docs, org isolation intact', async ({
	page,
}) => {
	const state = await beginRoundTrip(page);
	await page.goto(demoLoginUrl({ as: 'acme', redirect_uri: CALLBACK, state }));

	// Through /auth/callback and back to the page the round trip started at.
	await expect(page).toHaveURL(/\/private\/$/);
	await expect(page.locator('body')).toContainText(SENTINEL);

	// Dana is in Acme…
	const acme = await page.request.get('/private/orgs/acme/');
	expect(acme.status()).toBe(200);
	expect(await acme.text()).toContain(SENTINEL);

	// …and not in Globex: the same bare 404 an org that does not exist gets.
	const globex = await page.request.get('/private/orgs/globex/');
	expect(globex.status()).toBe(404);
	expect(await globex.text()).not.toContain(SENTINEL);
});

test('a persona with no orgs sees private docs but no org section', async ({ page }) => {
	const state = await beginRoundTrip(page);
	await page.goto(demoLoginUrl({ as: 'no-org', redirect_uri: CALLBACK, state }));
	await expect(page).toHaveURL(/\/private\/$/);
	await expect(page.locator('body')).toContainText(SENTINEL);

	const acme = await page.request.get('/private/orgs/acme/');
	expect(acme.status()).toBe(404);
});

test('a cross-origin redirect_uri is refused, token unsent', async ({ page }) => {
	const state = await beginRoundTrip(page);
	const response = await page.goto(
		demoLoginUrl({ as: 'acme', redirect_uri: 'https://evil.example/steal', state })
	);
	// Refused on this page — not redirected anywhere, no token in any URL.
	expect(response.status()).toBe(400);
	expect(page.url()).toContain('/demo-login');
	expect(page.url()).not.toContain('token=');
});

test('an unknown persona never signs a token', async ({ page }) => {
	const state = await beginRoundTrip(page);
	const response = await page.goto(
		demoLoginUrl({ as: 'initech', redirect_uri: CALLBACK, state })
	);
	// Back to the picker, offering the real personas.
	expect(response.status()).toBe(200);
	await expect(page.locator('a.persona')).toHaveCount(3);
	// And no session came into being.
	const session = (await page.context().cookies()).find((c) => c.name === 'docs_session');
	expect(session).toBeUndefined();
});

test('a direct visit with no parameters gets directions, not an error', async ({ page }) => {
	const response = await page.goto('/demo-login');
	expect(response.status()).toBe(200);
	await expect(page.locator('body')).toContainText('round trip');
	await expect(page.locator(`a[href$="/private/"]`)).toBeVisible();
});
```

- [ ] **Step 2: Run the visual suite**

Run: `npm run test:visual`
Expected: the six new tests PASS on both projects (desktop and mobile), and
every pre-existing auth/API-reference test still passes. If `reuseExistingServer`
grabs a stale preview from Task 3's manual runs, stop that server first — the
config's own server is the one with the right env (see the warning in
`playwright.config.mjs`).

- [ ] **Step 3: Commit**

```bash
git add tests/visual/demo-login.spec.mjs
git commit -m "test: browser coverage for the demo login round trip (EK-2373)"
```

---

### Task 6: Documentation and version

**Files:**
- Modify: `.env.example` (append), `README.md` (two places), `wiki/private-docs.md` (new section), `CHANGELOG.md` (new entry), `package.json` (version)

- [ ] **Step 1: `.env.example`**

Append:

```
#
# ── Demo login (UNSAFE) ─────────────────────────────────────────────────────
# DOCS_UNSAFE_DEMO_LOGIN=1 turns /demo-login into a working sign-in that
# accepts ANYONE — a persona picker, no password. It exists for the template's
# own demo deployment and for staging sites evaluating private docs before the
# real SSO endpoint is built. On a site holding real private content it makes
# that content world-readable; the attack is spelled out in
# wiki/private-docs.md. Point DOCS_SSO_URL at this site's own /demo-login
# (absolute URL) and the ordinary round trip does the rest.
# DOCS_UNSAFE_DEMO_LOGIN=1
```

- [ ] **Step 1b: `.env.example` — document `DOCS_SITE_URL`**

Append, after the demo-login block:

```
#
# ── Site URL ────────────────────────────────────────────────────────────────
# The deployed URL, used by the sitemap and llms-txt to emit absolute URLs.
# Set it here or replace the `site` placeholder in astro.config.mjs — they are
# the same setting, and the env var wins. Useful when one build serves several
# environments (a preview deployment and production have different URLs).
# DOCS_SITE_URL=https://docs.example.com
```

- [ ] **Step 1c: `README.md` and `CLAUDE.md` — `site` now has two paths**

Three lines currently describe only the config-file path, and the one they
omit is the path the template's own deployment uses. Update each:

- `README.md` ~line 48, the pre-wired table row: **Site URL** … change the
  right-hand cell to `` `site` field in `astro.config.mjs`, or the
  `DOCS_SITE_URL` env var ``.
- `README.md` ~line 165, "**Before deploying, set the `site` URL** in
  `astro.config.mjs`" — append "or set `DOCS_SITE_URL` in the build
  environment".
- `CLAUDE.md` ~line 61, "`site` … downstream users must replace it" — append
  the same clause.

- [ ] **Step 2: `README.md` — the live-preview paragraph**

Replace:

```markdown
The preview is public docs only — private docs are deliberately not configured
there, so there is no live sign-in to try. To see the logged-in experience, run
it locally: copy `.env.example` to `.env`, `npm run dev:sso` in one terminal,
`npm run dev` in another, then click **Log in**.
```

with:

```markdown
The preview has the **demo login** enabled — click **Log in**, pick a persona,
and see private and per-org docs work (try Acme's reader on Globex's section
for the 404). It is the same template with `DOCS_UNSAFE_DEMO_LOGIN=1` set; see
*Try it without wiring SSO* below. To run the logged-in experience locally:
copy `.env.example` to `.env`, `npm run dev:sso` in one terminal, `npm run dev`
in another, then click **Log in**.
```

- [ ] **Step 3: `README.md` — the demo-login subsection**

After the paragraph ending `…and `npm run dev` has a working sign-in.` (the
mock-SSO reference, ~line 124) and before `Before relying on any of this…`,
insert:

````markdown
#### Try it without wiring SSO

A deployed equivalent of the mock exists in the template itself: set

```
DOCS_UNSAFE_DEMO_LOGIN=1
DOCS_SSO_URL=https://<your-deployment>/demo-login
```

(plus the two secrets) and `/demo-login` becomes a persona picker that signs
the handoff token your product would sign — three fake readers, one per org
plus one with none, so org isolation is visible in two clicks. This is how the
live preview above works.

The name is the warning: **this sign-in accepts anyone.** Use it on demo and
staging deployments that hold no real private content, and unset it the moment
your real `DOCS_SSO_URL` exists. `wiki/private-docs.md` has the details, and
the personas live in `src/lib/demo-login.mjs` if your staging site's org
folders differ from the shipped examples.
````

- [ ] **Step 4: `wiki/private-docs.md` — the demo-login section**

Insert a new section after the `## The SSO handoff` section (after its final
paragraph about handoff lifetime, before `## What the customer's login flow
has to preserve`):

```markdown
## The demo login

`src/pages/demo-login.astro` plays the product's part in the handshake above:
a persona picker that signs the same handoff JWT, so the template can be
demonstrated — and evaluated on a staging deploy — before any real SSO
endpoint exists. Enable it by pointing `DOCS_SSO_URL` at this site's own
`/demo-login` and setting `DOCS_UNSAFE_DEMO_LOGIN=1`. It is off unless both
that flag (spelled `1` or `true`, nothing else) and `authConfigured()` hold;
either missing and the route answers the same bare 404 as the rest of the
auth surface.

**The name is not decoration.** If the flag is enabled on a site holding real
private content, that content is readable by anyone — and not only via the
picker. The attacker does not need `DOCS_SSO_URL` to point at the demo route:
they visit `/private/` so the middleware sets their state cookie, read their
own cookie (`HttpOnly` stops other sites, not the browser's owner — see the
`state` note above), and call `/demo-login?as=…&redirect_uri=…&state=…`
directly. The token is signed with the site's real `DOCS_SSO_SECRET`, so
`/auth/callback` accepts it. Nothing but the flag staying unset prevents this,
which is why the flag carries the warning in its name and why the route logs
at error level on every token it issues.

What the route does defend, it defends as a model for your real endpoint:

- **`redirect_uri` must be same-origin with the request**, or the page refuses
  (400). Without that check the route is an open redirector that hands a
  freshly signed token to any site named in the query string. The mock SSO
  server deliberately skips this and says why; a deployed endpoint must not —
  yours should check `redirect_uri` against an allowlist too.
- **The `?as=` value never enters a token.** Only a persona from the list in
  `src/lib/demo-login.mjs` is signed; unknown ids re-render the picker.
- **`/demo-login` is filtered out of the sitemap** in `astro.config.mjs` and
  carries `noindex`. It is a *static* pathname with `prerender = false` —
  precisely the shape `@astrojs/sitemap` advertises unless filtered (see the
  route-shape note above), and unlike `/private/**` it cannot hide behind a
  dynamic route shape.

The personas name org folders byte-verbatim, under the same contract as a real
token's `orgs` claim (see the slugging section above). `tests/demo-login.test.mjs`
fails if a persona names a folder that does not exist.
```

- [ ] **Step 5: `CHANGELOG.md` and `package.json`**

In `package.json`, change `"version": "2.0.0"` to `"version": "2.1.0"`.

In `CHANGELOG.md`, insert after the intro paragraphs (before `## 2.0.0`):

```markdown
## 2.1.0

### Demo login

`/demo-login` — a persona picker that plays your product's part in the SSO
handshake, so the logged-in experience can be demonstrated and evaluated with
no real SSO endpoint behind it. Off unless `DOCS_UNSAFE_DEMO_LOGIN=1` *and*
the three `DOCS_*` variables are set; a deployment that does not opt in is
byte-for-byte unaffected, and the route answers 404. The name is the warning:
it accepts anyone, so it is for demo and staging deployments only — never a
site with real private content. See *The demo login* in `wiki/private-docs.md`.

Three fake readers ship with it (Acme, Globex, no-org — matching the example
org folders), so org isolation is visible in two clicks. Edit them in
`src/lib/demo-login.mjs`.

### Other

- `site` in `astro.config.mjs` can now come from a `DOCS_SITE_URL` env var, so one
  config serves deployments at different URLs. The placeholder default is
  unchanged.
```

- [ ] **Step 6: Verify docs build cleanly**

Run: `npm run check`
Expected: 0 errors. (Markdown edits can't fail the check, but the
`package.json` edit gets picked up by anything reading the version.)

- [ ] **Step 7: Commit**

```bash
git add .env.example README.md wiki/private-docs.md CHANGELOG.md package.json
git commit -m "docs: document the demo login; release 2.1.0 (EK-2373)"
```

---

### Task 7: Full local verification

No new files — this is the gate before the PR.

- [ ] **Step 1: The three suites, in order**

```bash
npm run check
```
Expected: 0 errors, 0 warnings, 0 hints.

```bash
npm test
```
Expected: all tests pass (88 from 2.0.0 plus the new `tests/demo-login.test.mjs`
set), including `the sitemap does not reference /demo-login` and the untouched
`private-leaks` suite — the demo route is server-rendered, so nothing about it
may appear in the static output.

```bash
npm run test:visual
```
Expected: all pass — 44 passing / 20 skipped from 2.0.0, plus the six demo
specs on two projects. Screenshot comparisons run locally (they are excluded
in CI; that is why this local run matters — see CLAUDE.md).

- [ ] **Step 2: Fix anything that fails, commit fixes, re-run until green.**

---

### Task 8: PR, preview verification, production

This task closes PR #8's open item as well as shipping the demo. The Vercel
steps need project access — pair with the user where the plan says so.

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin pa-claude/demo-login-private-docs-e4f30b
gh pr create --title "EK-2373 feat: demo login for the live preview (v2.1.0)" --body "$(cat <<'EOF'
**Jira:** EK-2373 follow-up · **Release:** 2.1.0

Adds an env-gated `/demo-login` persona picker so the live preview (and any
customer staging deploy) gets a working sign-in with three fake readers —
without touching the guard: no changes under `src/middleware.ts` or
`src/lib/auth/`, the demo exercises the real handshake end to end.

Off unless `DOCS_UNSAFE_DEMO_LOGIN=1` **and** auth is configured; every other
deployment is byte-for-byte unaffected. The name is the warning — the attack
it abbreviates is documented in `wiki/private-docs.md` (new section), along
with the same-origin `redirect_uri` check that keeps the route from being an
open redirector.

Design: `docs/superpowers/specs/2026-08-21-demo-login-and-monorepo-design.md`
(Phase 1 of two; Phase 2 — monorepo + hosted docs site — is a separate plan).

## Verification

- `npm run check` — 0 errors
- `npm test` — all passing, sitemap proven free of `/demo-login`
- `npm run test:visual` — all passing, incl. six new demo-login specs
- Vercel preview walkthrough — see checklist in the PR comments

Closes the open item from #8: `vercel.json` rewrites and `/private/**`
middleware reachability verified on a real Vercel deployment (results recorded
in `wiki/private-docs.md`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Configure Preview env vars (user, or `vercel` CLI if authenticated)**

Generate two fresh secrets — never the `.env.example` values, and two
*different* values (the `aud`-claim reason documented there):

```bash
openssl rand -base64 32   # DOCS_SSO_SECRET
openssl rand -base64 32   # DOCS_SESSION_SECRET
```

In the Vercel project, add for the **Preview** environment (the branch's
stable alias keeps `DOCS_SSO_URL` valid across pushes):

| Variable | Value |
| --- | --- |
| `DOCS_SSO_URL` | `https://<branch-alias>.vercel.app/demo-login` (find the alias on the deployment page) |
| `DOCS_SSO_SECRET` | first generated value |
| `DOCS_SESSION_SECRET` | second generated value |
| `DOCS_UNSAFE_DEMO_LOGIN` | `1` |
| `DOCS_SITE_URL` | `https://<branch-alias>.vercel.app` |

Redeploy the preview after setting them (env vars are runtime-read, but the
sidebar's login entry is derived at build time from `loadEnv` — a rebuild is
required for the header/sidebar to appear).

- [ ] **Step 3: Verify the two unknowns from PR #8 (decision gate)**

Against the branch-alias URL:

```bash
# 1. Does the middleware see /private/ at all, and what origin does it
#    advertise in redirect_uri?
curl -sI "https://<branch-alias>.vercel.app/private/" | grep -i '^location\|^cache-control'
```

Expected: `location: https://<branch-alias>.vercel.app/demo-login?redirect_uri=https%3A%2F%2F<branch-alias>.vercel.app%2Fauth%2Fcallback&state=…`
and `cache-control: private, no-store`.

- **If the `redirect_uri` origin is `localhost`** (the `@astrojs/node`
  behaviour the wiki documents): the Vercel adapter has the same
  `allowedDomains` gate. Consult the Astro configuration reference
  (https://docs.astro.build/en/reference/configuration-reference/) for the
  exact `security.allowedDomains` shape on the installed Astro version — per
  CLAUDE.md, the docs are consulted at change time, not recalled — then wire
  it from the already-loaded env in `astro.config.mjs` so it is not
  demo-specific:

  ```js
  	security: {
  		// Behind any proxy/platform that terminates TLS for us, Astro only
  		// trusts Host/X-Forwarded-Host when it matches this list; without it,
  		// redirect_uri is built on a loopback origin and sign-in cannot
  		// complete. See "Reverse proxies and redirect_uri" in
  		// wiki/private-docs.md.
  		allowedDomains: DOCS_SITE_URL ? [{ hostname: new URL(DOCS_SITE_URL).hostname }] : [],
  	},
  ```

  (Shape shown is indicative — confirm against the docs before committing.)
  Commit, push, re-verify.

```bash
# 2. The markdown twins still answer (vercel.json rewrites vs the adapter)
curl -s -H 'Accept: text/markdown' "https://<branch-alias>.vercel.app/" | head -3
```

Expected: markdown, not HTML. **If HTML:** the rewrites lost to the adapter's
routing config — remove the `rewrites` array from `vercel.json` (the `.md`
URLs still work; the feature degrades exactly as `wiki/private-docs.md`
describes), and record the measured outcome in the wiki's *Open:
`vercel.json` rewrites* section either way, retitling it from "Open".

- [ ] **Step 4: Walk the demo on the preview**

In a private browser window, on the branch-alias URL:

1. Header shows **Log in** (build-time `loadEnv` saw the vars) → click it.
2. `/private/` redirects to `/demo-login` → warning visible, three personas.
3. Sign in as **Dana Reed (Acme)** → land back on `/private/`, sidebar shows
   the private groups and the Acme section.
4. Navigate to the Acme org page → renders. Edit the URL to
   `/private/orgs/globex/` → bare 404.
5. **Log out** → back to signed-out header; `/private/orgs/acme/` now 302s.
6. Repeat sign-in as **Alex Kim (no orgs)** → private docs render, no org
   section in the sidebar.
7. `https://<branch-alias>.vercel.app/sitemap-0.xml` contains no `demo-login`
   and no `/private/`.

- [ ] **Step 5: Record outcomes and merge**

Update `wiki/private-docs.md`: the *Open: `vercel.json` rewrites* section gets
its measured answer (step 3.2), and — if `security.allowedDomains` proved
necessary — the *Reverse proxies* section gains one sentence saying Vercel
needs it too, with the config now in place. Commit, push, wait for CI, merge
the PR.

- [ ] **Step 6: Production env vars and final walkthrough (user)**

Same five variables in the **Production** environment, with production URLs:

| Variable | Value |
| --- | --- |
| `DOCS_SSO_URL` | `https://ekline-docs-template-astro.vercel.app/demo-login` |
| `DOCS_SSO_SECRET` | fresh `openssl rand -base64 32` — generate new ones for prod |
| `DOCS_SESSION_SECRET` | fresh `openssl rand -base64 32`, different value |
| `DOCS_UNSAFE_DEMO_LOGIN` | `1` |
| `DOCS_SITE_URL` | `https://ekline-docs-template-astro.vercel.app` |

Redeploy production (the merge deploy may have run before the vars existed —
if so, hit Redeploy). Repeat the Task 8.4 walkthrough against
`https://ekline-docs-template-astro.vercel.app/`. Done when a stranger with
the URL can see org isolation in two clicks.
