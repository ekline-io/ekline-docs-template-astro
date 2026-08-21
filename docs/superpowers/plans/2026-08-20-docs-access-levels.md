# Docs Access Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-enforced logged-in experience to the template: public docs stay static, private and per-org docs render on demand behind Astro middleware, authenticated via JWT-handoff SSO against the customer's product.

**Architecture:** Private content lives in separate content collections (`private-docs/`, `org-docs/<org>/`) rendered by on-demand routes under `/private/**` using Starlight's `<StarlightPage>` component. Astro middleware guards the prefix, validating a session cookie established by a Zendesk-style JWT handoff. Because private content never enters the static build, Pagefind/llms.txt/sitemap/`.md` routes cannot leak it — and tests assert that with sentinel strings.

**Tech Stack:** Astro 6 + Starlight 0.39, `@astrojs/node` (local/self-host) + `@astrojs/vercel` (Vercel builds), `jose` for JWT, `node --test` + Playwright.

**Spec:** `docs/superpowers/specs/2026-08-20-docs-access-levels-design.md`

**Conventions for every commit in this plan:** end the message with the trailer
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (repo rule; omitted from
the commit blocks below for brevity).

**Shared type used throughout (defined once here, referenced everywhere):**

```ts
type Session = {
  sub: string;
  email: string | null;
  name: string | null;
  orgs: string[]; // org slugs, matching folder names under src/content/org-docs/
};
```

---

## File map

| File | Responsibility |
| --- | --- |
| `tests/helpers/static-dir.mjs` (create) | Resolve the adapter-dependent static output dir |
| `astro.config.mjs` (modify) | Adapter selection, env schema, sidebar composition |
| `.env.example` (create) | Document the three env vars with local-dev values |
| `src/lib/auth/guards.mjs` (create) | Pure path classification (`classifyPath`) |
| `src/lib/auth/tokens.mjs` (create) | Pure JWT helpers (handoff verify, session create/verify) |
| `src/content.config.ts` (modify) | `privateDocs` + `orgDocs` collections |
| `src/content/private-docs/*` (create) | Example shared-private pages (with sentinel) |
| `src/content/org-docs/{acme,globex}/*` (create) | Example org pages (with sentinel) |
| `src/config/sidebar.mjs` (create) | Public sidebar data, extracted from astro.config |
| `src/config/auth.mjs` (create) | Auth knobs + `authConfigured()` (reads `astro:env/server`) |
| `src/lib/sidebar-items.mjs` (create) | Pure sidebar-item builders (config→links, entries→items) |
| `src/lib/private-sidebar.mjs` (create) | `buildPrivateSidebar(session)` glue over `astro:content` |
| `src/middleware.ts` (create) | Guard `/private/**`: session check, SSO redirect, loop guard, fail-closed |
| `src/env.d.ts` (modify) | `App.Locals.session` type |
| `src/pages/private/[...slug].astro` (create) | Shared private pages (on-demand) |
| `src/pages/private/orgs/[org]/[...slug].astro` (create) | Org pages (on-demand) |
| `src/pages/auth/callback.ts` (create) | Handoff-token verification → session cookie |
| `src/pages/auth/logout.ts` (create) | Clear session cookie |
| `tests/auth-guards.test.mjs`, `tests/auth-tokens.test.mjs`, `tests/sidebar-items.test.mjs` (create) | Unit tests for the pure libs |
| `tests/private-leaks.test.mjs` (create) | Sentinel leak assertions over the static output |
| `tests/mock-sso/server.mjs` (create) | ~30-line mock SSO server (tests + local dev login) |
| `tests/visual/auth.spec.mjs` (create) | End-to-end auth flow via Playwright |
| `playwright.config.mjs` (modify) | Two web servers (preview + mock SSO), test env vars |
| `package.json` (modify) | Deps (`@astrojs/node`, `@astrojs/vercel`, `jose`), `dev:sso` script |
| `wiki/private-docs.md`, `README.md`, `CLAUDE.md` (create/modify) | Constraints doc, customer SSO sample, repo guidance |

**Important API facts verified against current docs (2026-08-20):**

- `<StarlightPage>` imports from `@astrojs/starlight/components/StarlightPage.astro`. Its `sidebar` prop takes explicit `{ label, link }` and `{ label, items }` objects only — **no `slug` shorthand, no `autogenerate`**. Its `headings` prop takes `{ depth, slug, text }[]` (exactly what `render(entry)` returns).
- `docsSchema()` works with a custom `glob()` collection (documented pattern for rendering custom collections via `<StarlightPage>`).
- No Starlight plugin exists for auth/access control (showcase checked), which is why this is custom-built.

---

### Task 1: Static-dir test helper (prepares for the adapter change)

Adding an adapter (Task 2) moves static output from `dist/` to `dist/client/` (Node) or `.vercel/output/static/` (Vercel). Teach the tests to resolve it first, so `npm test` never goes red between tasks.

**Files:**
- Create: `tests/helpers/static-dir.mjs`
- Modify: `tests/markdown-twins.test.mjs:27`
- Modify: `tests/scalar-api-reference.test.mjs:30`

- [ ] **Step 1: Create the helper**

```js
// tests/helpers/static-dir.mjs
/**
 * Resolve the static build output directory.
 *
 * Where static files land depends on the adapter: plain static builds use
 * `dist/`, the Node adapter uses `dist/client/`, and the Vercel adapter uses
 * `.vercel/output/static/`. Tests must assert against whichever this build
 * produced, so resolve it instead of hardcoding.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATES = ['dist/client', '.vercel/output/static', 'dist'];

export function staticDir(projectRoot) {
	for (const candidate of CANDIDATES) {
		const dir = join(projectRoot, candidate);
		if (existsSync(join(dir, 'index.html'))) return dir;
	}
	throw new Error(
		`No static build output found under ${projectRoot} ` +
			`(checked: ${CANDIDATES.join(', ')}). Run \`npm run build\` first.`
	);
}
```

- [ ] **Step 2: Use it in both test files**

In `tests/markdown-twins.test.mjs`, replace the line
`const DIST = join(__dirname, '..', 'dist');` with:

```js
import { staticDir } from './helpers/static-dir.mjs';
const DIST = staticDir(join(__dirname, '..'));
```

Note: `staticDir` throws when there is no build, which duplicates the existing
`assert.ok(existsSync(DIST), 'dist/ does not exist')` checks — leave those
assertions in place (they now can't fire, harmless) or simplify them to
`assert.ok(existsSync(DIST))`. Make the identical replacement in
`tests/scalar-api-reference.test.mjs` (same `DIST` constant pattern).

Careful: `staticDir` runs at module load, before the build exists if tests run
without building. `npm test` always builds first, so this matches current
behavior (the old code also read `dist` at load).

- [ ] **Step 3: Verify tests still pass**

Run: `npm test`
Expected: builds, then all `node --test` suites PASS (helper falls back to `dist`).

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/static-dir.mjs tests/markdown-twins.test.mjs tests/scalar-api-reference.test.mjs
git commit -m "test: resolve the static output dir instead of hardcoding dist/"
```

---

### Task 2: Adapters, env schema, dependencies

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`
- Create: `.env.example`

- [ ] **Step 1: Install dependencies**

**Do not install these at `@latest`.** Verified against the registry on
2026-08-20: the adapters' v11 lines declare `astro: ^7`, and this project runs
Astro 6.3.1. The v10 lines are the Astro 6 majors:

| Package | Version | Peer |
| --- | --- | --- |
| `@astrojs/node` | **exactly `10.1.1`** (no caret — see below) | `astro: ^6.3.0` |
| `@astrojs/vercel` | `^10.0.8` | `astro: ^6.0.0` ✓ |
| `jose` | `^6.2.9` | none |

**The `@astrojs/node` pin must be exact, and peer ranges do not explain why.**
Discovered during implementation and confirmed against the installed source:
`@astrojs/node` 10.1.2 switched to importing `createRequestFromNodeRequest`,
which Astro only began exporting in 6.4.0 — while still declaring peer
`astro: ^6.3.0`. So npm resolves 10.1.4 against 6.3.1 with a completely clean
`npm ls`, and the build then dies deep in Rollup:

```
node_modules/@astrojs/node/dist/serve-app.js (6:2): "createRequestFromNodeRequest"
is not exported by "node_modules/astro/dist/core/app/entrypoints/node.js"
```

| | imports | builds on Astro 6.3.1 |
| --- | --- | --- |
| `@astrojs/node` ≤ 10.1.1 | `createRequest` | yes |
| `@astrojs/node` 10.1.2–10.1.4 | `createRequestFromNodeRequest` | **no** |

`~10.1.1` would float back onto the break, so the pin has to be exact. Record
the reason in a comment beside the adapter in `astro.config.mjs` — an
undocumented exact pin is an invisible trap for whoever next bumps deps.

Run: `npm install @astrojs/node@10.1.1 @astrojs/vercel@^10.0.8 jose@^6.2.9`
Expected: installs with no `ERESOLVE` / peer-dependency errors.

Verify the peers actually resolved rather than trusting the install:

```bash
npm ls @astrojs/node @astrojs/vercel jose astro
```
Expected: no `invalid` or `UNMET PEER DEPENDENCY` markers.

If a peer error does appear, **stop and report** rather than passing
`--force` or `--legacy-peer-deps`: a mismatched adapter is exactly the kind of
breakage that surfaces only at deploy time.

- [ ] **Step 2: Wire the env-selected adapter and env schema**

In `astro.config.mjs`, change the first import line and add adapter imports:

```js
// @ts-check
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
```

Inside `defineConfig({ ... })`, directly after the `site:` entry, add:

```js
	// The logged-in experience needs a server runtime for /private/** and
	// /auth/**. Public pages stay prerendered and CDN-served either way.
	//
	// Vercel builds set VERCEL=1 and need the Vercel adapter; everywhere else
	// (local dev, `npm test`, `npm run preview`, self-hosting) uses the Node
	// adapter — the Vercel adapter does not support `astro preview`, and both
	// test suites run against the build output. See wiki/private-docs.md.
	adapter: process.env.VERCEL ? vercel() : node({ mode: 'standalone' }),
	env: {
		schema: {
			// All three are read at runtime (access: 'secret'), so the same build
			// works across environments and no secret is inlined into the bundle.
			// Unset means auth is not configured: /private/** fails closed (404).
			DOCS_SSO_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
			DOCS_SSO_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
			DOCS_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
		},
	},
```

- [ ] **Step 3: Ignore the Vercel adapter's output**

`.gitignore` covers `dist/` and `.astro/` but has no `.vercel/` entry. A local
`VERCEL=1` build now drops a large untracked tree into the working copy. Add
it under the existing `# build output` heading, directly after `dist/`:

```gitignore
# build output
dist/
# Vercel adapter output (`VERCEL=1` builds); see wiki/private-docs.md
.vercel/
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Private docs SSO — see wiki/private-docs.md.
#
# All three unset  → auth is off; /private/** returns 404 in production builds.
# For local development, run the mock SSO server (`npm run dev:sso`) and use
# these values exactly as written:
DOCS_SSO_URL=http://localhost:4545/docs-sso
DOCS_SSO_SECRET=test-sso-secret
DOCS_SESSION_SECRET=test-session-secret
```

- [ ] **Step 5: Verify the build and tests**

Run: `npm run check && npm test`
Expected: zero type errors; build now emits `dist/client/` + `dist/server/`;
all tests PASS (Task 1's helper resolves `dist/client`).

Confirm the adapter actually engaged, rather than inferring it from a green
suite:

```bash
ls dist
```
Expected: both `client` and `server` present. If only a flat `dist/` appeared,
the adapter is not wired — stop and report.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json astro.config.mjs .env.example .gitignore
git commit -m "feat: env-selected SSR adapter (Vercel on Vercel, Node elsewhere) and auth env schema"
```

---

### Task 3: Path-guard rules (pure, TDD)

**Files:**
- Create: `src/lib/auth/guards.mjs`
- Test: `tests/auth-guards.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/auth-guards.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath } from '../src/lib/auth/guards.mjs';

test('public paths are public', () => {
	for (const p of ['/', '/guides/example/', '/api/', '/privateer/', '/orgs/acme/']) {
		assert.deepEqual(classifyPath(p), { type: 'public' }, p);
	}
});

test('auth endpoints are auth', () => {
	assert.deepEqual(classifyPath('/auth/callback'), { type: 'auth' });
	assert.deepEqual(classifyPath('/auth/logout'), { type: 'auth' });
});

test('/private and children are private', () => {
	assert.deepEqual(classifyPath('/private'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/guide/'), { type: 'private' });
});

test('org paths carry the org slug', () => {
	assert.deepEqual(classifyPath('/private/orgs/acme/'), { type: 'org', org: 'acme' });
	assert.deepEqual(classifyPath('/private/orgs/acme/workflow/'), { type: 'org', org: 'acme' });
	// /private/orgs/ itself lists nothing and needs only a login, like /private/.
	assert.deepEqual(classifyPath('/private/orgs'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/orgs/'), { type: 'private' });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/auth-guards.test.mjs`
Expected: FAIL — cannot find module `src/lib/auth/guards.mjs`.

- [ ] **Step 3: Implement**

```js
// src/lib/auth/guards.mjs
/**
 * Classify a pathname for the auth middleware.
 *
 * Pure and dependency-free so it can be unit-tested under `node --test`
 * without an Astro runtime. The middleware is the only other consumer.
 *
 * - 'auth'    → /auth/** (SSO callback and logout; never guarded, or the
 *               callback could not run to create a session)
 * - 'org'     → /private/orgs/<org>/** (requires login AND org membership)
 * - 'private' → everything else under /private/** (requires login)
 * - 'public'  → everything else (middleware does not touch it)
 */
export function classifyPath(pathname) {
	if (pathname === '/auth' || pathname.startsWith('/auth/')) return { type: 'auth' };
	const org = pathname.match(/^\/private\/orgs\/([^/]+)(?:\/|$)/);
	if (org) return { type: 'org', org: org[1] };
	if (pathname === '/private' || pathname.startsWith('/private/')) return { type: 'private' };
	return { type: 'public' };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/auth-guards.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/guards.mjs tests/auth-guards.test.mjs
git commit -m "feat: pure path classification for the auth middleware"
```

---

### Task 4: Token and session helpers (pure, TDD)

**Files:**
- Create: `src/lib/auth/tokens.mjs`
- Test: `tests/auth-tokens.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/auth-tokens.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import {
	verifyHandoffToken,
	createSessionToken,
	verifySessionToken,
} from '../src/lib/auth/tokens.mjs';

const SECRET = 'test-sso-secret';
const key = new TextEncoder().encode(SECRET);

function handoff(claims, { expiresIn = '5m', secret = key } = {}) {
	return new SignJWT(claims)
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(claims.sub ?? 'user-1')
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(secret);
}

test('valid handoff token yields a session', async () => {
	const token = await handoff({ email: 'r@acme.test', name: 'R', orgs: ['acme'], state: 's1' });
	const session = await verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' });
	assert.deepEqual(session, { sub: 'user-1', email: 'r@acme.test', name: 'R', orgs: ['acme'] });
});

test('missing orgs claim defaults to empty array', async () => {
	const token = await handoff({ state: 's1' });
	const session = await verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' });
	assert.deepEqual(session.orgs, []);
});

test('state mismatch is rejected', async () => {
	const token = await handoff({ state: 'other' });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('wrong secret is rejected', async () => {
	const token = await handoff({ state: 's1' }, { secret: new TextEncoder().encode('wrong') });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('expired handoff token is rejected', async () => {
	// -10m is beyond the 60s clock tolerance.
	const token = await handoff({ state: 's1' }, { expiresIn: '-10m' });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('handoff token without exp is rejected', async () => {
	const token = await new SignJWT({ state: 's1' })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject('user-1')
		.sign(key);
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('session token round-trips', async () => {
	const session = { sub: 'user-1', email: 'r@acme.test', name: 'R', orgs: ['acme'] };
	const token = await createSessionToken(session, { secret: SECRET, ttlSeconds: 60 });
	assert.deepEqual(await verifySessionToken(token, { secret: SECRET }), session);
});

test('tampered or expired session tokens verify to null, not a throw', async () => {
	const session = { sub: 'user-1', email: null, name: null, orgs: [] };
	const good = await createSessionToken(session, { secret: SECRET, ttlSeconds: 60 });
	assert.equal(await verifySessionToken(good + 'x', { secret: SECRET }), null);
	assert.equal(await verifySessionToken(good, { secret: 'other' }), null);
	const expired = await createSessionToken(session, { secret: SECRET, ttlSeconds: -60 });
	assert.equal(await verifySessionToken(expired, { secret: SECRET }), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/auth-tokens.test.mjs`
Expected: FAIL — cannot find module `src/lib/auth/tokens.mjs`.

- [ ] **Step 3: Implement**

```js
// src/lib/auth/tokens.mjs
/**
 * JWT helpers for the SSO handoff and the docs site's own session.
 *
 * Pure: secrets always arrive as arguments so the module never touches
 * `astro:env` and stays testable under `node --test`. Two deliberate
 * asymmetries:
 *
 * - `verifyHandoffToken` THROWS on anything invalid — the callback turns that
 *   into an error page with the reason.
 * - `verifySessionToken` returns null on anything invalid — an expired or
 *   garbage cookie is an everyday event that just means "redirect to SSO".
 */
import { SignJWT, jwtVerify } from 'jose';

const encode = (secret) => new TextEncoder().encode(secret);

/** Verify a handoff token from the customer's SSO endpoint. Throws on failure. */
export async function verifyHandoffToken(token, { secret, expectedState, clockTolerance = 60 }) {
	const { payload } = await jwtVerify(token, encode(secret), {
		algorithms: ['HS256'],
		clockTolerance,
	});
	// jose validates `exp` only when present; a token that never expires is a
	// standing credential in a URL, so its absence is an error here.
	if (typeof payload.exp !== 'number') throw new Error('handoff token has no exp claim');
	if (!payload.sub) throw new Error('handoff token has no sub claim');
	if (!expectedState || payload.state !== expectedState) throw new Error('state mismatch');
	return {
		sub: String(payload.sub),
		email: typeof payload.email === 'string' ? payload.email : null,
		name: typeof payload.name === 'string' ? payload.name : null,
		orgs: Array.isArray(payload.orgs) ? payload.orgs.map(String) : [],
	};
}

/** Sign the docs site's own session cookie value. */
export async function createSessionToken(session, { secret, ttlSeconds }) {
	return new SignJWT({ email: session.email, name: session.name, orgs: session.orgs })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(session.sub)
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
		.sign(encode(secret));
}

/** Verify a session cookie value. Returns the session, or null if invalid. */
export async function verifySessionToken(token, { secret }) {
	try {
		const { payload } = await jwtVerify(token, encode(secret), { algorithms: ['HS256'] });
		if (!payload.sub || typeof payload.exp !== 'number') return null;
		return {
			sub: String(payload.sub),
			email: typeof payload.email === 'string' ? payload.email : null,
			name: typeof payload.name === 'string' ? payload.name : null,
			orgs: Array.isArray(payload.orgs) ? payload.orgs.map(String) : [],
		};
	} catch {
		return null;
	}
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/auth-tokens.test.mjs`
Expected: PASS (8 tests). Note the expired-session test relies on
`setExpirationTime` accepting an absolute epoch-seconds number — it does.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/tokens.mjs tests/auth-tokens.test.mjs
git commit -m "feat: handoff and session JWT helpers"
```

---

### Task 5: Content collections and example private content

**Files:**
- Modify: `src/content.config.ts`
- Create: `src/content/private-docs/index.mdx`
- Create: `src/content/private-docs/example-private-guide.mdx`
- Create: `src/content/org-docs/acme/index.mdx`
- Create: `src/content/org-docs/globex/index.mdx`

- [ ] **Step 1: Define the collections**

Replace the body of `src/content.config.ts` with:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	// The logged-in experience. Kept OUTSIDE `docs` on purpose: Starlight never
	// prerenders these, so Pagefind, llms.txt, the sitemap and the `.md` routes
	// cannot leak them structurally. Rendered by src/pages/private/. Uses
	// docsSchema() so frontmatter is identical to public docs.
	privateDocs: defineCollection({
		// `orgs/` is reserved: /private/orgs/** is the org-docs URL space, so a
		// same-named folder here would be unreachable. Excluded to fail loudly
		// in `npm test` (leak tests) rather than silently 404.
		loader: glob({ pattern: ['**/[^_]*.{md,mdx}', '!orgs/**'], base: './src/content/private-docs' }),
		schema: docsSchema(),
	}),
	// One folder per org; folder name = org slug in the SSO token's `orgs` claim.
	orgDocs: defineCollection({
		loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/org-docs' }),
		schema: docsSchema(),
	}),
};
```

- [ ] **Step 2: Create example content (each page carries the leak sentinel)**

`src/content/private-docs/index.mdx`:

```mdx
---
title: Private documentation
description: Placeholder landing page for docs visible to any logged-in reader.
---

This page is only served to logged-in readers. Replace it with the private
documentation you share with all of your customers.

The exact phrase EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK appears in every private
example page: the test suite asserts it never shows up in the public build
output, which is how this template proves private content cannot leak.
```

`src/content/private-docs/example-private-guide.mdx`:

```mdx
---
title: Example private guide
description: A placeholder guide that only logged-in readers can see.
sidebar:
  order: 1
---

Replace this with a real guide. Anything in `src/content/private-docs/`
appears in the "Private docs" sidebar group for logged-in readers.

Leak marker: EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK
```

`src/content/org-docs/acme/index.mdx`:

```mdx
---
title: Acme docs
description: Placeholder for documentation written specifically for Acme.
---

This section is only visible to readers whose SSO token includes the `acme`
org. Put Acme-specific workflows, guides and integration notes here.

Leak marker: EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK
```

`src/content/org-docs/globex/index.mdx`:

```mdx
---
title: Globex docs
description: Placeholder for documentation written specifically for Globex.
---

This section is only visible to readers whose SSO token includes the `globex`
org. It exists so the tests can prove one org never sees another's docs.

Leak marker: EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm run build`
Expected: zero errors. Then confirm nothing leaked even without routes:

Run: `grep -r "EKLINE-PRIVATE-SENTINEL" dist/client && echo LEAK || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add src/content.config.ts src/content/private-docs src/content/org-docs
git commit -m "feat: private and org content collections with example pages"
```

---

### Task 6: Extract the public sidebar into shared config

`buildPrivateSidebar` (Task 7/9) needs the same sidebar data `astro.config.mjs`
uses. Extract it; add the public "Private docs" login affordance.

**Files:**
- Create: `src/config/sidebar.mjs`
- Modify: `astro.config.mjs` (sidebar section)

- [ ] **Step 1: Create `src/config/sidebar.mjs`**

Move the four literal groups and the changelog entry out of `astro.config.mjs`
verbatim (do not retype them — cut and paste, they must stay identical):

```js
// src/config/sidebar.mjs
/**
 * The public sidebar, as data.
 *
 * Lives here rather than inline in `astro.config.mjs` because two consumers
 * need it: the Starlight config (public, static pages) and
 * `src/lib/private-sidebar.mjs`, which rebuilds the same navigation — plus
 * the private groups — for logged-in pages. One definition, no drift.
 */
export const docsSidebarGroups = [
	{
		label: 'Get started',
		items: [
			{ label: 'Introduction', slug: 'get-started/introduction' },
			{ label: 'Quickstart', slug: 'get-started/quickstart' },
			{ label: 'Authentication', slug: 'get-started/authentication' },
		],
	},
	{
		label: 'Guides',
		items: [
			{ label: 'Example guide', slug: 'guides/example' },
			{ label: 'Send your first request', slug: 'guides/send-your-first-request' },
		],
	},
	{
		label: 'Concepts',
		items: [
			{ label: 'How it works', slug: 'concepts/how-it-works' },
			{ label: 'Glossary', slug: 'concepts/glossary' },
		],
	},
	{
		label: 'Reference',
		items: [{ autogenerate: { directory: 'reference' } }],
	},
];

export const changelogEntry = { label: 'Changelog', slug: 'changelog' };

/**
 * The one login affordance on public pages. Static HTML is identical for
 * every visitor, so this cannot be session-aware — it is a plain link that
 * starts the SSO round trip when the reader is not logged in.
 */
export const loginLink = { label: 'Private docs', link: '/private/' };
```

- [ ] **Step 2: Use it from `astro.config.mjs`**

Add to the imports:

```js
import { docsSidebarGroups, changelogEntry, loginLink } from './src/config/sidebar.mjs';
```

Replace the `sidebar:` array contents (keeping the existing explanatory
comments above `...apiReferenceSidebar`) with:

```js
			sidebar: [
				...docsSidebarGroups,
				...apiReferenceSidebar,
				changelogEntry,
				loginLink,
			],
```

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: build + all suites PASS (sidebar unchanged apart from the new
"Private docs" link, which no test asserts against).

- [ ] **Step 4: Commit**

```bash
git add src/config/sidebar.mjs astro.config.mjs
git commit -m "refactor: extract the public sidebar into shared config, add login link"
```

---

### Task 7: Private/org sidebar item builders (TDD)

**Files:**
- Create: `src/lib/sidebar-items.mjs`
- Test: `tests/sidebar-items.test.mjs`

**Scope note — read this first.** An earlier draft of this plan had these
builders also expanding `slug` shorthand and `autogenerate` into explicit
links, on the belief that `<StarlightPage>`'s `sidebar` prop accepted only
`{ label, link }` objects. **That is wrong.** Verified against the installed
Starlight 0.39 source on 2026-08-20:

- `utils/starlight-page.ts:89` types the prop as `StarlightUserConfig['sidebar']`
  — the exact same type as `astro.config.mjs`'s `sidebar`.
- `utils/starlight-page.ts:114` passes it through `validateSidebarProp` →
  `SidebarItemSchema.array()`, then `getSidebarFromConfig`.
- `schemas/sidebar.ts:127-140` shows `SidebarItemSchema` is a union of
  `SidebarLinkItemSchema` (`{label, link}`), `ManualSidebarGroupSchema`
  (`{label, items}`, nested), `AutoSidebarEntriesSchema` (`{autogenerate}`),
  `InternalSidebarLinkItemSchema` (`{label, slug}`) and
  `InternalSidebarLinkItemShorthandSchema` (a bare slug string).

So config-shaped sidebar data can be handed to `<StarlightPage>` untouched,
and Starlight expands `autogenerate` with its own tree walker — which handles
nested directories, `sidebar.order`, index pages and badges correctly. A
hand-rolled expander would be ~50 lines of duplicated logic that silently
drifts from Starlight's on upgrade. **Do not write one.**

What still needs building: private and org docs are **not** in the `docs`
collection, so neither `slug` shorthand nor `autogenerate` can reach them.
Their groups must be built as explicit `{ label, link }` items. That is all
this module does.

- [ ] **Step 1: Write the failing tests**

```js
// tests/sidebar-items.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
	entriesToItems,
	orgGroup,
	privateLinkFor,
	orgLinkFor,
} from '../src/lib/sidebar-items.mjs';

// Minimal shape of an astro:content entry, as the real code consumes it.
const entry = (id, title, sidebar = {}) => ({ id, data: { title, sidebar } });

test('entriesToItems sorts by order then id, honours sidebar.label, skips hidden', () => {
	const entries = [
		entry('example-private-guide', 'Example private guide', { order: 1, label: 'Example guide' }),
		entry('index', 'Private documentation'),
		entry('secret-draft', 'Draft', { hidden: true }),
	];
	assert.deepEqual(entriesToItems(entries, privateLinkFor), [
		{ label: 'Example guide', link: '/private/example-private-guide/' },
		{ label: 'Private documentation', link: '/private/' },
	]);
});

test('entries without an order sort by id, after ordered ones', () => {
	const entries = [entry('zeta', 'Zeta'), entry('alpha', 'Alpha'), entry('beta', 'Beta', { order: 5 })];
	assert.deepEqual(
		entriesToItems(entries, privateLinkFor).map((item) => item.label),
		['Beta', 'Alpha', 'Zeta']
	);
});

test('privateLinkFor maps index to the section root', () => {
	assert.equal(privateLinkFor(entry('index', 'X')), '/private/');
	assert.equal(privateLinkFor(entry('guide', 'X')), '/private/guide/');
	assert.equal(privateLinkFor(entry('deep/nested/index', 'X')), '/private/deep/nested/');
});

test('orgLinkFor strips the org prefix and maps index to the org root', () => {
	assert.equal(orgLinkFor('acme')(entry('acme/index', 'Acme docs')), '/private/orgs/acme/');
	assert.equal(orgLinkFor('acme')(entry('acme/workflow', 'W')), '/private/orgs/acme/workflow/');
	assert.equal(orgLinkFor('acme')(entry('acme/a/index', 'W')), '/private/orgs/acme/a/');
});

test('orgGroup builds a group from the org subtree, labelled by its index page', () => {
	const orgEntries = [
		entry('acme/index', 'Acme docs'),
		entry('acme/workflow', 'Custom workflow'),
		entry('globex/index', 'Globex docs'),
	];
	assert.deepEqual(orgGroup('acme', orgEntries), {
		label: 'Acme docs',
		items: [
			{ label: 'Acme docs', link: '/private/orgs/acme/' },
			{ label: 'Custom workflow', link: '/private/orgs/acme/workflow/' },
		],
	});
});

test('orgGroup falls back to the slug when the org has no index page', () => {
	assert.deepEqual(orgGroup('acme', [entry('acme/workflow', 'Custom workflow')]), {
		label: 'acme',
		items: [{ label: 'Custom workflow', link: '/private/orgs/acme/workflow/' }],
	});
});

test('orgGroup returns null when the org has no content', () => {
	assert.equal(orgGroup('nonexistent', []), null);
	assert.equal(orgGroup('acme', [entry('globex/index', 'Globex docs')]), null);
});

test('orgGroup does not match an org whose slug is a prefix of another', () => {
	const entries = [entry('acme-labs/index', 'Acme Labs'), entry('acme/index', 'Acme')];
	assert.deepEqual(orgGroup('acme', entries), {
		label: 'Acme',
		items: [{ label: 'Acme', link: '/private/orgs/acme/' }],
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/sidebar-items.test.mjs`
Expected: FAIL — cannot find module `src/lib/sidebar-items.mjs`.

- [ ] **Step 3: Implement**

```js
// src/lib/sidebar-items.mjs
/**
 * Sidebar items for the private and per-org groups.
 *
 * Only these two groups need building. The public part of a private page's
 * sidebar is handed to `<StarlightPage>` in the same config shape
 * `astro.config.mjs` uses — the prop is typed `StarlightUserConfig['sidebar']`
 * and validated by Starlight's own `SidebarItemSchema`, so `slug` shorthand
 * and `autogenerate` work there untouched, expanded by Starlight's tree
 * walker. Re-implementing that walk here would duplicate ordering, nesting
 * and index-page rules that are Starlight's to define.
 *
 * Private and org docs are the exception, and the reason this file exists:
 * they live outside the `docs` collection (that is the security boundary —
 * see wiki/private-docs.md), so nothing Starlight autogenerates can reach
 * them and their links must be built explicitly.
 *
 * Everything here takes entries as arguments rather than importing
 * `astro:content`, so it runs under `node --test`.
 * `src/lib/private-sidebar.mjs` is the glue that feeds it real collections.
 */

/** Ordered entries first (by `sidebar.order`), then the rest alphabetically. */
const byOrderThenId = (a, b) =>
	(a.data.sidebar?.order ?? Infinity) - (b.data.sidebar?.order ?? Infinity) ||
	a.id.localeCompare(b.id);

const labelOf = (entry) => entry.data.sidebar?.label ?? entry.data.title;

/** `'a/b/index'` → `'a/b'`; `'index'` → `''`. */
const withoutIndex = (id) => (id === 'index' ? '' : id.replace(/(^|\/)index$/, ''));

/** Sorted `{ label, link }` items for a list of collection entries. */
export function entriesToItems(entries, linkFor) {
	return entries
		.filter((entry) => !entry.data.sidebar?.hidden)
		.sort(byOrderThenId)
		.map((entry) => ({ label: labelOf(entry), link: linkFor(entry) }));
}

/** Link for a `privateDocs` entry. */
export const privateLinkFor = (entry) => {
	const rest = withoutIndex(entry.id);
	return rest ? `/private/${rest}/` : '/private/';
};

/** Link builder for one org's `orgDocs` entries (ids look like `acme/workflow`). */
export const orgLinkFor = (org) => (entry) => {
	const rest = withoutIndex(entry.id.slice(org.length + 1));
	return rest ? `/private/orgs/${org}/${rest}/` : `/private/orgs/${org}/`;
};

/**
 * Sidebar group for one org, or null if it has no content.
 *
 * Labelled by the org's index page title, so the folder name `acme` can
 * display as "Acme docs" without a separate slug→name mapping to maintain.
 */
export function orgGroup(org, orgEntries) {
	// The trailing slash matters: without it, org `acme` would also match
	// `acme-labs/`, and one customer's sidebar would list another's pages.
	const entries = orgEntries.filter((entry) => entry.id.startsWith(`${org}/`));
	if (entries.length === 0) return null;
	const index = entries.find((entry) => entry.id === `${org}/index`);
	return {
		label: index ? index.data.title : org,
		items: entriesToItems(entries, orgLinkFor(org)),
	};
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/sidebar-items.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sidebar-items.mjs tests/sidebar-items.test.mjs
git commit -m "feat: sidebar item builders for the private and org groups"
```

---

### Task 8: Auth config, Locals type, middleware

**Files:**
- Create: `src/config/auth.mjs`
- Modify: `src/env.d.ts` (append)
- Create: `src/middleware.ts`

- [ ] **Step 1: Create `src/config/auth.mjs`**

```js
// src/config/auth.mjs
/**
 * Auth knobs — the non-secret half of the configuration.
 *
 * Secrets and the per-deployment SSO URL come from env vars (see
 * `.env.example`); this file is what a customer edits for behavior. Server
 * code only: it imports `astro:env/server`, so neither `astro.config.mjs`
 * nor the `node --test` suites can import it. The pure logic lives in
 * `src/lib/auth/` for exactly that reason.
 */
import { DOCS_SSO_URL, DOCS_SSO_SECRET, DOCS_SESSION_SECRET } from 'astro:env/server';

export const auth = {
	/** Master switch. false behaves exactly like unset env vars: /private/** 404s. */
	enabled: true,
	/** Where readers are sent to authenticate — their product's SSO endpoint. */
	ssoUrl: DOCS_SSO_URL ?? null,
	sessionTtlSeconds: 8 * 60 * 60,
	sessionCookie: 'docs_session',
	stateCookie: 'docs_sso_state',
};

export const authSecrets = {
	sso: DOCS_SSO_SECRET ?? null,
	session: DOCS_SESSION_SECRET ?? null,
};

export function authConfigured() {
	return Boolean(auth.enabled && auth.ssoUrl && authSecrets.sso && authSecrets.session);
}
```

- [ ] **Step 2: Append the Locals type to `src/env.d.ts`**

```ts
declare namespace App {
	interface Locals {
		/**
		 * The signed-in reader, set by `src/middleware.ts` on authenticated
		 * requests under `/private/**`. Absent everywhere else — public pages
		 * are prerendered and identical for every visitor by design.
		 *
		 * Not to be confused with Astro's own `context.session`, which the
		 * Node adapter enables automatically (it logs "Enabling sessions with
		 * filesystem storage" on every build). That is server-side key/value
		 * storage this template does not use; this is the JWT the SSO handoff
		 * produced. Two different things named "session" — read the type, not
		 * the name.
		 */
		session?: {
			sub: string;
			email: string | null;
			name: string | null;
			orgs: string[];
		};
	}
}
```

- [ ] **Step 3: Create `src/middleware.ts`**

```ts
// src/middleware.ts
/**
 * Guards /private/**. See wiki/private-docs.md for the full flow.
 *
 * Runs on every on-demand request (all of /private/** and /auth/** — nothing
 * else in this template renders on demand). Prerendered public pages are
 * served as static files and never pass through here at request time, which
 * is fine: they have nothing to guard.
 */
import { defineMiddleware } from 'astro:middleware';
import { auth, authSecrets, authConfigured } from './config/auth.mjs';
import { classifyPath } from './lib/auth/guards.mjs';
import { verifySessionToken } from './lib/auth/tokens.mjs';

type StateCookie = { state: string; returnTo: string; attempts: number };

export const onRequest = defineMiddleware(async (context, next) => {
	// Two independent signals, and the stricter one wins. Neither is
	// sufficient alone — each fails open in a case the other catches.
	//
	// `originPathname`, NOT `url.pathname`: measured against Astro 6.3.1 in
	// Task 3, `url.pathname` still carries the configured `base`, so on a site
	// built with `base: '/docs'` a request for `/docs/private/secret/`
	// classifies as PUBLIC while Astro strips the base and renders the private
	// page anyway. A complete bypass, costing a customer nothing but deploying
	// under a subpath. `originPathname` is base-stripped and agreed with the
	// router in every non-rewrite probe, including the multi-level-encoding
	// cases (`%252e%252e`) where `url.pathname` and the router disagree about
	// the org segment.
	//
	// `routePattern` covers what `originPathname` cannot: Astro re-enters the
	// whole middleware chain after ANY `Astro.rewrite()` — including one
	// issued by a page or a third-party integration — and on that second pass
	// `originPathname` is still pinned to the pre-rewrite path. So a public
	// page that rewrites into `/private/**` renders private content with the
	// guard reporting `public`. Nothing in this template rewrites today, which
	// is why this is defence in depth rather than a live hole; but "no
	// integration ever rewrites" is not a property a template can promise on
	// behalf of its customers. `routePattern` is the route Astro actually
	// matched (`/private/[...slug]`), and `applyRewriteToState` updates it, so
	// it cannot drift from what is about to render.
	// `routePattern` is documented public API on `APIContext`, typed as a
	// non-optional `string` (verified in
	// node_modules/astro/dist/types/public/context.d.ts:561). No `?.` — if a
	// future Astro drops it, `astro check` should fail the build loudly rather
	// than let an optional-chain quietly turn this guard off.
	const kind = classifyPath(context.originPathname);
	const routeIsPrivate = context.routePattern.startsWith('/private');
	if ((kind.type === 'public' || kind.type === 'auth') && !routeIsPrivate) return next();
	// A private route reached with a public-looking path means the two signals
	// disagree — only possible via a rewrite. Refuse rather than guess which
	// org it is: there is no trustworthy org slug in that state.
	if (routeIsPrivate && kind.type !== 'private' && kind.type !== 'org') {
		console.error(
			`[auth] refusing ${context.routePattern}: route is private but the ` +
				`request path (${context.originPathname}) is not. A rewrite into ` +
				`/private/** cannot be authorised — see wiki/private-docs.md.`
		);
		return notFound();
	}

	// Fail closed: without configuration, private routes do not exist as far
	// as an anonymous visitor can tell.
	if (!authConfigured()) {
		if (import.meta.env.DEV) return devSetupPage();
		console.error(
			'[auth] request to a /private route but SSO is not configured — ' +
				'set DOCS_SSO_URL, DOCS_SSO_SECRET and DOCS_SESSION_SECRET (see .env.example).'
		);
		return notFound();
	}

	const cookie = context.cookies.get(auth.sessionCookie)?.value;
	const session = cookie
		? await verifySessionToken(cookie, { secret: authSecrets.session! })
		: null;
	if (!session) return redirectToSso(context);

	// Wrong org is a 404, not a 403: org slugs must not be confirmable.
	//
	// Compare the bytes verbatim — no lowercasing, trimming or decoding on
	// either side. Astro's `getParams` does not decode, so `kind.org` is
	// byte-identical to the `params.org` the page will receive; normalising
	// here would make the guard and the page disagree about which org this is.
	// (No `!` needed: the union narrows `org` to `string` under this `type`.)
	if (kind.type === 'org' && !session.orgs.includes(kind.org)) return notFound();

	context.locals.session = session;
	return next();
});

function redirectToSso(context: Parameters<Parameters<typeof defineMiddleware>[0]>[0]) {
	const prior = readStateCookie(context.cookies.get(auth.stateCookie)?.value);
	const attempts = (prior?.attempts ?? 0) + 1;
	// Loop guard: a broken SSO endpoint that bounces readers straight back
	// would otherwise redirect forever. Two failed round trips → stop.
	if (attempts > 2) {
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
		returnTo: context.url.pathname + context.url.search,
		attempts,
	};
	context.cookies.set(auth.stateCookie, JSON.stringify(value), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge: 600,
	});
	const target = new URL(auth.ssoUrl!);
	target.searchParams.set('redirect_uri', new URL('/auth/callback', context.url.origin).href);
	target.searchParams.set('state', state);
	return context.redirect(target.href);
}

export function readStateCookie(raw: string | undefined): StateCookie | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed?.state === 'string' ? (parsed as StateCookie) : null;
	} catch {
		return null;
	}
}

function notFound() {
	return new Response('<!doctype html><title>404</title><h1>404 — Not found</h1>', {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8' },
	});
}

function errorPage(title: string, body: string) {
	return new Response(
		`<!doctype html><title>${title}</title><h1>${title}</h1><p>${body}</p>`,
		{ status: 502, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);
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
		{ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);
}
```

If `astro check` rejects the `redirectToSso` context parameter type, simplify
it to `import type { APIContext } from 'astro'` and `context: APIContext` —
that is the documented public type for middleware/endpoint contexts.

- [ ] **Step 4: Verify types and build**

Run: `npm run check && npm run build`
Expected: zero errors. (Behavior is exercised in Tasks 9 and 11.)

**Also prove the rewrite guard actually fires**, rather than trusting that
the two-signal logic is right. Add a temporary page outside the repo's
committed set — `src/pages/rewrite-probe.astro` containing only
`--- return Astro.rewrite('/private/'); ---` — then build and request
`/rewrite-probe`. Expected: **404**, and the `[auth] refusing …` line on
stderr. Without the `routePattern` check this returns 200 with private HTML.
Delete the probe page afterwards and confirm `git status --short` is clean.

Record the result in your report. If the probe returns 200, the guard does
not work and this task is not done — report BLOCKED rather than committing.

- [ ] **Step 5: Commit**

```bash
git add src/config/auth.mjs src/env.d.ts src/middleware.ts
git commit -m "feat: auth config and fail-closed middleware for /private/**"
```

---

### Task 9: Private routes, auth endpoints, sidebar glue

**Files:**
- Create: `src/lib/private-sidebar.mjs`
- Create: `src/pages/private/[...slug].astro`
- Create: `src/pages/private/orgs/[org]/[...slug].astro`
- Create: `src/pages/auth/callback.ts`
- Create: `src/pages/auth/logout.ts`

- [ ] **Step 1: Create the sidebar glue**

```js
// src/lib/private-sidebar.mjs
/**
 * The sidebar for logged-in pages: the public navigation, plus the private
 * group, plus one group per org in the reader's session.
 *
 * The public part is passed through in the same shape `astro.config.mjs`
 * declares it — `<StarlightPage>`'s `sidebar` prop takes
 * `StarlightUserConfig['sidebar']`, so `slug` shorthand and `autogenerate`
 * are expanded by Starlight itself. Only the private and org groups are
 * built by hand, because those collections are invisible to `autogenerate`.
 *
 * API references appear as plain links (not per-operation groups): expanding
 * them means running Scalar's navigation builder against the spec file at
 * request time, and the spec on disk is not guaranteed to exist inside a
 * serverless bundle. A single link per reference is correct and cheap.
 */
import { getCollection } from 'astro:content';
import { docsSidebarGroups, changelogEntry } from '../config/sidebar.mjs';
import { enabledReferences, routeFor } from '../config/api-reference.mjs';
import { entriesToItems, privateLinkFor, orgGroup } from './sidebar-items.mjs';

/** @param {App.Locals['session']} session */
export async function buildPrivateSidebar(session) {
	const privateEntries = await getCollection('privateDocs');
	const orgEntries = await getCollection('orgDocs');
	return [
		...docsSidebarGroups,
		...enabledReferences.map((reference) => ({
			label: reference.label,
			link: routeFor(reference),
		})),
		changelogEntry,
		{ label: 'Private docs', items: entriesToItems(privateEntries, privateLinkFor) },
		...(session?.orgs ?? [])
			.map((org) => orgGroup(org, orgEntries))
			.filter((group) => group !== null),
		{ label: 'Log out', link: '/auth/logout' },
	];
}
```

Note the deliberate omission: `loginLink` from `src/config/sidebar.mjs` is
**not** included. It exists to send public-page readers into the login flow;
on a private page the reader is already logged in, and "Log out" takes its
place.

- [ ] **Step 2: Create the shared-private route**

```astro
---
// src/pages/private/[...slug].astro
/**
 * Renders `privateDocs` entries on demand. Never prerendered — that is the
 * security model (see wiki/private-docs.md). The middleware has already
 * verified the session before this runs.
 */
import { getCollection, render } from 'astro:content';
import StarlightPage from '@astrojs/starlight/components/StarlightPage.astro';
import { buildPrivateSidebar } from '../../lib/private-sidebar.mjs';

export const prerender = false;

const id = Astro.params.slug ?? 'index';
const entries = await getCollection('privateDocs');
const entry = entries.find((candidate) => candidate.id === id);
if (!entry) {
	return new Response('<!doctype html><title>404</title><h1>404 — Not found</h1>', {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8' },
	});
}
const { Content, headings } = await render(entry);
const sidebar = await buildPrivateSidebar(Astro.locals.session);
---

<StarlightPage
	frontmatter={{ title: entry.data.title, description: entry.data.description }}
	sidebar={sidebar}
	headings={headings}
>
	<Content />
</StarlightPage>
```

- [ ] **Step 3: Create the org route**

```astro
---
// src/pages/private/orgs/[org]/[...slug].astro
/**
 * Renders one org's `orgDocs` subtree. The middleware has already verified
 * both the session and that the reader belongs to `[org]` — a request for
 * another org never reaches this file.
 */
import { getCollection, render } from 'astro:content';
import StarlightPage from '@astrojs/starlight/components/StarlightPage.astro';
import { buildPrivateSidebar } from '../../../../lib/private-sidebar.mjs';

export const prerender = false;

const { org } = Astro.params;
const id = `${org}/${Astro.params.slug ?? 'index'}`;
const entries = await getCollection('orgDocs');
const entry = entries.find((candidate) => candidate.id === id);
if (!entry) {
	return new Response('<!doctype html><title>404</title><h1>404 — Not found</h1>', {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8' },
	});
}
const { Content, headings } = await render(entry);
const sidebar = await buildPrivateSidebar(Astro.locals.session);
---

<StarlightPage
	frontmatter={{ title: entry.data.title, description: entry.data.description }}
	sidebar={sidebar}
	headings={headings}
>
	<Content />
</StarlightPage>
```

- [ ] **Step 4: Create the auth endpoints**

```ts
// src/pages/auth/callback.ts
/**
 * The SSO handoff landing. Verifies the token the customer's product signed,
 * then swaps it for this site's own session cookie. The handoff token lives
 * only in this one redirect — it is never stored.
 */
import type { APIRoute } from 'astro';
import { auth, authSecrets, authConfigured } from '../../config/auth.mjs';
import { verifyHandoffToken, createSessionToken } from '../../lib/auth/tokens.mjs';
import { readStateCookie } from '../../middleware';

export const prerender = false;

export const GET: APIRoute = async (context) => {
	if (!authConfigured()) return new Response('Not found', { status: 404 });

	const token = context.url.searchParams.get('token');
	const stored = readStateCookie(context.cookies.get(auth.stateCookie)?.value);
	const returnTo = safeReturnTo(stored?.returnTo);

	if (!token || !stored) return failure('The sign-in link is missing its token or state.', returnTo);

	let session;
	try {
		session = await verifyHandoffToken(token, {
			secret: authSecrets.sso!,
			expectedState: stored.state,
		});
	} catch (error) {
		console.error('[auth] handoff token rejected:', error);
		return failure('The sign-in token was invalid or expired.', returnTo);
	}

	const value = await createSessionToken(session, {
		secret: authSecrets.session!,
		ttlSeconds: auth.sessionTtlSeconds,
	});
	context.cookies.set(auth.sessionCookie, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge: auth.sessionTtlSeconds,
	});
	// Success clears the state cookie — and with it the loop-guard counter.
	context.cookies.delete(auth.stateCookie, { path: '/' });
	return context.redirect(returnTo);
};

/** Only same-site paths; anything else falls back to the private index. */
function safeReturnTo(value: string | undefined): string {
	return value && value.startsWith('/') && !value.startsWith('//') ? value : '/private/';
}

function failure(reason: string, returnTo: string) {
	// The retry link restarts SSO via the middleware. The state cookie is NOT
	// cleared here: repeated failures increment its counter until the loop
	// guard stops the cycle.
	return new Response(
		`<!doctype html><title>Sign-in failed</title>
		<h1>Sign-in failed</h1><p>${reason}</p>
		<p><a href="${returnTo}">Try again</a></p>`,
		{ status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);
}
```

```ts
// src/pages/auth/logout.ts
import type { APIRoute } from 'astro';
import { auth } from '../../config/auth.mjs';

export const prerender = false;

export const GET: APIRoute = (context) => {
	context.cookies.delete(auth.sessionCookie, { path: '/' });
	return context.redirect('/');
};
```

- [ ] **Step 5: Type-check and build**

Run: `npm run check && npm run build`
Expected: zero errors.

- [ ] **Step 6: Smoke-test fail-closed and the redirect**

```bash
npx astro preview --port 4331 & sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4331/private/
kill %1
```
Expected: `404` (no env vars → fail closed).

```bash
DOCS_SSO_URL=http://localhost:4545/docs-sso \
DOCS_SSO_SECRET=test-sso-secret \
DOCS_SESSION_SECRET=test-session-secret \
npx astro preview --port 4331 & sleep 3
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:4331/private/
kill %1
```
Expected: `302 http://localhost:4545/docs-sso?redirect_uri=...&state=...`

- [ ] **Step 7: Commit**

```bash
git add src/lib/private-sidebar.mjs src/pages/private src/pages/auth
git commit -m "feat: on-demand private and org routes with SSO handoff endpoints"
```

---

### Task 10: Leak-assertion tests

**Files:**
- Test: `tests/private-leaks.test.mjs`

- [ ] **Step 1: Write the tests**

```js
// tests/private-leaks.test.mjs
/**
 * The design's core guarantee, as executable checks: private content is never
 * part of the static build. Every example page under `src/content/private-docs/`
 * and `src/content/org-docs/` carries the sentinel phrase below; if it shows
 * up anywhere in the static output — HTML, Pagefind fragments, llms*.txt,
 * sitemap, .md twins — a route or plugin started prerendering private content.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticDir } from './helpers/static-dir.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const STATIC = staticDir(ROOT);
const SENTINEL = 'EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK';

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
		item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]
	);
}

test('the sentinel exists in the private source content (guards the guard)', () => {
	const sources = [
		'src/content/private-docs/index.mdx',
		'src/content/org-docs/acme/index.mdx',
	];
	for (const source of sources) {
		assert.ok(
			readFileSync(join(ROOT, source), 'utf8').includes(SENTINEL),
			`${source} lost its sentinel — the leak tests below prove nothing without it`
		);
	}
});

test('no private content anywhere in the static output', () => {
	const leaked = walk(STATIC).filter((file) =>
		readFileSync(file, 'utf8').includes(SENTINEL)
	);
	assert.deepEqual(leaked, [], `private content leaked into: ${leaked.join(', ')}`);
});

test('no prerendered files under /private/', () => {
	assert.ok(!existsSync(join(STATIC, 'private')), 'static output contains a private/ directory');
});

test('the sitemap does not reference /private/', () => {
	const files = walk(STATIC).filter((file) => /sitemap.*\.xml$/.test(file));
	assert.ok(files.length > 0, 'no sitemap files found');
	for (const file of files) {
		assert.ok(
			!readFileSync(file, 'utf8').includes('/private/'),
			`${file} references /private/`
		);
	}
});

test('llms.txt variants do not mention private content', () => {
	const files = walk(STATIC).filter((file) => /llms.*\.txt$/.test(file));
	assert.ok(files.length > 0, 'no llms*.txt files found');
	for (const file of files) {
		const body = readFileSync(file, 'utf8');
		assert.ok(!body.includes(SENTINEL), `${file} contains private content`);
		assert.ok(!body.includes('/private/'), `${file} links to /private/`);
	}
});
```

- [ ] **Step 2: Run**

Run: `npm test`
Expected: all suites PASS, including the five new leak tests.

If `llms.txt variants` or the sitemap test FAILS: that is the test doing its
job — `starlight-llms-txt` and the sitemap only process the `docs` collection
and prerendered routes respectively, so a failure means a collection or route
ended up somewhere it should not be. Investigate; do not exclude-list.

- [ ] **Step 3: Commit**

```bash
git add tests/private-leaks.test.mjs
git commit -m "test: assert private content never enters the static build"
```

---

### Task 11: Mock SSO server and Playwright auth spec

**Files:**
- Create: `tests/mock-sso/server.mjs`
- Modify: `package.json` (add `dev:sso` script)
- Modify: `playwright.config.mjs` (webServer array)
- Test: `tests/visual/auth.spec.mjs`

- [ ] **Step 1: Create the mock SSO server**

```js
// tests/mock-sso/server.mjs
/**
 * A stand-in for the customer's product SSO endpoint. Signs a handoff JWT
 * for a fixed test reader (org: acme) and redirects straight back — no login
 * form, because what's under test is the docs site's half of the handshake.
 *
 * Used by the Playwright suite AND as the local-dev login: `npm run dev:sso`
 * plus the values in `.env.example` gives `npm run dev` a working sign-in.
 */
import { createServer } from 'node:http';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.MOCK_SSO_SECRET ?? 'test-sso-secret');
const port = Number(process.env.MOCK_SSO_PORT ?? 4545);

createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${port}`);
	if (url.pathname !== '/docs-sso') {
		res.writeHead(404).end('not found');
		return;
	}
	const redirectUri = url.searchParams.get('redirect_uri');
	const state = url.searchParams.get('state');
	if (!redirectUri || !state) {
		res.writeHead(400).end('missing redirect_uri or state');
		return;
	}
	const token = await new SignJWT({
		email: 'reader@acme.test',
		name: 'Test Reader',
		orgs: ['acme'],
		state,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject('user-1')
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(secret);
	const target = new URL(redirectUri);
	target.searchParams.set('token', token);
	res.writeHead(302, { location: target.href }).end();
}).listen(port, () => console.log(`mock SSO listening on http://localhost:${port}/docs-sso`));
```

- [ ] **Step 2: Add the npm script**

In `package.json` scripts, after `"start"`:

```json
    "dev:sso": "node tests/mock-sso/server.mjs",
```

- [ ] **Step 3: Update `playwright.config.mjs`**

Replace the existing single `webServer` object with an array. Keep the
existing comment about preview-not-build; add the auth servers:

```js
	webServer: [
		{
			// Preview only — the build runs from the `test:visual` script instead.
			// (Existing rationale comment retained here.)
			//
			// The DOCS_* values match tests/mock-sso/server.mjs and are read at
			// runtime (astro:env access:'secret'), so the already-built output
			// picks them up. Test-only values, safe to commit.
			command: 'npx astro preview --port 4331',
			url: 'http://localhost:4331',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
			env: {
				PORT: '4331',
				DOCS_SSO_URL: 'http://localhost:4545/docs-sso',
				DOCS_SSO_SECRET: 'test-sso-secret',
				DOCS_SESSION_SECRET: 'test-session-secret',
			},
		},
		{
			command: 'node tests/mock-sso/server.mjs',
			url: 'http://localhost:4545/docs-sso?redirect_uri=probe&state=probe',
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
		},
	],
```

(The mock-server `url` probe returns a 302, which Playwright counts as up.)

- [ ] **Step 4: Write the auth spec**

```js
// tests/visual/auth.spec.mjs
/**
 * End-to-end coverage of the SSO handoff and org isolation. Runs in CI
 * (nothing here is tagged @screenshot). Each test gets a fresh browser
 * context, so sessions never bleed between tests.
 */
import { test, expect } from '@playwright/test';

test.describe('private docs', () => {
	// Both the section root and a deep page: a prefix-matching bug could let
	// children through while the root still redirects, which would look fine
	// in any test that only ever hits `/private/`.
	for (const path of ['/private/', '/private/example-private-guide/']) {
		test(`server refuses ${path} without a session`, async ({ page }) => {
			// No cookies, no redirect-following: the raw response must be a
			// redirect to the SSO endpoint, never private HTML.
			const response = await page.request.get(path, { maxRedirects: 0 });
			expect(response.status()).toBe(302);
			expect(response.headers()['location']).toContain('localhost:4545/docs-sso');
			expect(await response.text()).not.toContain('EKLINE-PRIVATE-SENTINEL');
		});
	}

	test('the SSO round trip lands back on the private page, logged in', async ({ page }) => {
		await page.goto('/private/');
		await expect(page).toHaveURL(/\/private\/$/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Private documentation');
	});

	test('the sidebar shows the reader’s org and not others', async ({ page }) => {
		await page.goto('/private/');
		await expect(page.getByRole('link', { name: 'Acme docs' })).toBeVisible();
		await expect(page.getByText('Globex')).toHaveCount(0);
	});

	test('an org member can read their org docs', async ({ page }) => {
		await page.goto('/private/orgs/acme/');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Acme docs');
	});

	test('another org’s docs 404', async ({ page }) => {
		const response = await page.goto('/private/orgs/globex/');
		expect(response.status()).toBe(404);
	});

	test('logout clears the session cookie', async ({ page }) => {
		await page.goto('/private/');
		await page.goto('/auth/logout');
		await expect(page).toHaveURL('/');
		const cookies = await page.context().cookies();
		expect(cookies.find((cookie) => cookie.name === 'docs_session')).toBeUndefined();
	});
});
```

- [ ] **Step 5: Run the browser suite**

Run: `npm run test:visual`
Expected: existing API-reference specs PASS unchanged; all 6 auth tests PASS.
(First run may need `npx playwright install chromium`.)

If the org-visibility test flakes on the mobile project because the sidebar
is collapsed: the sidebar exists in the DOM either way; switch the assertion
to `page.locator('nav').getByText(...)` with `toBeAttached()` instead of
`toBeVisible()`.

- [ ] **Step 6: Commit**

```bash
git add tests/mock-sso/server.mjs tests/visual/auth.spec.mjs playwright.config.mjs package.json
git commit -m "test: mock SSO server and end-to-end auth coverage"
```

---

### Task 12: Documentation and final verification

**Files:**
- Create: `wiki/private-docs.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write `wiki/private-docs.md`**

```markdown
# Private and per-org docs

How the logged-in experience works and which constraints keep it safe.
Read this before touching `src/middleware.ts`, `src/pages/private/`,
`src/pages/auth/`, or the collections in `src/content.config.ts`.

## The security model in one sentence

Private content lives outside the `docs` collection and is only rendered on
demand behind the middleware — it is never part of the static build, so
Pagefind, `llms*.txt`, the sitemap and the `.md` twin routes cannot leak it
**structurally**. `tests/private-leaks.test.mjs` asserts this with a sentinel
phrase; keep the sentinel in at least one private and one org example page.

## Constraints that are easy to break

- **`prerender = false` on every file under `src/pages/private/` and
  `src/pages/auth/`.** Prerendering any of them publishes private HTML as a
  static file that bypasses the middleware entirely.
- **Wrong org is a 404, never a 403.** A 403 confirms the org exists.
- **The middleware guards the `/private/**` prefix, not specific pages.**
  Anything you add under that prefix (an org-specific API reference, say) is
  protected automatically — and anything you add *outside* it is public, no
  matter what it renders.
- **The guard reads `context.originPathname`, never `context.url.pathname`.**
  This is what makes setting `base` safe. `url.pathname` still carries the
  base prefix, so under `base: '/docs'` a request for `/docs/private/secret/`
  would classify as public while Astro strips the base and renders the private
  page — a complete bypass. `originPathname` is base-stripped and matches what
  the router actually matched. A refactor that "simplifies" this back to
  `url.pathname` reintroduces the hole silently, on subpath deployments only.
  (One caveat if you ever add rewrites: `originPathname` keeps the *original*
  path across `Astro.rewrite()`, so re-classifying after a rewrite classifies
  the wrong URL. The shipped middleware does not rewrite.)
- **`orgs/` is a reserved folder name inside `src/content/private-docs/`**
  (excluded by the collection's glob): `/private/orgs/**` belongs to org docs.
- **Fail closed.** `enabled: false` in `src/config/auth.mjs`, or any missing
  env var, makes `/private/**` a 404 in production. The friendly setup page
  appears in `astro dev` only.
- **Keep secrets out of `src/config/auth.mjs`.** Behavior knobs live there;
  `DOCS_SSO_URL`, `DOCS_SSO_SECRET` and `DOCS_SESSION_SECRET` are env vars.
- **Never enable Vercel ISR (`vercel({ isr: true })`).** This is the one
  configuration change that silently defeats everything on this page.
  `@astrojs/vercel` ≤ 10.0.8 carries a high-severity advisory
  (CVE-2026-73424, "unauthenticated path override in the ISR function"):
  with ISR on, `/_isr?x_astro_path=/private/orgs/acme/` renders any route
  **bypassing Astro middleware entirely** — which is where this template's
  only auth check lives. The template calls `vercel()` bare, so it is not
  affected as shipped. The fix landed in `@astrojs/vercel` v11, which
  requires Astro 7; until this template moves to Astro 7, "do not enable
  ISR" is the mitigation, not an upgrade.
- **`@astrojs/node` is pinned to exactly `10.1.1`.** 10.1.2+ imports an Astro
  export that only exists from 6.4.0, so a caret range produces a clean
  `npm ls` and a broken build. The reason is in `astro.config.mjs`.

## The SSO handoff

1. Middleware redirects to `DOCS_SSO_URL` with `redirect_uri` and `state`
   (nonce stored in a short-lived cookie).
2. The customer's product signs a JWT (HS256, `DOCS_SSO_SECRET`) with claims
   `sub`, `email`, `name`, `orgs` (array of folder names under
   `src/content/org-docs/`), `state`, and a short `exp` (≤ 5 minutes), then
   redirects to `redirect_uri?token=<jwt>`.
3. `/auth/callback` verifies signature + `exp` + `state`, sets the site's own
   session cookie (8h), and redirects to the original page.

A loop guard stops the redirect cycle after two failed round trips. The
README has a copy-paste endpoint implementation for customers.

## Adapters and output paths

The adapter is env-selected in `astro.config.mjs`: Vercel builds
(`VERCEL=1`) use `@astrojs/vercel`; everything else uses `@astrojs/node`,
because the Vercel adapter does not support `astro preview` and both test
suites run against the build output. Static files land in `dist/client/`
(Node) or `.vercel/output/static/` (Vercel); tests resolve this via
`tests/helpers/static-dir.mjs`.

## Local development

`npm run dev` needs nothing: `/private/**` shows a setup page. For a working
login: copy `.env.example` to `.env`, run `npm run dev:sso` in a second
terminal. The mock signs you in as `reader@acme.test` with org `acme`.

## Known v1 limits

Private pages are not in site search (Pagefind indexes built HTML only);
the public "Private docs" nav link is static, not session-aware; handoff
verification is HS256 shared-secret (JWKS/OIDC would slot into
`verifyHandoffToken`).
```

- [ ] **Step 2: Add the customer-facing README section**

Append to `README.md` (after the existing feature/config sections):

````markdown
## Private and per-org docs

The template ships a server-enforced logged-in experience:

- `src/content/private-docs/` — pages any logged-in reader can see, at `/private/…`
- `src/content/org-docs/<org>/` — pages only members of `<org>` can see, at `/private/orgs/<org>/…`

Readers sign in through **your product** — the docs site has no user
database. Set three environment variables (`.env.example`) and implement one
endpoint in your product:

```js
// Express example — your product's /docs-sso endpoint.
// npm install jose
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.DOCS_SSO_SECRET);

app.get('/docs-sso', requireYourProductLogin, async (req, res) => {
	const token = await new SignJWT({
		email: req.user.email,
		name: req.user.name,
		orgs: [req.user.orgSlug], // folder names under src/content/org-docs/
		state: req.query.state,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(req.user.id)
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(secret);
	const target = new URL(req.query.redirect_uri);
	target.searchParams.set('token', token);
	res.redirect(target.href);
});
```

Don't need private docs? Delete `src/content/private-docs/`,
`src/content/org-docs/`, `src/pages/private/`, `src/pages/auth/`,
`src/middleware.ts`, `src/config/auth.mjs`, `src/lib/auth/`, and the
`loginLink` entry in `src/config/sidebar.mjs`. Then, to get a plain static
build back, also remove from `astro.config.mjs` the `adapter:` line, the
`env:` block and the two adapter imports, and uninstall `@astrojs/node`,
`@astrojs/vercel` and `jose`. Details: `wiki/private-docs.md`.
````

**Do not skip the second sentence.** Deleting only the feature files leaves
`adapter:` wired, so the build still emits a `dist/server/` bundle and no
root `dist/index.html` — which silently breaks the README's own deploy
instructions for a fork that doesn't want the feature.

- [ ] **Step 2b: Fix the now-inaccurate Deploy section in `README.md`**

`README.md:54` currently says "Astro builds to a static `dist/` folder, so
you can host it almost anywhere" and `:73` lists Netlify, Cloudflare Pages
and GitHub Pages. Both became wrong in Task 2: `dist/` now holds `client/`
and `server/` with no root `index.html`, and on those three hosts `VERCEL` is
unset, so they get the **Node** adapter — a server bundle none of them runs.
A fork following its own README would deploy an empty site *and* have private
docs silently never work. Rewrite that section to say:

- the build output is `dist/client/` (Node adapter) or `.vercel/output/static/`
  (Vercel), not a flat `dist/`;
- Netlify and Cloudflare need their own adapter swapped in for
  `@astrojs/node` (`@astrojs/netlify`, `@astrojs/cloudflare`) — one line in
  `astro.config.mjs`, and the auth code is adapter-agnostic so nothing else
  changes;
- GitHub Pages cannot run a server at all, so it is static-only: follow the
  "don't need private docs" removal above, and the flat `dist/` returns.

Also fix `CLAUDE.md:38`, which still describes the build as producing
`./dist/`.

- [ ] **Step 3: Update `CLAUDE.md`**

In the **Architecture** section, add:

```markdown
- `src/middleware.ts` + `src/pages/private/` + `src/pages/auth/` — the
  server-enforced logged-in experience (private and per-org docs). Read
  [`wiki/private-docs.md`](wiki/private-docs.md) before changing any of it —
  the constraints (prerender flags, 404-not-403, reserved folders, fail-closed
  env handling) are deliberate and tested by `tests/private-leaks.test.mjs`.
- The build is adapter-based: `@astrojs/vercel` on Vercel (`VERCEL=1`),
  `@astrojs/node` everywhere else. Static output is `dist/client/` locally,
  resolved in tests via `tests/helpers/static-dir.mjs` — not `dist/`.
```

In the **Commands** section, add after `npm run test:visual`:

```markdown
- `npm run dev:sso` — mock SSO server for developing the logged-in experience
  locally (pair with `.env` copied from `.env.example`)
```

- [ ] **Step 4: Full verification**

Run: `npm run check && npm test && npm run test:visual`
Expected: everything PASSES.

- [ ] **Step 5: Commit**

```bash
git add wiki/private-docs.md README.md CLAUDE.md
git commit -m "docs: private-docs constraints wiki, customer SSO guide, repo guidance"
```

---

## Open risk to resolve before merging: `vercel.json` rewrites

**Not caused by this plan, but newly relevant because of it.** `vercel.json`
carries two `rewrites` that serve the markdown twins on an
`Accept: text/markdown` header. Before Task 2, Vercel did zero-config
detection on a plain static build and those rewrites applied. Now
`@astrojs/vercel` emits Build Output API v3, and the generated
`.vercel/output/config.json` contains only a filesystem handle, an `_astro`
cache header and a 404 catch-all — no `text/markdown` route.

Vercel's Astro documentation (checked 2026-08-20,
https://vercel.com/docs/frameworks/frontend/astro#rewrites) says plainly:

> **Rewrites only work for static files with Astro.** You must use Vercel's
> Routing Middleware for rewrites. You should not use `vercel.json` to
> rewrite URL paths with astro projects; doing so produces inconsistent
> behavior, and is not officially supported.

The twins *are* static files, so the rewrites may still work — but "may" is
not good enough for a template other people deploy. Two things to note:

1. **Astro middleware cannot replace these rewrites.** Middleware runs only
   on on-demand routes; the pages these rewrites serve are prerendered and
   handed straight to the CDN, so middleware never sees the request.
2. **The downside risk is not limited to the twins.** The same Vercel docs
   warn that a `vercel.json` with conflicting routing config can override
   the adapter's generated configuration. If that happened it would affect
   `/private/**` too — the routes this whole feature depends on.

**Required before merge:** verify on a real Vercel preview deployment that
(a) `curl -H 'Accept: text/markdown' <url>/` still returns markdown, and
(b) `/private/` still reaches the middleware. If either fails, the fix is to
drop the `rewrites` from `vercel.json` and accept that the twins are reached
only at their `.md` URLs on Vercel — the `.md` files themselves are still
emitted and still linked from the contextual menu, so the feature degrades
rather than breaks. Record whichever way it goes in `wiki/private-docs.md`.

This cannot be verified locally: `astro preview` does not read `vercel.json`.

---

## Post-plan checks (execution session)

- Run the three suites one final time from a clean tree: `npm run check`,
  `npm test`, `npm run test:visual`.
- Manual sanity pass: `.env` + `npm run dev:sso` + `npm run dev`, click
  "Private docs" in the sidebar, confirm the round trip, the Acme group, and
  Log out.
- The screenshot baselines are macOS-only (see `playwright.config.mjs`):
  nothing in this plan changes public pages' rendering except the one new
  sidebar link — if a screenshot comparison fails on it, re-baseline with
  `npm run test:visual:update` and eyeball the diff.
