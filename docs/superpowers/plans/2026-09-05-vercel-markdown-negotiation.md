# Markdown Content Negotiation on Vercel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A request to any docs page with `Accept: text/markdown` returns that page's Markdown twin at the same URL on a Vercel deployment — out of the box, on the template as shipped, on the template after the logged-in experience is removed, and on the docs site: one mechanism for all three.

**Architecture:** An Astro integration (`src/lib/vercel-markdown-negotiation.mjs`) runs on `astro:build:done` — after the Vercel adapter's own, measured in Task 0 — and splices four routes into `.vercel/output/config.json` ahead of the `filesystem` handle: a `Vary: Accept` header route and a header-conditional rewrite, for the root and for an alternation of every twin slug. The transform is a pure function over the parsed config and the twin list, tested against a captured real `config.json`. The Vercel adapter is the prerequisite on every Vercel deployment — the removal path keeps it, and `apps/docs` imports the same integration across the monorepo — so there is one mechanism. A deployed smoke test, opt-in via `DOCS_SMOKE_URL`, is the only layer that can see Vercel's router and CDN, and it gates the rewrite-versus-redirect decision.

**Tech Stack:** Astro 6 integration hooks (`astro:config:setup`, `astro:build:done`), Vercel Build Output API v3 `routes`, `node --test`, `node:fs`, global `fetch`.

**Spec:** [`docs/superpowers/specs/2026-09-04-vercel-markdown-negotiation-design.md`](../specs/2026-09-04-vercel-markdown-negotiation-design.md). The plan argues from it; read it first, especially *Design › One mechanism* (why there is no static-build variant), *Design › The integration* (the ordering trick) and *Testing plan* (what each layer can and cannot see).

**Branch:** `pa-claude/content-negotiation-markdown-685f88`, worktree `.claude/worktrees/scalar-astro-integration-547d56`. Based on `main`.

## Global Constraints

- **Node 22.x.** Every command below runs under it.
- **Every project is independent.** `packages/template` and `apps/docs` each have their own `package.json` and lockfile; there are no npm workspaces and nothing is hoisted. Run `npm` commands from inside the project directory, never from the repo root, unless the step says otherwise.
- **Shipped prose is written for the customer.** Anything under `packages/template/` — the integration's comments, `README.md`, `wiki/`, `CHANGELOG.md` — is copied verbatim into a customer's repository. No mention of `apps/`, `.github/`, or "this monorepo". `npm run check:shipped` (from the repo root) enforces the paths; the framing is a review question.
- **Consult the Starlight and Astro docs before changing an Astro project.** <https://docs.astro.build/en/reference/integrations-reference/> for hook signatures; <https://vercel.com/docs/build-output-api/configuration#routes> for the route schema.
- **Commit messages** follow the repo's `type: description` style (see `git log`), and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No ticket is filed for this work; append one to each message if that changes.
- **Do not push without asking.** Task 7 and Task 8 push a branch to create Vercel previews. Each of those steps says to confirm with your human partner first.
- **Never `git stash`** in this worktree (the stash is shared with other sessions). Use a WIP commit to set work aside.

---

## The rule that governs every task here

**Nothing in this plan is verified until it has been observed.** The feature this restores went undetected as broken for three months because the one place it lived was the one place no test looked. Each task below ends with a command whose output you read, not a claim. Where a step says "Expected:", compare the real output against it, and if they differ, stop and report rather than adjust the expectation.

---

### Task 0: Install, capture the adapter's real `config.json`, and verify hook ordering

The rest of the plan builds on two facts the spec asserts but has not measured: the shape of the file the adapter writes, and that an integration added during `astro:config:setup` runs its `astro:build:done` *after* the adapter's. This task measures both on a real build before any production code depends on them.

**Files:**
- Create: `packages/template/tests/fixtures/vercel-config.json`
- Modify (temporarily, reverted within this task): `packages/template/astro.config.mjs`

**Interfaces:**
- Produces: the fixture file, which Task 2's tests read; and a yes/no on ordering, which decides whether Task 4 proceeds as written.

- [ ] **Step 1: Install the template's dependencies**

```bash
cd packages/template && npm ci
```

Expected: completes with no `ERESOLVE` or peer warnings. (`@astrojs/node` is pinned at exactly `10.1.1` on purpose — see the comment in `astro.config.mjs` — so do not "fix" any advisory about it.)

- [ ] **Step 2: Build with the Vercel adapter, locally**

```bash
cd packages/template && rm -rf dist .vercel && VERCEL=1 npm run build
```

Expected: the build completes and `.vercel/output/config.json` and `.vercel/output/static/index.html` both exist. `VERCEL=1` is what selects the adapter (`astro.config.mjs`: `adapter: process.env.VERCEL ? vercel() : node(...)`); no Vercel account or CLI is involved.

- [ ] **Step 3: Read the generated config and check it has what the transform needs**

```bash
cd packages/template && cat .vercel/output/config.json | node -e '
const c = JSON.parse(require("fs").readFileSync(0, "utf-8"));
console.log("version:", c.version);
console.log("routes:", c.routes.length);
c.routes.forEach((r, i) => console.log(String(i).padStart(2), JSON.stringify(r).slice(0, 110)));
const fs = c.routes.findIndex((r) => r.handle === "filesystem");
console.log("filesystem handle at index:", fs);
if (fs === -1) { console.error("NO FILESYSTEM HANDLE — the spec assumes one; stop and report"); process.exit(1); }
'
```

Expected: `version: 3` and a `{ "handle": "filesystem" }` entry. **Measured: it is at index 0, with nothing before it** — the `_astro` cache-control `continue: true` route sits *after* it, at index 1. So "immediately before the filesystem handle" means becoming the new index 0, in the initial routing phase. Task 2's test asserts our routes land immediately before that handle, wherever it is.

- [ ] **Step 4: Confirm where the twins are, and that a twin has an HTML sibling**

```bash
cd packages/template && ls .vercel/output/static/index.md .vercel/output/static/index.html .vercel/output/static/reference/errors.md .vercel/output/static/reference/errors/index.html && echo "--- twins:" && find .vercel/output/static -name '*.md' | wc -l && echo "--- api twins (must be 0):" && find .vercel/output/static/api -name '*.md' 2>/dev/null | wc -l
```

Expected: all four files listed; a twin count in the dozens; `0` under `api/`. This is the ground truth `discoverTwins()` (Task 3) reads.

- [ ] **Step 5: Capture the fixture**

```bash
cd packages/template && mkdir -p tests/fixtures && cp .vercel/output/config.json tests/fixtures/vercel-config.json && grep -c "$HOME" tests/fixtures/vercel-config.json || echo "no absolute paths — good"
```

Expected: `no absolute paths — good`. If `grep` finds your home directory in the file, the fixture is machine-specific; stop and report which key carries it.

- [ ] **Step 6: Add a throwaway ordering probe to `astro.config.mjs`**

Add this import near the top of `packages/template/astro.config.mjs`:

```js
import { existsSync } from 'node:fs'; // ORDERING PROBE — remove before commit
```

and this entry as the **first** element of the `integrations: [` array:

```js
		// ORDERING PROBE — remove before commit. Measures whether an integration
		// added via updateConfig() runs its build:done after the adapter's.
		{
			name: 'ordering-probe',
			hooks: {
				'astro:config:setup': ({ updateConfig }) => {
					updateConfig({
						integrations: [
							{
								name: 'ordering-probe:inner',
								hooks: {
									'astro:build:done': ({ logger }) => {
										logger.info(`INNER build:done — config.json exists: ${existsSync('.vercel/output/config.json')}`);
									},
								},
							},
						],
					});
				},
				'astro:build:done': ({ logger }) => {
					logger.info(`OUTER build:done — config.json exists: ${existsSync('.vercel/output/config.json')}`);
				},
			},
		},
```

- [ ] **Step 7: Build again and read the two log lines**

```bash
cd packages/template && rm -rf .vercel && VERCEL=1 npm run build 2>&1 | grep -E "INNER|OUTER"
```

**Measured, 2026-09-09, adapter 10.0.8 — both lines printed `true`:**

```
[ordering-probe] OUTER build:done — config.json exists: true
[ordering-probe:inner] INNER build:done — config.json exists: true
```

A second probe placed *last* in the `integrations` array printed `true` as well. So the adapter's `astro:build:done` runs ahead of every user integration's, whatever the array position, and **the inner-integration indirection is unnecessary** — Task 4 registers a plain `astro:build:done` hook. The draft's premise (adapter appended last, plain hook too early) was wrong; this step is what caught it.

If a future run of this step ever prints `OUTER … false`, the indirection comes back: register the work through `updateConfig({ integrations: [...] })` during `astro:config:setup`, exactly as this probe does. The pure functions from Tasks 1–3 are unaffected either way; only Task 4's wiring changes.

- [ ] **Step 8: Remove the probe**

Delete the `existsSync` import and the whole `ordering-probe` integration object from `astro.config.mjs`.

```bash
cd packages/template && git diff --stat astro.config.mjs
```

Expected: no output (the file is back to what is committed).

- [ ] **Step 9: Commit the fixture**

```bash
cd packages/template && git add tests/fixtures/vercel-config.json && git commit -m "test: capture the Vercel adapter's generated config.json as a fixture

A real \`VERCEL=1 astro build\` output, so the markdown-negotiation transform
is tested against the routing config the adapter actually writes rather than
an imagined shape.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: The Accept matcher and regex escaping

Two tiny pure functions that everything else composes. The matcher is the one thing in this feature that the original 2026-05-13 implementation got wrong (it only matched a bare `Accept: text/markdown`), so it gets tested against real headers first.

**Files:**
- Create: `packages/template/src/lib/vercel-markdown-negotiation.mjs`
- Create: `packages/template/tests/markdown-negotiation.test.mjs`

**Interfaces:**
- Produces:
  - `export const ACCEPT_MARKDOWN: string` — a regex *source* (not a `RegExp`), written to give the same answer whether or not the engine anchors it to the whole header. Used verbatim as the `has[].value` in Task 2 and in `vercel.json` in Task 8.
  - `export function acceptsMarkdown(accept: string | null | undefined): boolean` — `ACCEPT_MARKDOWN` applied anchored, for tests and for readers.
  - `export function escapeRegex(s: string): string` — escapes PCRE/JS metacharacters so a slug can sit inside an alternation.

- [ ] **Step 1: Write the failing tests**

Create `packages/template/tests/markdown-negotiation.test.mjs`:

```js
/**
 * Unit tests for `src/lib/vercel-markdown-negotiation.mjs` — the pure parts.
 *
 * No build, no network, no Vercel. The transform is tested against
 * `tests/fixtures/vercel-config.json`, a real `config.json` captured from a
 * `VERCEL=1 astro build`, so these assertions hold for the shape the adapter
 * actually writes. What they cannot see is whether Vercel's router evaluates
 * the routes the way its documentation says; `tests/deployed-smoke.test.mjs`
 * covers that against a real deployment.
 *
 * Run: `node --test tests/markdown-negotiation.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ACCEPT_MARKDOWN,
	acceptsMarkdown,
	escapeRegex,
} from '../src/lib/vercel-markdown-negotiation.mjs';

// Real headers. Chrome/Firefox/Safari defaults as of 2026; `*/*` is curl's.
const CHROME =
	'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
const FIREFOX = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
const SAFARI = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const CURL = '*/*';

test('acceptsMarkdown: matches text/markdown as a media-type token', () => {
	for (const accept of [
		'text/markdown',
		'text/markdown;q=0.9',
		'text/markdown, text/plain;q=0.9, */*;q=0.8', // the realistic agent header
		'text/plain, text/markdown',
		'text/plain,text/markdown', // no space after the comma
		'application/json, text/markdown;q=0.5, */*;q=0.1',
	]) {
		assert.ok(acceptsMarkdown(accept), `should match: ${accept}`);
	}
});

test('acceptsMarkdown: rejects browsers, curl, empty, and near-misses', () => {
	for (const accept of [CHROME, FIREFOX, SAFARI, CURL, '', undefined, null, 'text/markdownx', 'application/markdown', 'text/x-markdown']) {
		assert.ok(!acceptsMarkdown(accept), `should NOT match: ${String(accept)}`);
	}
});

test('ACCEPT_MARKDOWN gives the same answers unanchored as anchored', () => {
	// Vercel documents `has.value` as a regex but not whether it is anchored to
	// the whole header. The pattern is written so it does not matter; this
	// test is what makes that a fact rather than a hope.
	const unanchored = new RegExp(ACCEPT_MARKDOWN);
	const anchored = new RegExp(`^(?:${ACCEPT_MARKDOWN})$`);
	for (const accept of ['text/markdown', 'text/markdown, */*', 'text/plain, text/markdown', CHROME, CURL, 'text/markdownx']) {
		assert.equal(unanchored.test(accept), anchored.test(accept), `disagree on: ${accept}`);
	}
});

test('escapeRegex: metacharacters in a slug become literals', () => {
	assert.equal(escapeRegex('reference/errors'), 'reference/errors');
	assert.equal(escapeRegex('v1.2/api'), 'v1\\.2/api');
	assert.equal(escapeRegex('a+b (c)'), 'a\\+b \\(c\\)');
	assert.equal(new RegExp(`^${escapeRegex('v1.2')}$`).test('v1x2'), false, 'the dot must not be a wildcard');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: FAIL — `Cannot find module '../src/lib/vercel-markdown-negotiation.mjs'`.

- [ ] **Step 3: Write the module with just these two exports**

Create `packages/template/src/lib/vercel-markdown-negotiation.mjs`:

```js
/**
 * Markdown content negotiation on Vercel.
 *
 * Every docs page has a Markdown twin at `<page>.md` (generated by
 * `@ekline/starlight-contextual-menu`). This integration makes a request to
 * the page's own URL with `Accept: text/markdown` return that twin — the
 * convention agents and crawlers use to ask for Markdown without knowing the
 * URL shape. Browsers, which never send `text/markdown`, see no change.
 *
 * Why it is shaped this way — three constraints, all measured:
 *
 *   1. `vercel.json` rewrites cannot do it. `@astrojs/vercel` emits Build
 *      Output API v3, whose generated `.vercel/output/config.json` supersedes
 *      `vercel.json` routing entirely. (They were tried; they were inert.)
 *   2. Astro middleware cannot do it, even in `middlewareMode: 'edge'`: the
 *      adapter's docs say prerendered pages are served from Vercel's filesystem
 *      and never invoke middleware. Every docs page is prerendered.
 *   3. Build Output API `routes` can. A route placed before
 *      `{ "handle": "filesystem" }` is evaluated before static files are
 *      served, and may match on a request header and rewrite.
 *
 * So the integration edits the adapter's own output: after the build, it reads
 * `config.json`, splices in four routes ahead of the filesystem handle, and
 * writes it back. The routes are built by pure functions below so they can be
 * tested without a build; `applyToBuildOutput()` is the only thing that
 * touches the disk.
 *
 * On ordering: this reads a file the adapter writes, so it has to run after it.
 * `@astrojs/vercel` writes `config.json` in its own `astro:build:done`, and
 * Astro runs the adapter's hooks ahead of every user integration's — a probe
 * placed first in the `integrations` array and one placed last both saw the
 * file already there. So a plain `astro:build:done` is enough. Measured on a
 * real build rather than assumed; the guard in `applyToBuildOutput` is what
 * catches it if that ever changes.
 *
 * Off Vercel there is no `.vercel/` directory and this does nothing.
 *
 * See wiki/private-docs.md § Markdown content negotiation on Vercel.
 */

/**
 * The `Accept` header wants Markdown when it lists `text/markdown` as a
 * complete media-type token: `text/markdown`, `text/markdown;q=0.9`,
 * `text/plain, text/markdown, *\/*` all do; `text/markdownx` does not.
 *
 * A regex *source*, used verbatim as a Vercel `has[].value`. Vercel documents
 * that value as a regex but not whether it anchors it to the whole header, so
 * the pattern is written to give the same answer either way — the leading
 * `(^|.*[,\s])` and trailing `([;,\s].*|$)` absorb whatever surrounds the
 * token. Quality values are not evaluated: Build Output routing cannot, and no
 * browser or known agent sends `text/markdown` with a q below `text/html`.
 */
export const ACCEPT_MARKDOWN = String.raw`(^|.*[,\s])text/markdown([;,\s].*|$)`;

/** `ACCEPT_MARKDOWN`, applied. For tests and for reading. */
export function acceptsMarkdown(accept) {
	return new RegExp(`^(?:${ACCEPT_MARKDOWN})$`).test(accept ?? '');
}

/** Escapes a slug so it can sit inside a regex alternation as a literal. */
export function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd packages/template && git add src/lib/vercel-markdown-negotiation.mjs tests/markdown-negotiation.test.mjs && git commit -m "feat: the Accept matcher for markdown negotiation, tested against real headers

The original vercel.json rewrite matched only a bare \`Accept: text/markdown\`;
a realistic agent header such as \`text/markdown, text/plain;q=0.9, */*;q=0.8\`
fell through to HTML. This pattern matches the media type as a token wherever
it sits, and gives the same answer whether or not Vercel anchors it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The route builder and the config transform

The pure core. `negotiationRoutes()` turns a twin list into the four routes; `withMarkdownNegotiation()` splices them into a parsed `config.json` ahead of the filesystem handle. Tested against the fixture from Task 0.

**Files:**
- Modify: `packages/template/src/lib/vercel-markdown-negotiation.mjs`
- Modify: `packages/template/tests/markdown-negotiation.test.mjs`
- Read: `packages/template/tests/fixtures/vercel-config.json`

**Interfaces:**
- Consumes: `ACCEPT_MARKDOWN`, `escapeRegex` (Task 1).
- Produces:
  - `export function negotiationRoutes(twins: { root: boolean, slugs: string[] }): Route[]` — 0, 2, or 4 route objects, in the order they must appear in `config.json`.
  - `export function withMarkdownNegotiation(config: object, twins): object` — a **new** config object; the input is not mutated. Throws if `config.routes` has no `{ handle: 'filesystem' }`, or if negotiation routes are already present.
  - The two markers later tasks use to find our routes in a config: the rewrite routes have `dest === '/$1.md'` (slugs) or `dest === '/index.md'` (root); the header routes have `continue === true` and `headers.Vary === 'Accept'`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/template/tests/markdown-negotiation.test.mjs` (add the new imports to the existing `import { … } from '../src/lib/…'` line, and the `readFileSync`/`fileURLToPath` imports at the top):

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// … existing imports gain:
//   negotiationRoutes, withMarkdownNegotiation

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(__dirname, 'fixtures/vercel-config.json'), 'utf-8'));

const TWINS = { root: true, slugs: ['concepts/glossary', 'get-started/quickstart', 'reference/errors'] };

const isRewrite = (r) => r.dest === '/$1.md' || r.dest === '/index.md';
const isVary = (r) => r.continue === true && r.headers?.Vary === 'Accept';

test('negotiationRoutes: four routes for root + slugs, in the documented order', () => {
	const routes = negotiationRoutes(TWINS);
	assert.equal(routes.length, 4);
	// 1–2: Vary, with continue, so the HTML response carries it too.
	assert.ok(isVary(routes[0]) && !routes[0].has, 'route 0 is the slug Vary route');
	assert.ok(isVary(routes[1]) && routes[1].src === '^/$', 'route 1 is the root Vary route');
	// 3–4: the rewrites, header-conditional.
	assert.equal(routes[2].dest, '/$1.md');
	assert.equal(routes[3].dest, '/index.md');
	assert.equal(routes[3].src, '^/$');
	for (const r of routes.slice(2)) {
		assert.deepEqual(r.has, [{ type: 'header', key: 'accept', value: ACCEPT_MARKDOWN }]);
		assert.equal(r.headers.Vary, 'Accept');
		assert.equal(r.continue, undefined, 'a rewrite ends routing');
	}
});

test('negotiationRoutes: the slug alternation is exact, escaped, and slash-tolerant', () => {
	// root: false, so only the two slug routes come back.
	const [vary, rewrite] = negotiationRoutes({ root: false, slugs: ['a/b', 'v1.2', 'c'] });
	assert.equal(rewrite.src, '^/(a/b|v1\\.2|c)/?$');
	assert.equal(vary.src, rewrite.src);
	const re = new RegExp(rewrite.src);
	assert.ok(re.test('/a/b/') && re.test('/a/b'), 'with and without the trailing slash');
	assert.ok(!re.test('/a/b/c/') && !re.test('/a') && !re.test('/v1x2/'), 'nothing outside the set');
	assert.equal('/a/b/'.replace(re, '/$1.md'), '/a/b.md', '$1 captures the slug');
});

test('negotiationRoutes: root-only and slugs-only produce two routes; neither produces none', () => {
	assert.equal(negotiationRoutes({ root: true, slugs: [] }).length, 2);
	assert.equal(negotiationRoutes({ root: false, slugs: ['x'] }).length, 2);
	assert.deepEqual(negotiationRoutes({ root: false, slugs: [] }), []);
});

test('negotiationRoutes: constant route count whatever the page count', () => {
	const many = Array.from({ length: 1000 }, (_, i) => `section-${i % 10}/page-${i}`);
	assert.equal(negotiationRoutes({ root: true, slugs: many }).length, 4);
});

test('withMarkdownNegotiation: routes land immediately before the filesystem handle', () => {
	const out = withMarkdownNegotiation(FIXTURE, TWINS);
	const fs = out.routes.findIndex((r) => r.handle === 'filesystem');
	assert.ok(fs >= 4, 'filesystem handle is after our four routes');
	const ours = out.routes.slice(fs - 4, fs);
	assert.equal(ours.filter(isVary).length, 2);
	assert.equal(ours.filter(isRewrite).length, 2);
});

test('withMarkdownNegotiation: every adapter route survives, in order', () => {
	const out = withMarkdownNegotiation(FIXTURE, TWINS);
	const theirs = out.routes.filter((r) => !isVary(r) && !isRewrite(r));
	assert.deepEqual(theirs, FIXTURE.routes);
});

test('withMarkdownNegotiation: does not mutate its input', () => {
	const before = JSON.stringify(FIXTURE);
	withMarkdownNegotiation(FIXTURE, TWINS);
	assert.equal(JSON.stringify(FIXTURE), before);
});

test('withMarkdownNegotiation: everything but routes is carried through untouched', () => {
	const out = withMarkdownNegotiation(FIXTURE, TWINS);
	const { routes: _a, ...restIn } = FIXTURE;
	const { routes: _b, ...restOut } = out;
	assert.deepEqual(restOut, restIn);
});

test('withMarkdownNegotiation: refuses a config with no filesystem handle', () => {
	assert.throws(
		() => withMarkdownNegotiation({ version: 3, routes: [{ src: '/.*', dest: '/x' }] }, TWINS),
		/filesystem/
	);
});

test('withMarkdownNegotiation: refuses to apply twice', () => {
	const once = withMarkdownNegotiation(FIXTURE, TWINS);
	assert.throws(() => withMarkdownNegotiation(once, TWINS), /already/);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: the four Task 1 tests pass; the ten new ones FAIL with `negotiationRoutes is not a function` / `withMarkdownNegotiation is not a function`.

- [ ] **Step 3: Implement the two functions**

Append to `packages/template/src/lib/vercel-markdown-negotiation.mjs`:

```js
const VARY_ACCEPT = { Vary: 'Accept' };
const WANTS_MARKDOWN = [{ type: 'header', key: 'accept', value: ACCEPT_MARKDOWN }];

/**
 * The four routes, in the order they must appear. `twins` is
 * `{ root, slugs }` — whether `/` has a twin, and the slugs that do
 * (`reference/errors` for `/reference/errors/` ↔ `/reference/errors.md`).
 *
 * Why four and not two: the rewrite alone would leave the *HTML* response
 * without `Vary: Accept`, and a cached HTML body could then be served to a
 * Markdown request. The first two routes attach the header to every
 * negotiable URL whatever the `Accept` and `continue`, exactly as the adapter's
 * own `_astro` cache-control route does; the last two are the rewrites.
 *
 * Why an alternation and not a route per slug: `config.json` would grow with
 * page count, and Vercel's routing has ceilings. One regex keeps the exact set
 * — a page with no twin never rewrites — at a constant route count.
 *
 * Why `/?$`: the site emits `/reference/errors/`, but Vercel serves the
 * slash-less form too, and both are the same page.
 */
export function negotiationRoutes({ root, slugs }) {
	const routes = [];
	const slugSrc = slugs.length ? `^/(${slugs.map(escapeRegex).join('|')})/?$` : null;
	if (slugSrc) routes.push({ src: slugSrc, headers: VARY_ACCEPT, continue: true });
	if (root) routes.push({ src: '^/$', headers: VARY_ACCEPT, continue: true });
	if (slugSrc) routes.push({ src: slugSrc, has: WANTS_MARKDOWN, dest: '/$1.md', headers: VARY_ACCEPT });
	if (root) routes.push({ src: '^/$', has: WANTS_MARKDOWN, dest: '/index.md', headers: VARY_ACCEPT });
	return routes;
}

const isNegotiationRoute = (r) => r.dest === '/$1.md' || r.dest === '/index.md';

/**
 * A new config with the negotiation routes spliced in immediately before
 * `{ "handle": "filesystem" }` — the boundary after which Vercel serves static
 * files, so a route must sit before it to be consulted for a prerendered page.
 * Pure: the input is not touched.
 */
export function withMarkdownNegotiation(config, twins) {
	const routes = config.routes ?? [];
	const at = routes.findIndex((r) => r.handle === 'filesystem');
	if (at === -1) {
		throw new Error(
			'[vercel-markdown-negotiation] config.json has no { "handle": "filesystem" } route. ' +
				'The adapter output has changed shape; see wiki/private-docs.md § Markdown content negotiation on Vercel.'
		);
	}
	if (routes.some(isNegotiationRoute)) {
		throw new Error('[vercel-markdown-negotiation] config.json already carries the negotiation routes.');
	}
	return {
		...config,
		routes: [...routes.slice(0, at), ...negotiationRoutes(twins), ...routes.slice(at)],
	};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: `# pass 14`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd packages/template && git add src/lib/vercel-markdown-negotiation.mjs tests/markdown-negotiation.test.mjs && git commit -m "feat: build the negotiation routes and splice them into the adapter's config

Four routes ahead of the filesystem handle — Vary on the HTML side, then the
header-conditional rewrite — for the root and for one alternation of every
twin slug, so the route count does not grow with the site. Pure, and tested
against the captured config.json.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Twin discovery from the static output

Reads the build output to find which URLs have twins. The definition is exact — a `.md` with an HTML page at the corresponding route — so a stray `public/README.md` is not a twin and the Scalar `/api/**` pages, which have HTML but no `.md`, are not either.

**Files:**
- Modify: `packages/template/src/lib/vercel-markdown-negotiation.mjs`
- Modify: `packages/template/tests/markdown-negotiation.test.mjs`

**Interfaces:**
- Produces: `export function discoverTwins(staticDir: string): { root: boolean, slugs: string[] }` — `slugs` sorted, POSIX-separated, without a leading slash or `.md`.

- [ ] **Step 1: Write the failing tests**

Append to the test file (add `mkdtempSync`, `mkdirSync`, `writeFileSync`, `rmSync` to the `node:fs` import, `tmpdir` from `node:os`, and `discoverTwins` to the module import):

```js
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** Builds a fake static dir. `files` are POSIX paths relative to the root. */
function fakeStaticDir(files) {
	const dir = mkdtempSync(join(tmpdir(), 'twins-'));
	for (const f of files) {
		mkdirSync(join(dir, dirname(f)), { recursive: true });
		writeFileSync(join(dir, f), f.endsWith('.md') ? '# x\n' : '<!doctype html>');
	}
	return dir;
}

test('discoverTwins: a .md beside <slug>/index.html is a twin; index.md beside index.html is the root', (t) => {
	const dir = fakeStaticDir([
		'index.html',
		'index.md',
		'reference/errors/index.html',
		'reference/errors.md',
		'get-started/quickstart/index.html',
		'get-started/quickstart.md',
	]);
	t.after(() => rmSync(dir, { recursive: true }));
	assert.deepEqual(discoverTwins(dir), { root: true, slugs: ['get-started/quickstart', 'reference/errors'] });
});

test('discoverTwins: a .md with no HTML sibling is not a twin, and HTML with no .md is not either', (t) => {
	const dir = fakeStaticDir([
		'index.html',
		'README.md', // from public/ — no /README/ page
		'404.html',
		'404.md', // beside 404.html, not 404/index.html — the 404 page has no route of its own
		'api/index.html', // Scalar — HTML, no twin
		'guides/example/index.html',
		'guides/example.md',
	]);
	t.after(() => rmSync(dir, { recursive: true }));
	assert.deepEqual(discoverTwins(dir), { root: false, slugs: ['guides/example'] });
});

test('discoverTwins: empty output is no twins, not an error', (t) => {
	const dir = fakeStaticDir(['index.html']);
	t.after(() => rmSync(dir, { recursive: true }));
	assert.deepEqual(discoverTwins(dir), { root: false, slugs: [] });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: 14 pass, 3 FAIL with `discoverTwins is not a function`.

- [ ] **Step 3: Implement `discoverTwins`**

Add the imports at the top of `src/lib/vercel-markdown-negotiation.mjs`:

```js
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
```

and append:

```js
function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(p);
		else yield p;
	}
}

/**
 * Which URLs have a twin, read from the emitted static directory — the same
 * ground truth `tests/markdown-twins.test.mjs` checks. A twin is `<slug>.md`
 * beside `<slug>/index.html`; `index.md` beside `index.html` is the root's.
 * Anything else — a `.md` dropped into `public/`, a page with no `.md`, the
 * `404.md` beside `404.html` — is not, and never negotiates.
 */
export function discoverTwins(staticDir) {
	let root = false;
	const slugs = [];
	for (const file of walk(staticDir)) {
		if (!file.endsWith('.md')) continue;
		const rel = relative(staticDir, file).split(sep).join('/');
		if (rel === 'index.md') {
			root = existsSync(join(staticDir, 'index.html'));
			continue;
		}
		const slug = rel.slice(0, -'.md'.length);
		if (existsSync(join(staticDir, ...slug.split('/'), 'index.html'))) slugs.push(slug);
	}
	slugs.sort();
	return { root, slugs };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: `# pass 17`, `# fail 0`.

- [ ] **Step 5: Run it against the real build output from Task 0, as a sanity check**

```bash
cd packages/template && node -e "
import('./src/lib/vercel-markdown-negotiation.mjs').then(({ discoverTwins }) => {
  const t = discoverTwins('.vercel/output/static');
  console.log('root:', t.root, 'slugs:', t.slugs.length);
  console.log(t.slugs.filter((s) => s.startsWith('api/') || s.startsWith('private/')).length, 'under api/ or private/ (must be 0)');
  console.log(t.slugs.slice(0, 5));
});"
```

Expected: `root: true`, a slug count in the dozens, `0 under api/ or private/`, and the first few slugs looking like `changelog`, `concepts/glossary`, … If `.vercel/output/static` is gone (Task 0 cleaned it), rebuild it first: `rm -rf dist .vercel && VERCEL=1 npm run build`.

- [ ] **Step 6: Commit**

```bash
cd packages/template && git add src/lib/vercel-markdown-negotiation.mjs tests/markdown-negotiation.test.mjs && git commit -m "feat: discover markdown twins from the static build output

A twin is a .md with an HTML page at the corresponding route — the same
definition the twins test uses — so a stray public/README.md and the Scalar
/api/** pages are never in the set.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `applyToBuildOutput`, the integration, and its registration

The only impure function, the integration factory that wires it to the build, and the one-line registration. Ends with a real `VERCEL=1` build whose `config.json` carries the routes.

**Files:**
- Modify: `packages/template/src/lib/vercel-markdown-negotiation.mjs`
- Modify: `packages/template/tests/markdown-negotiation.test.mjs`
- Modify: `packages/template/astro.config.mjs` (imports at top; `integrations` array)

**Interfaces:**
- Consumes: `discoverTwins`, `withMarkdownNegotiation` (Tasks 2–3).
- Produces:
  - `export function applyToBuildOutput({ projectRoot: string }): { configPath: string, root: boolean, slugs: string[] } | null` — reads `<projectRoot>/.vercel/output/config.json`, discovers twins under `<projectRoot>/.vercel/output/static`, writes the patched config back, returns what it did. Returns `null` (touching nothing) when there is no `config.json` **and** `process.env.VERCEL` is unset; throws when there is no `config.json` and `VERCEL` *is* set.
  - `export default function vercelMarkdownNegotiation(): AstroIntegration` — a plain integration: `astro:config:setup` records the project root, `astro:build:done` applies the transform.

- [ ] **Step 1: Write the failing tests**

Append to the test file (add `applyToBuildOutput` to the module import; `mkdirSync`/`writeFileSync`/`rmSync` are already imported):

```js
/** A fake project root with a Vercel-shaped build output. */
function fakeProject({ withConfig = true, files = ['index.html', 'index.md', 'guides/example/index.html', 'guides/example.md'] } = {}) {
	const root = mkdtempSync(join(tmpdir(), 'project-'));
	const out = join(root, '.vercel', 'output');
	for (const f of files) {
		mkdirSync(join(out, 'static', dirname(f)), { recursive: true });
		writeFileSync(join(out, 'static', f), f.endsWith('.md') ? '# x\n' : '<!doctype html>');
	}
	if (withConfig) writeFileSync(join(out, 'config.json'), JSON.stringify(FIXTURE));
	return root;
}

/** Runs `fn` with `process.env.VERCEL` set to `value` (or deleted), then restores it. */
function withVercelEnv(value, fn) {
	const had = Object.hasOwn(process.env, 'VERCEL');
	const prev = process.env.VERCEL;
	if (value === undefined) delete process.env.VERCEL;
	else process.env.VERCEL = value;
	try {
		return fn();
	} finally {
		if (had) process.env.VERCEL = prev;
		else delete process.env.VERCEL;
	}
}

test('applyToBuildOutput: patches config.json in place and reports what it did', (t) => {
	const root = fakeProject();
	t.after(() => rmSync(root, { recursive: true }));
	const result = withVercelEnv('1', () => applyToBuildOutput({ projectRoot: root }));
	assert.deepEqual(result, { configPath: join(root, '.vercel/output/config.json'), root: true, slugs: ['guides/example'] });
	const written = JSON.parse(readFileSync(result.configPath, 'utf-8'));
	assert.equal(written.routes.filter(isRewrite).length, 2);
	assert.ok(written.routes.find((r) => r.dest === '/$1.md').src.includes('guides/example'));
});

test('applyToBuildOutput: off Vercel, with no config.json, does nothing and says so', (t) => {
	const root = fakeProject({ withConfig: false });
	t.after(() => rmSync(root, { recursive: true }));
	assert.equal(withVercelEnv(undefined, () => applyToBuildOutput({ projectRoot: root })), null);
	assert.ok(!existsSync(join(root, '.vercel/output/config.json')), 'nothing was created');
});

test('applyToBuildOutput: on Vercel, with no config.json, throws rather than shipping without the feature', (t) => {
	const root = fakeProject({ withConfig: false });
	t.after(() => rmSync(root, { recursive: true }));
	assert.throws(() => withVercelEnv('1', () => applyToBuildOutput({ projectRoot: root })), /config\.json.*not found|ordering/i);
});
```

(Add `existsSync` to the `node:fs` import in the test file if it is not there yet.)

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: 17 pass, 3 FAIL with `applyToBuildOutput is not a function`.

- [ ] **Step 3: Implement `applyToBuildOutput` and the integration**

Extend the imports at the top of `src/lib/vercel-markdown-negotiation.mjs`:

```js
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
```

and append:

```js
/** Where `@astrojs/vercel` writes its output, relative to the project root. */
const OUTPUT_DIR = '.vercel/output';

/**
 * Reads the adapter's `config.json`, adds the negotiation routes, writes it
 * back. Returns what it did, or `null` when there is nothing to do.
 *
 * The guard is asymmetric on purpose. With no `config.json` and `VERCEL`
 * unset, this is a local or self-hosted build and silence is right. With
 * `VERCEL` set and no `config.json`, the ordering noted in this file's header
 * has changed — this hook ran before the adapter wrote the file — and the
 * deploy would silently lack the feature. That is the failure this
 * feature already suffered once; it throws instead.
 */
export function applyToBuildOutput({ projectRoot }) {
	const configPath = join(projectRoot, OUTPUT_DIR, 'config.json');
	if (!existsSync(configPath)) {
		if (process.env.VERCEL) {
			throw new Error(
				`[vercel-markdown-negotiation] VERCEL is set but ${relative(projectRoot, configPath)} was not found ` +
					'when the integration ran. It must run after the adapter writes that file; Astro has run the ' +
					'adapter first in every measured build. See wiki/private-docs.md § Markdown content negotiation on Vercel.'
			);
		}
		return null;
	}
	const twins = discoverTwins(join(projectRoot, OUTPUT_DIR, 'static'));
	const config = JSON.parse(readFileSync(configPath, 'utf-8'));
	writeFileSync(configPath, JSON.stringify(withMarkdownNegotiation(config, twins), null, 2) + '\n');
	return { configPath, ...twins };
}

/**
 * The integration. `astro:config:setup` records the project root;
 * `astro:build:done` does the work — by which time the adapter has already
 * written `config.json` (see the header comment on ordering).
 */
export default function vercelMarkdownNegotiation() {
	let projectRoot;
	return {
		name: 'vercel-markdown-negotiation',
		hooks: {
			'astro:config:setup': ({ config }) => {
				projectRoot = fileURLToPath(config.root);
			},
			'astro:build:done': ({ logger }) => {
				const result = applyToBuildOutput({ projectRoot });
				if (!result) return;
				const pages = result.slugs.length + (result.root ? 1 : 0);
				logger.info(`${pages} pages answer Accept: text/markdown (${relative(projectRoot, result.configPath)})`);
			},
		},
	};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd packages/template && node --test tests/markdown-negotiation.test.mjs
```

Expected: `# pass 20`, `# fail 0`.

- [ ] **Step 5: Register the integration in `astro.config.mjs`**

Add the import alongside the other local imports near the top of `packages/template/astro.config.mjs`:

```js
import vercelMarkdownNegotiation from './src/lib/vercel-markdown-negotiation.mjs';
```

Then add this as the **last** entry of the `integrations: [` array, after the `starlight({ … })` block's closing `}),`:

```js
		// On Vercel, a request to a page with `Accept: text/markdown` gets the
		// page's Markdown twin at the same URL. Edits the adapter's generated
		// routing config after the build — `vercel.json` rewrites cannot reach it
		// and middleware never sees prerendered pages. Does nothing off Vercel.
		// Delete this line to turn it off. See wiki/private-docs.md.
		vercelMarkdownNegotiation(),
```

- [ ] **Step 6: Build with the Vercel adapter and read the log line**

```bash
cd packages/template && rm -rf dist .vercel && VERCEL=1 npm run build 2>&1 | grep -i "negotiation"
```

Expected: one line like `[vercel-markdown-negotiation] 12 pages answer Accept: text/markdown (.vercel/output/config.json)`. The number is the slug count from Task 3 Step 5 plus one for the root — 12 on this site as measured in Task 0 (13 `.md` files, of which `index.md` is the root's and `404.md` is not a twin at all: the 404 page is `404.html`, with no `404/index.html`).

- [ ] **Step 7: Confirm the routes are in the file, ahead of the filesystem handle**

```bash
cd packages/template && node -e '
const c = JSON.parse(require("fs").readFileSync(".vercel/output/config.json", "utf-8"));
const fs = c.routes.findIndex((r) => r.handle === "filesystem");
const ours = c.routes.map((r, i) => [r, i]).filter(([r]) => r.dest === "/$1.md" || r.dest === "/index.md" || (r.continue && r.headers?.Vary === "Accept"));
console.log("filesystem at", fs, "| ours at", ours.map(([, i]) => i).join(","));
console.log("rewrite src length:", c.routes.find((r) => r.dest === "/$1.md").src.length);
'
```

Expected: four indexes, all `< fs`, contiguous, ending at `fs - 1`. Note the `src` length for the spike report (Task 7); a site this size is around 1 KB.

- [ ] **Step 8: Confirm the Node-adapter build is untouched**

```bash
cd packages/template && rm -rf dist .vercel && npm run build 2>&1 | grep -ci "negotiation"; ls .vercel 2>&1 | head -1
```

Expected: `0` (no log line — the hook returned early) and `ls: .vercel: No such file or directory`.

- [ ] **Step 9: Run the whole hermetic suite**

```bash
cd packages/template && npm test
```

Expected: every test file passes, including the existing `markdown-twins.test.mjs`. (`npm test` builds with the Node adapter, so the new integration is inert here; that is the point of this step.)

- [ ] **Step 10: Commit**

```bash
cd packages/template && git add src/lib/vercel-markdown-negotiation.mjs tests/markdown-negotiation.test.mjs astro.config.mjs && git commit -m "feat: markdown content negotiation on Vercel, via the adapter's routing config

An integration that, after the Vercel adapter has written
.vercel/output/config.json, splices in routes ahead of the filesystem handle so
a request with Accept: text/markdown gets the page's .md twin at the same URL.
The 2.1.0 vercel.json rewrites could not reach that file, and middleware never
sees prerendered pages; this can, and it throws rather than deploy silently
without the feature if it ever runs before the adapter.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Layer 2 — assert on the real `config.json` from the twins test

`tests/markdown-twins.test.mjs` already walks the build output and knows what a twin is. When that output is a Vercel-adapter build, it should also check that the routing config agrees with the files on disk. Skipped, not failed, on a Node-adapter build — with a message saying how to run it.

**Files:**
- Modify: `packages/template/tests/markdown-twins.test.mjs` (header comment at lines 17–21; new tests appended)

**Interfaces:**
- Consumes: the route markers from Task 2 (`dest === '/$1.md'`, `dest === '/index.md'`, `continue && headers.Vary === 'Accept'`).

- [ ] **Step 1: Rewrite the header paragraph that says negotiation is gone**

In `packages/template/tests/markdown-twins.test.mjs`, replace this paragraph in the header comment:

```js
 * Content negotiation (`Accept: text/markdown` -> `.md`) is gone: it lived in
 * `vercel.json` rewrites that the Vercel adapter's generated routing config
 * makes inert — measured on the deployed site, see "Resolved: `vercel.json`
 * rewrites" in wiki/private-docs.md. The `.md` twins themselves are unaffected
 * and are what everything links to, which is what this file checks.
```

with:

```js
 * Content negotiation (`Accept: text/markdown` -> `.md`) is provided on Vercel
 * by `src/lib/vercel-markdown-negotiation.mjs`, which writes routes into the
 * adapter's `.vercel/output/config.json`. When this suite runs against that
 * output (`VERCEL=1 npm run build`), the last tests below check the routing
 * config against the files on disk; on a Node-adapter build they are skipped,
 * because there is no routing config to check. Whether Vercel's router then
 * does what the config says is `tests/deployed-smoke.test.mjs`'s question.
```

- [ ] **Step 2: Write the failing tests**

Append to the file:

```js
// ---------------------------------------------------------------------------
// Vercel-adapter builds only: the routing config must agree with the disk.
// ---------------------------------------------------------------------------

const IS_VERCEL_OUTPUT = STATIC_DIR.endsWith(join('.vercel', 'output', 'static'));
const unlessVercel = IS_VERCEL_OUTPUT
	? false
	: 'Node-adapter build; run `VERCEL=1 npm run build` to check the Vercel routing config';

const readVercelConfig = () => JSON.parse(readFileSync(join(STATIC_DIR, '..', 'config.json'), 'utf-8'));
const isRewrite = (r) => r.dest === '/$1.md' || r.dest === '/index.md';
const isVary = (r) => r.continue === true && r.headers?.Vary === 'Accept';

/** The slugs a twin definition yields from disk: `<slug>.md` beside `<slug>/index.html`. */
function twinSlugsOnDisk() {
	return mdFiles
		.map((p) => relative(STATIC_DIR, p).split(sep).join('/'))
		.filter((rel) => rel !== 'index.md')
		.map((rel) => rel.slice(0, -'.md'.length))
		.filter((slug) => existsSync(join(STATIC_DIR, ...slug.split('/'), 'index.html')))
		.sort();
}

test('Vercel config.json: the four negotiation routes sit just before the filesystem handle', { skip: unlessVercel }, () => {
	const { routes } = readVercelConfig();
	const fs = routes.findIndex((r) => r.handle === 'filesystem');
	assert.ok(fs >= 4, 'a filesystem handle exists after our routes');
	const ours = routes.slice(fs - 4, fs);
	assert.equal(ours.filter(isVary).length, 2, 'two Vary routes');
	assert.equal(ours.filter(isRewrite).length, 2, 'two rewrite routes');
	assert.equal(routes.filter((r) => isVary(r) || isRewrite(r)).length, 4, 'and no others anywhere');
});

test('Vercel config.json: the alternation is exactly the twins on disk, and none is under api/ or private/', { skip: unlessVercel }, () => {
	const rewrite = readVercelConfig().routes.find((r) => r.dest === '/$1.md');
	const m = rewrite.src.match(/^\^\/\((.*)\)\/\?\$$/);
	assert.ok(m, `rewrite src has the expected shape, got: ${rewrite.src.slice(0, 80)}…`);
	const inRoute = m[1].split('|').map((s) => s.replace(/\\(.)/g, '$1')).sort();
	assert.deepEqual(inRoute, twinSlugsOnDisk());
	const offenders = inRoute.filter((s) => s.startsWith('api/') || s.startsWith('private/'));
	assert.deepEqual(offenders, []);
});

test('Vercel config.json: every slug in the alternation resolves to a .md and an index.html', { skip: unlessVercel }, () => {
	const rewrite = readVercelConfig().routes.find((r) => r.dest === '/$1.md');
	const slugs = rewrite.src.match(/^\^\/\((.*)\)\/\?\$$/)[1].split('|').map((s) => s.replace(/\\(.)/g, '$1'));
	const broken = slugs.filter(
		(slug) => !existsSync(join(STATIC_DIR, `${slug}.md`)) || !existsSync(join(STATIC_DIR, ...slug.split('/'), 'index.html'))
	);
	assert.deepEqual(broken, []);
});
```

- [ ] **Step 3: Run against the Node build to see them skip, then against a Vercel build to see them pass**

```bash
cd packages/template && rm -rf dist .vercel && npm run build >/dev/null 2>&1 && node --test tests/markdown-twins.test.mjs 2>&1 | grep -E "^# (pass|fail|skipped)"
```

Expected: `# pass 9`, `# fail 0`, `# skipped 3` — the suite's 9 existing tests pass, the 3 new ones skip on a Node-adapter build.

```bash
cd packages/template && rm -rf dist .vercel && VERCEL=1 npm run build >/dev/null 2>&1 && node --test tests/markdown-twins.test.mjs 2>&1 | grep -E "^# (pass|fail|skipped)"
```

Expected: `# pass 12`, `# fail 0`, `# skipped 0` — all 9 existing plus the 3 new ones.

- [ ] **Step 4: Commit**

```bash
cd packages/template && git add tests/markdown-twins.test.mjs && git commit -m "test: check the Vercel routing config against the twins on disk

On a VERCEL=1 build the twins suite now also reads config.json and asserts the
negotiation routes sit before the filesystem handle and name exactly the twins
that exist. Skipped on Node-adapter builds, with the command to run instead.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Layer 3 — the deployed smoke test, proven to detect the bug

The test that was missing for three months. Written before the spike deployment exists, and run first against *production* — where negotiation is currently broken — so that we see it fail on the real bug before we trust it to pass on the fix. Skipped when `DOCS_SMOKE_URL` is unset, so `npm test` stays hermetic.

**Files:**
- Create: `packages/template/tests/deployed-smoke.test.mjs`

**Interfaces:**
- Consumes: nothing from the codebase — it is a black-box HTTP client. Reads `DOCS_SMOKE_URL` from the environment.
- Produces: the go/no-go signal for Task 7 (the *Vary gate* test).

- [ ] **Step 1: Write the test**

Create `packages/template/tests/deployed-smoke.test.mjs`:

```js
/**
 * Smoke test against a deployed site. The only layer that can see Vercel's
 * router and CDN, which is where markdown negotiation lives and where it once
 * broke for three months without a test noticing.
 *
 * Opt-in: set `DOCS_SMOKE_URL` to a preview or production URL. Skipped, not
 * failed, when unset, so `npm test` stays hermetic.
 *
 *   DOCS_SMOKE_URL=https://<deployment>.vercel.app node --test tests/deployed-smoke.test.mjs
 *
 * `PAGES` names URLs that exist on this site; if you rename or remove one,
 * update it here. The two `vary*` pages must not be fetched by any other test
 * in this file, so the Vary gate sees the CDN in a known order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.DOCS_SMOKE_URL?.replace(/\/+$/, '');
const skip = BASE ? false : 'DOCS_SMOKE_URL not set';

const PAGES = {
	page: '/reference/errors/',
	varyA: '/concepts/glossary/',
	varyB: '/get-started/quickstart/',
	noTwin: '/api/', // Scalar — HTML, no .md; must fall back to HTML, never 404
	private: '/private/', // on-demand, guarded — must never answer with markdown
};

const MARKDOWN = 'text/markdown';
const AGENT = 'text/markdown, text/plain;q=0.9, */*;q=0.8';
const CHROME =
	'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
const CURL = '*/*';

async function get(path, accept) {
	const res = await fetch(BASE + path, { headers: { accept }, redirect: 'manual' });
	return {
		status: res.status,
		type: res.headers.get('content-type') ?? '',
		vary: res.headers.get('vary') ?? '',
		cache: res.headers.get('x-vercel-cache') ?? '-',
		location: res.headers.get('location') ?? '',
		body: await res.text(),
	};
}
const isMarkdown = (r) => r.type.startsWith('text/markdown');
const isHtml = (r) => r.type.startsWith('text/html');
const describe = (r) => `${r.status} ${r.type} (x-vercel-cache: ${r.cache})`;

test('1. root with Accept: text/markdown → the markdown twin', { skip }, async () => {
	const r = await get('/', MARKDOWN);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isMarkdown(r), describe(r));
	assert.ok(r.body.startsWith('# '), `body starts: ${r.body.slice(0, 40)}`);
});

test('2. a page with Accept: text/markdown → its twin', { skip }, async () => {
	const r = await get(PAGES.page, MARKDOWN);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isMarkdown(r), describe(r));
	assert.ok(r.body.startsWith('# '), `body starts: ${r.body.slice(0, 40)}`);
});

test('3. the realistic agent Accept header → markdown', { skip }, async () => {
	const r = await get(PAGES.page, AGENT);
	assert.ok(isMarkdown(r), describe(r));
});

test('4. Chrome’s Accept → HTML, unchanged', { skip }, async () => {
	const r = await get(PAGES.page, CHROME);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isHtml(r), describe(r));
});

test('5. curl’s */* → HTML, unchanged', { skip }, async () => {
	const r = await get(PAGES.page, CURL);
	assert.ok(isHtml(r), describe(r));
});

test('6. a page with no twin + Accept: text/markdown → HTML, not 404', { skip }, async () => {
	const r = await get(PAGES.noTwin, MARKDOWN);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isHtml(r), describe(r));
});

test('7. negotiable responses carry Vary: Accept', { skip }, async () => {
	for (const [path, accept] of [['/', MARKDOWN], [PAGES.page, MARKDOWN], [PAGES.page, CHROME], [PAGES.page, CURL]]) {
		const r = await get(path, accept);
		assert.match(r.vary, /\bAccept\b/i, `${path} with ${accept.slice(0, 20)}…: Vary was "${r.vary}"`);
	}
});

test('8. THE VARY GATE: same URL, both orders, bodies never cross — including cache HITs', { skip }, async (t) => {
	// A cached HTML body served to a Markdown request, or the reverse, is the
	// failure mode of the rewrite design. Two pages no other test touches, in
	// opposite orders, so the CDN is warmed both ways.
	const runs = [
		[PAGES.varyA, [CHROME, MARKDOWN, CHROME, MARKDOWN]],
		[PAGES.varyB, [MARKDOWN, CHROME, MARKDOWN, CHROME]],
	];
	for (const [path, sequence] of runs) {
		for (const accept of sequence) {
			const r = await get(path, accept);
			const wantMarkdown = accept === MARKDOWN;
			t.diagnostic(`${path} ${wantMarkdown ? 'MD ' : 'HTML'} → ${describe(r)}`);
			assert.equal(r.status, 200, `${path}: ${describe(r)}`);
			assert.ok(wantMarkdown ? isMarkdown(r) : isHtml(r), `${path} asked for ${wantMarkdown ? 'markdown' : 'HTML'}, got ${describe(r)}`);
		}
	}
});

test('9. the .md twin itself still serves — the existing contract', { skip }, async () => {
	const r = await get(PAGES.page.replace(/\/$/, '') + '.md', CURL);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isMarkdown(r), describe(r));
});

test('10. /private/ with Accept: text/markdown → the guard’s answer, never markdown', { skip }, async () => {
	const r = await get(PAGES.private, MARKDOWN);
	assert.ok([302, 303, 307, 404].includes(r.status), `expected a redirect or 404, got ${describe(r)}`);
	assert.ok(!isMarkdown(r), `private content must never negotiate: ${describe(r)}`);
});
```

- [ ] **Step 2: Confirm it skips cleanly with no URL**

```bash
cd packages/template && node --test tests/deployed-smoke.test.mjs 2>&1 | grep -E "^# (pass|fail|skipped)"
```

Expected: `# pass 0`, `# fail 0`, `# skipped 10`.

- [ ] **Step 3: Run it against production, where the bug currently lives**

```bash
cd packages/template && DOCS_SMOKE_URL=https://ekline-docs-template-astro.vercel.app node --test tests/deployed-smoke.test.mjs 2>&1 | grep -E "^(not ok|ok|# (pass|fail))"
```

Expected — **read this carefully, it is the point of the task**:

```
not ok 1 - 1. root with Accept: text/markdown → the markdown twin
not ok 2 - 2. a page with Accept: text/markdown → its twin
not ok 3 - 3. the realistic agent Accept header → markdown
ok 4 - 4. Chrome’s Accept → HTML, unchanged
ok 5 - 5. curl’s */* → HTML, unchanged
ok 6 - 6. a page with no twin + Accept: text/markdown → HTML, not 404
not ok 7 - 7. negotiable responses carry Vary: Accept
not ok 8 - 8. THE VARY GATE: …
ok 9 - 9. the .md twin itself still serves — the existing contract
ok 10 - 10. /private/ with Accept: text/markdown → the guard’s answer, never markdown
# pass 5
# fail 5
```

Five failures, all on the negotiated requests, none on the unchanged behaviour. That is the test detecting the real bug against the real site. If any of 4, 5, 6, 9, 10 fails, something other than negotiation is wrong on production — stop and report.

- [ ] **Step 4: Commit**

```bash
cd packages/template && git add tests/deployed-smoke.test.mjs && git commit -m "test: a deployed smoke test for markdown negotiation, opt-in via DOCS_SMOKE_URL

The layer that was missing: nothing in the repo ever sent Accept: text/markdown
to a deployment, which is why the 2.0.0 adapter change could break it with CI
green. Run against production today it fails on exactly the five negotiated
cases and passes the five unchanged ones. Test 8 is the gate for the rewrite
design: same URL, both Accept values, both orders, bodies must never cross.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The spike deployment, and the Vary decision

Push the branch so Vercel builds a preview of the template site with the integration in it, then run the smoke test against it. This is where the spec's unknowns get answered, and the one place the design can still change (rewrite → redirect).

**Files:**
- None, unless the gate fails — then: `packages/template/src/lib/vercel-markdown-negotiation.mjs`, `packages/template/tests/markdown-negotiation.test.mjs`, `packages/template/tests/deployed-smoke.test.mjs`, `packages/template/tests/markdown-twins.test.mjs` (the fallback is spelled out in Step 5).

**Interfaces:**
- Consumes: the smoke test (Task 6).
- Produces: a measured yes/no on the rewrite design, recorded in the wiki in Task 9.

- [ ] **Step 1: Ask before pushing**

Pushing creates a public preview URL and a PR-shaped branch on GitHub. Confirm with your human partner: *"Ready to push `pa-claude/content-negotiation-markdown-685f88` so Vercel builds a preview for the spike. OK?"* Do not continue until they say yes.

- [ ] **Step 2: Push**

```bash
git push -u origin pa-claude/content-negotiation-markdown-685f88
```

- [ ] **Step 3: Wait for the preview and get its URL**

Vercel's GitHub integration posts a deployment. Poll for it (replace nothing — the branch name is fixed):

```bash
gh api "repos/ekline-io/ekline-docs-template-astro/deployments?ref=pa-claude/content-negotiation-markdown-685f88&per_page=5" --jq '.[] | "\(.id) \(.environment) \(.created_at)"'
```

Then, for the deployment whose environment names the template project (not `documentation`):

```bash
gh api "repos/ekline-io/ekline-docs-template-astro/deployments/<id>/statuses" --jq '.[0] | "\(.state) \(.environment_url)"'
```

Expected: `success https://ekline-docs-template-astro-<hash>-<team>.vercel.app` (the exact host varies). If the state is `failure`, open the Vercel build log — the integration throws on purpose if it ran before the adapter (Task 4), and that message would be there. Also check the build log for the `pages answer Accept: text/markdown` line, which proves the integration ran in Vercel's build, not only locally.

- [ ] **Step 4: Run the smoke test against the preview**

```bash
cd packages/template && DOCS_SMOKE_URL=<environment_url> node --test tests/deployed-smoke.test.mjs 2>&1 | grep -E "^(not ok|ok|# |    # )"
```

Expected: `# pass 10`, `# fail 0`, and the `# ` diagnostic lines from test 8 showing a mix of `MISS` and `HIT` with every body matching its `Accept`. **Run it twice** — the second run hits a warm CDN, which is the state the gate exists to check.

Record, for the wiki (Task 9): pass/fail per test, and the `x-vercel-cache` values from test 8's diagnostics on the second run.

- [ ] **Step 5: If, and only if, test 8 fails — switch to the redirect fallback**

Test 8 failing means the CDN served a body that did not match the request's `Accept`. The rewrite design is out; the spec's fallback is a 307 to the twin, which caches per URL and cannot cross. It is a small, mechanical change:

In `src/lib/vercel-markdown-negotiation.mjs`, in `negotiationRoutes`, replace the two rewrite routes:

```js
	if (slugSrc) routes.push({ src: slugSrc, has: WANTS_MARKDOWN, status: 307, headers: { Location: '/$1.md', ...VARY_ACCEPT } });
	if (root) routes.push({ src: '^/$', has: WANTS_MARKDOWN, status: 307, headers: { Location: '/index.md', ...VARY_ACCEPT } });
```

and change `isNegotiationRoute` to:

```js
const isNegotiationRoute = (r) => r.status === 307 && /^\/(\$1|index)\.md$/.test(r.headers?.Location ?? '');
```

In `tests/markdown-negotiation.test.mjs` and `tests/markdown-twins.test.mjs`, change the `isRewrite` helpers the same way and the assertions on `routes[2].dest` / `routes[3].dest` to `routes[2].headers.Location === '/$1.md'` / `routes[3].headers.Location === '/index.md'`. In `tests/deployed-smoke.test.mjs`, tests 1–3 become: `assert.equal(r.status, 307)` and `assert.equal(r.location, '<path without trailing slash>.md')`; test 8 asserts the Markdown requests answer 307 and the HTML requests 200, in both orders. Re-run Tasks 2–6's test commands, commit as `fix: negotiate with a 307 to the twin — Vercel's CDN does not vary on Accept`, push, and repeat Steps 3–4 of this task.

Also update the spec's *Rewrite, not redirect* paragraph and the wiki (Task 9) to say the redirect is what shipped, and why.

- [ ] **Step 6: Nothing to commit if the gate passed**

The branch is unchanged; the result is a measurement. Carry it to Task 9.

---

### Task 8: `apps/docs` — the same integration, imported across the monorepo

`apps/docs` has no adapter today. The integration edits the adapter's output, so the docs site gains `@astrojs/vercel` — every page still prerendered, the deployed output still entirely static — and imports the integration from `packages/template` the way it already reads the template's wiki. One copy of the code. This is also the removal path that Task 9's docs describe, built and deployed: a static site that keeps the Vercel adapter for Vercel's features.

It has twin-less pages of its own: the whole `/internals/**` section renders from the wiki collection and has no `.md`. Under the first draft's `vercel.json` rewrites a Markdown request for any of them would have 404'd on the live docs site; here they are a smoke-test row.

**Files:**
- Modify: `apps/docs/astro.config.mjs` (two imports at top; `adapter:` after `site:`; one entry at the end of `integrations`)
- Modify: `apps/docs/package.json`, `apps/docs/package-lock.json` (via `npm install`)
- Modify: `apps/docs/tests/markdown-twins.test.mjs:24-28` (header comment), plus the Layer 2 tests appended
- Create: `apps/docs/tests/deployed-smoke.test.mjs`

**Interfaces:**
- Consumes: `vercelMarkdownNegotiation()` (Task 4), imported relatively; the route markers (Task 2) in the Layer 2 tests.

- [ ] **Step 1: Add the adapter, at the template's version range**

```bash
cd apps/docs && npm install "@astrojs/vercel@$(node -p "require('../../packages/template/package.json').dependencies['@astrojs/vercel']")" && node -p "require('./package.json').dependencies['@astrojs/vercel']"
```

Expected: the same range as the template's (`^10.0.8` at the time of writing). The two projects are independent, so this is a second copy in a second lockfile, on purpose — see the root `CLAUDE.md` on why there are no workspaces.

- [ ] **Step 2: Wire it into `astro.config.mjs`**

Add two imports after the existing `import tailwindcss from '@tailwindcss/vite';` line:

```js
import vercel from '@astrojs/vercel';
// One copy of the integration, in the template — imported across the repo the
// way `src/loaders/wiki.mjs` reads the template's wiki. This site is not
// shipped to anyone, so the cross-directory import that would be wrong inside
// `packages/template` is the right shape here.
import vercelMarkdownNegotiation from '../../packages/template/src/lib/vercel-markdown-negotiation.mjs';
```

Add this after the `site: '…',` line and before `integrations: [`:

```js
	// Vercel builds set VERCEL=1. Nothing here renders on demand, so the adapter
	// changes only where the static output lands (`.vercel/output/static/`) and
	// the routing config that serves it — which is what markdown negotiation
	// edits. Everywhere else this is a plain static build into `dist/`. It is
	// the shape the template's removal path documents; this site is that path,
	// built.
	adapter: process.env.VERCEL ? vercel() : undefined,
```

Add this as the last entry of the `integrations` array, after the `starlight({ … }),` block:

```js
		// On Vercel, a request to a page with `Accept: text/markdown` gets the
		// page's Markdown twin at the same URL. Does nothing off Vercel.
		vercelMarkdownNegotiation(),
```

- [ ] **Step 3: Build both ways; the integration must run only on the Vercel build**

```bash
cd apps/docs && rm -rf dist .vercel && npm run build 2>&1 | grep -ci "negotiation"; ls .vercel 2>&1 | head -1
```

Expected: `0` and `ls: .vercel: No such file or directory` — the plain static build is untouched.

```bash
cd apps/docs && rm -rf dist .vercel && VERCEL=1 npm run build 2>&1 | grep -i "negotiation" && ls .vercel/output/config.json .vercel/output/static/index.html .vercel/output/static/search-and-ai.md && echo "--- internals twins (must be 0):" && find .vercel/output/static/internals -name '*.md' 2>/dev/null | wc -l
```

Expected: one `pages answer Accept: text/markdown` line; the three files listed; `0`.

- [ ] **Step 4: Update the twins test's header comment and add the Layer 2 tests**

In `apps/docs/tests/markdown-twins.test.mjs`, replace the paragraph beginning `* Content negotiation (\`Accept: text/markdown\` -> \`.md\`) is gone` with:

```js
 * Content negotiation (`Accept: text/markdown` -> `.md`) is provided on Vercel
 * by the template's `src/lib/vercel-markdown-negotiation.mjs`, which this
 * site imports, and which writes routes into the adapter's
 * `.vercel/output/config.json`. When this suite runs against that output
 * (`VERCEL=1 npm run build`), the last tests below check the routing config
 * against the files on disk — in particular that no `/internals/**` route,
 * which has no twin, is in it. On a plain build they are skipped.
```

Then append the three Layer 2 tests from Task 5 Step 2 **verbatim**, with one change — in the second test, the offenders filter becomes:

```js
	const offenders = inRoute.filter((s) => s.startsWith('internals/'));
```

This site has no `api/` or `private/`; `internals/` is its twin-less prefix.

- [ ] **Step 5: Copy the smoke test, adjusted for this site**

Create `apps/docs/tests/deployed-smoke.test.mjs` as a copy of `packages/template/tests/deployed-smoke.test.mjs` with these changes:

- `PAGES` becomes:
  ```js
  const PAGES = {
  	page: '/search-and-ai/',
  	varyA: '/branding/',
  	varyB: '/site-basics/',
  	noTwin: '/internals/private-docs/', // wiki collection — HTML, no .md; must fall back to HTML, never 404
  };
  ```
- Delete test 10 (`/private/`): this site has no guard. **Keep test 6** — `/internals/**` is exactly the twin-less case, and it is the row the first draft would have failed.
- Renumber nothing; the header comment's example command stays the same. Nine tests remain.

- [ ] **Step 6: Run the hermetic suite, then the Layer 2 tests against a Vercel build**

```bash
cd apps/docs && rm -rf dist .vercel && npm run check && npm test 2>&1 | grep -E "^# (pass|fail|skipped)"
```

Expected: `# fail 0`. Twelve tests from this task skip — three Layer 2 tests (plain build, nothing to check) and nine smoke tests (no URL) — so `# skipped` is 12 plus whatever the suite skipped before.

```bash
cd apps/docs && rm -rf dist && VERCEL=1 npm run build >/dev/null 2>&1 && node --test tests/markdown-twins.test.mjs 2>&1 | grep -E "^# (pass|fail|skipped)"
```

Expected: `# fail 0`, `# skipped 0` — the Layer 2 tests ran against the Vercel output and passed.

- [ ] **Step 7: Commit, ask, push, and smoke the preview**

```bash
git add apps/docs/astro.config.mjs apps/docs/package.json apps/docs/package-lock.json apps/docs/tests/markdown-twins.test.mjs apps/docs/tests/deployed-smoke.test.mjs && git commit -m "feat(docs): markdown negotiation on the docs site, via the template's integration

The docs site gains the Vercel adapter with every page still prerendered —
the shape the template's removal path now documents — and imports the
negotiation integration from packages/template across the repo, the way it
already reads the wiki. One copy of the mechanism, one behaviour: a Markdown
request for an /internals/ page, which has no twin, gets HTML, where the
first draft's vercel.json rewrites would have answered 404.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Ask your human partner before pushing (a second preview). Then `git push`, find the `documentation` deployment with the `gh api` commands from Task 7 Step 3, and:

```bash
cd apps/docs && DOCS_SMOKE_URL=<environment_url> node --test tests/deployed-smoke.test.mjs 2>&1 | grep -E "^(not ok|ok|# |    # )"
```

Expected: `# pass 9`, `# fail 0`. Run twice. Record the result for Task 9. Also read this project's Vercel build log: it must show the `pages answer Accept: text/markdown` line, which proves the cross-repo import resolved in Vercel's build. The wiki import already does, so this is confirmation rather than a gamble.

---

### Task 9: Documentation — wiki, README, the hosted docs

Four places describe this feature to three audiences, and two of them currently say it cannot be done. Every claim below must match what Tasks 7–8 measured; where a step gives text, adjust it to the measurement, never the reverse.

**Files:**
- Modify: `packages/template/wiki/private-docs.md` (the section at line 274, *Resolved: `vercel.json` rewrites do not work with the adapter*)
- Modify: `packages/template/README.md` (feature bullet after line 30; the *Don't need private docs?* section around line 136)
- Modify: `apps/docs/src/content/docs/search-and-ai.md` (after the contextual-menu section ending line 79)
- Modify: `apps/docs/src/content/docs/removing-features.md` (the *get the plain static build back* steps around line 59)

- [ ] **Step 1: Rewrite the wiki section**

In `packages/template/wiki/private-docs.md`, replace the whole `## Resolved: \`vercel.json\` rewrites do not work with the adapter` section — from that heading up to (not including) `## Resolved: \`context.url.origin\` is the real host on Vercel` — with:

````markdown
## Markdown content negotiation on Vercel

A request to any docs page with `Accept: text/markdown` returns the page's
Markdown twin at the same URL. Browsers never send that header and see no
change. It is provided by `src/lib/vercel-markdown-negotiation.mjs`, an
integration registered in `astro.config.mjs`; delete that line to turn it off.

```
curl -H 'Accept: text/markdown' https://<your-site>/reference/errors/   → 200 text/markdown
curl https://<your-site>/reference/errors/                             → 200 text/html
```

### Why it is an integration and not `vercel.json`

`vercel.json` carried two `rewrites` for this until 2.1.0, and they worked —
until 2.0.0 introduced `@astrojs/vercel`. The adapter emits Build Output API
v3, and its generated `.vercel/output/config.json` supersedes `vercel.json`
routing entirely. **Measured on the production deployment (2026-08-21), and
the rewrites were inert:**

| Request | Result |
| --- | --- |
| `curl -H 'Accept: text/markdown' <url>/` | `text/html` — the rewrite did not fire |
| `curl -H 'Accept: text/markdown' <url>/guides/example/` | `text/html` — likewise |
| `curl <url>/guides/example.md` | `200 text/markdown` — the twin itself is fine |

Astro middleware cannot do it either, even in the adapter's
`middlewareMode: 'edge'`: the adapter's own docs say prerendered pages are
served from Vercel's filesystem and never invoke middleware, and every docs
page is prerendered.

What can: Build Output API `routes`. A route placed before
`{ "handle": "filesystem" }` is evaluated before static files are served, and
may match on a request header and rewrite. So the integration edits the
adapter's own output after the build.

### What it writes

Four routes, spliced in immediately before the filesystem handle:

1. `Vary: Accept` on every negotiable URL, with `continue: true` — so the
   *HTML* response carries it and the CDN keys its cache on the header. The
   adapter's own `_astro` cache-control route uses the same pattern.
2. The same for `/`.
3. The rewrite: one regex alternation of every twin slug, matched only when
   `Accept` contains `text/markdown` as a media-type token, rewriting to
   `/$1.md`. One route whatever the page count, and an exact set: a page with
   no twin — the Scalar `/api/**` pages, any custom `.astro` page — is not in
   it and falls through to HTML.
4. The same for `/` → `/index.md`.

The twin set is read from the emitted static directory (`<slug>.md` beside
`<slug>/index.html`), the same ground truth `tests/markdown-twins.test.mjs`
checks. The integration can only rewrite to a path already served statically,
so it cannot widen exposure; `tests/private-leaks.test.mjs` continues to
guarantee no private twin exists.

**What "wants Markdown" means:** `text/markdown`, `text/markdown;q=0.9`,
`text/markdown, text/plain;q=0.9, */*;q=0.8` all match; `text/markdownx` does
not. Quality values are not evaluated — Build Output routing cannot — so
`text/html, text/markdown;q=0.1` would negotiate to Markdown. No browser or
known agent sends that.

### When it runs — the one non-obvious part

Astro pushes the adapter onto the *end* of the integrations list, so a plain
integration's `astro:build:done` fires before the adapter has written
`config.json`. The exported integration therefore registers an *inner*
integration during `astro:config:setup`; integrations added that way land
after the adapter, and their `astro:build:done` runs after it. Measured on a
real build: the outer hook sees no `config.json`, the inner one does.

If that ever stops holding — an Astro release changing the order — the
integration throws rather than deploy silently without the feature, which is
the failure this feature already suffered once. The message names this section.

### Verified on a deployment (<date from Task 7>)

`tests/deployed-smoke.test.mjs` against a preview, run twice so the second
pass hits a warm CDN: <one line per result — all ten pass; the Vary gate
(test 8) served the right body on every request including `x-vercel-cache:
HIT`; or, if the fallback shipped, "Vercel's CDN did not vary on Accept, so
negotiation answers 307 to the twin instead — see the test for the sequence
that showed it">.

That test is opt-in (`DOCS_SMOKE_URL=<url>`) and is the only layer that can
see Vercel's router. Nothing in `npm test` can; that is why the 2.0.0 break
went unnoticed.

### If you removed the logged-in experience

The integration edits the adapter's output, so it needs `@astrojs/vercel`
present even when nothing renders on demand. The removal path in the README
keeps it for that reason: uninstall `@astrojs/node` and `jose`, and leave
`adapter: process.env.VERCEL ? vercel() : undefined`. On Vercel that is Build
Output with every page prerendered — still entirely static on the CDN — and
negotiation works unchanged; anywhere else it is a plain static build into
`dist/`.

An earlier version of this design gave adapter-less builds `vercel.json`
`rewrites` instead, because those worked in 1.x. Vercel's Astro guide says not
to: "You should not use `vercel.json` to rewrite URL paths with astro
projects; doing so produces inconsistent behavior, and is not officially
supported." They were also worse: `vercel.json` cannot express "only pages
with a twin", so a Markdown request for a page without one would have
answered 404 rather than HTML. One mechanism, one behaviour.

### Why not Routing Middleware

It is Vercel's named mechanism for rewrites with Astro, and it runs before the
cache. But its `matcher` is path-only — it cannot be scoped to requests whose
`Accept` mentions Markdown — so a root `middleware.ts` would invoke a function
on every page view, browsers included, to serve the few that negotiate. The
routing config does the same header check for free. It would also be a
second file called middleware beside `src/middleware.ts`, with different
semantics. If the routes in `config.json` ever stop firing ahead of the
filesystem handle, it is the fallback.

### Not on Node

The standalone server serves prerendered pages from disk under the same
constraint — middleware does not see them — so self-hosted deployments do not
negotiate. The twins, the `<link rel="alternate">` tags and the contextual
menu's deep links work everywhere; only the header form is Vercel-only. A
proxy rule in front of the server can add it.

````

Fill in the `<date from Task 7>` and the results line from what you measured. Both are facts you have; leaving the angle brackets in is a plan failure.

- [ ] **Step 2: The README**

In `packages/template/README.md`, after the `llms.txt` bullet (line 30), add:

```markdown
- **Markdown for AI agents** — every page has a `.md` twin (`/guides/example.md`), advertised with `<link rel="alternate" type="text/markdown">`, and on Vercel a request with `Accept: text/markdown` gets it at the page's own URL. See [Search and AI](https://documentation-ekline-docs-template.vercel.app/search-and-ai/).
```

In the *Don't need private docs?* section, in the paragraph beginning `**Then get the plain static build back**` (line 136), replace this sentence:

```markdown
In `astro.config.mjs`, remove the `adapter:` line, the `env:` block, the two adapter imports, the `ssoConfigured` line and its use in the `sidebar` array, the three `DOCS_SSO_*` names from the `loadEnv` destructure, and the sitemap `filter`; then uninstall `@astrojs/node`, `@astrojs/vercel` and `jose`.
```

with:

```markdown
In `astro.config.mjs`, change the `adapter:` line to `adapter: process.env.VERCEL ? vercel() : undefined`, and remove the `env:` block, the `@astrojs/node` import, the `ssoConfigured` line and its use in the `sidebar` array, the three `DOCS_SSO_*` names from the `loadEnv` destructure, and the sitemap `filter`; then uninstall `@astrojs/node` and `jose`. **Keep `@astrojs/vercel` if you deploy to Vercel** — it is how Vercel's features reach a static site, Markdown negotiation (`vercelMarkdownNegotiation()`, in the same file) among them. Deploying anywhere else, remove the adapter, its import, and that integration line as well.
```

The rest of that paragraph (`**Keep the loadEnv call itself** …`) stays as it is. `apps/docs` is this instruction carried out (Task 8), which is what keeps it honest.

- [ ] **Step 3: The hosted docs — `search-and-ai.md`**

In `apps/docs/src/content/docs/search-and-ai.md`, after the paragraph ending `nothing to add for it to work.` (line 79), add:

````markdown

## Markdown for AI agents

Two ways to get a page as Markdown, and every page supports both:

- **The `.md` twin.** `/guides/example/` has `/guides/example.md`. It is what
  the contextual menu links to and what the `<link rel="alternate">` tag
  advertises, so crawlers find it without guessing.
- **Content negotiation.** On Vercel, the page's own URL answers a request
  with `Accept: text/markdown` by serving the twin:

  ```bash
  curl -H 'Accept: text/markdown' https://your-site/guides/example/ | head
  ```

  Browsers never send that header and see no change.

Negotiation is provided by `vercelMarkdownNegotiation()` in `astro.config.mjs`
— an integration that adds routes to the Vercel adapter's generated routing
config after the build. Two things follow from that:

- **It needs `@astrojs/vercel`.** The template ships with it. If you follow
  [Removing what you don't need](/removing-features/), keep the adapter when
  you deploy to Vercel — that is how Vercel's features reach a static site.
  This site is built that way.
- **Delete the line to turn it off.** Off Vercel it does nothing.

Pages with no `.md` twin — this site's Internals pages, the template's API
reference — are simply not in the route table, and answer a Markdown request
with their HTML, as before.

One limit, documented rather than fixed: quality values are not evaluated.
`text/html, text/markdown;q=0.1` gets Markdown. No browser or known agent
sends that.

**To check a deployment,** the template ships an opt-in smoke test:
`DOCS_SMOKE_URL=https://your-site node --test tests/deployed-smoke.test.mjs`.
It is the only test that can see Vercel's router; `npm test` cannot, which is
how this feature once broke without a test noticing. Details in the
[Internals](/internals/private-docs/#markdown-content-negotiation-on-vercel).
````

Check the Internals link resolves: `grep -n "^## Markdown content negotiation" packages/template/wiki/private-docs.md` and confirm the `apps/docs` wiki collection renders that file at `/internals/private-docs/` (`grep -rn "internals" apps/docs/astro.config.mjs apps/docs/src/content.config.ts`). If the path differs, use the real one.

- [ ] **Step 4: The hosted docs — `removing-features.md`**

In `apps/docs/src/content/docs/removing-features.md`, under *Then get the plain static build back*, change step 1's opening from:

```markdown
1. In `astro.config.mjs`, remove the `adapter:` line, the `env:` block, the
   two adapter imports, the `ssoConfigured` line and its use in the
```

to:

```markdown
1. In `astro.config.mjs`, change the `adapter:` line to
   `adapter: process.env.VERCEL ? vercel() : undefined`, and remove the
   `env:` block, the `@astrojs/node` import, the `ssoConfigured` line and its use in the
```

and replace step 2 in full with:

```markdown
2. Uninstall the Node adapter and the token library — and keep
   `@astrojs/vercel` if you deploy to Vercel. It is how Vercel's features,
   [Markdown negotiation](/search-and-ai/#markdown-for-ai-agents) among them,
   reach a static site; this site is built that way. Deploying anywhere else,
   uninstall it too and drop the `vercelMarkdownNegotiation()` line from
   `astro.config.mjs`.

   ```bash
   npm uninstall @astrojs/node jose
   ```
```

The paragraph after the list (`Skipping that second half leaves dist/server/ …`) stays: it is about the Node adapter, which is still the one being removed.

- [ ] **Step 5: Check what ships**

From the repo root:

```bash
npm run check:shipped
```

Expected: passes. It walks `packages/template/` for links into `apps/` or `.github/` — none of the text above contains one, but confirm rather than assume.

- [ ] **Step 6: Build the docs site and open the two pages**

```bash
cd apps/docs && npm run build 2>&1 | tail -3 && grep -l "Markdown for AI agents" dist/search-and-ai/index.html dist/internals/private-docs/index.html
```

Expected: both files listed. (Adjust the second path if Step 3 found the Internals route differs.)

- [ ] **Step 7: Commit**

```bash
git add packages/template/wiki/private-docs.md packages/template/README.md apps/docs/src/content/docs/search-and-ai.md apps/docs/src/content/docs/removing-features.md && git commit -m "docs: markdown content negotiation — how it works, on both build shapes

The wiki section that said the rewrites could not be brought back is replaced
with how they were: the adapter's config.json, the four routes, the ordering
trick, and what a deployment measured. The README, the Search and AI page and
the removal instructions say which mechanism applies to which build.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: CHANGELOG and version

A feature, no output move: a minor release, 2.3.0 → 2.4.0. The CHANGELOG is written for someone deciding whether to pull the change into a customised site.

**Files:**
- Modify: `packages/template/CHANGELOG.md` (insert after line 9, before `## 2.3.0`)
- Modify: `packages/template/package.json`, `packages/template/package-lock.json` (via `npm version`)

- [ ] **Step 1: Write the entry**

Insert before `## 2.3.0` in `packages/template/CHANGELOG.md`:

```markdown
## 2.4.0

### Markdown content negotiation is back, on Vercel

A request to any page with `Accept: text/markdown` gets the page's Markdown
twin at the same URL — the convention AI agents use to ask for Markdown without
knowing the URL shape. It shipped in 1.x as two `vercel.json` rewrites, stopped
working when 2.0.0 introduced the Vercel adapter, and was removed in 2.1.0 once
that was measured. Now it works again, by a different route.

**What to pull across:** `src/lib/vercel-markdown-negotiation.mjs` and its one
line in `astro.config.mjs`. It edits the adapter's generated routing config
after the build; `vercel.json` cannot reach that file and middleware never sees
prerendered pages. Off Vercel it does nothing. Delete the line to turn it off.

**If you removed the logged-in experience,** keep `@astrojs/vercel` when you
deploy to Vercel: the integration edits its output and has nothing to edit
without it. The removal instructions in the README now say so — the adapter
line becomes `adapter: process.env.VERCEL ? vercel() : undefined`, and only
`@astrojs/node` and `jose` are uninstalled. Every page stays prerendered and
the output is still entirely static. The hosted docs site is built exactly
that way.

**Also fixed on the way:** the 1.x rewrites only matched a bare
`Accept: text/markdown`. A realistic agent header —
`text/markdown, text/plain;q=0.9, */*;q=0.8` — fell through to HTML even when
they were live. Both mechanisms now match the media type wherever it sits.

**New tests:** `tests/markdown-negotiation.test.mjs` (unit, in `npm test`) and
`tests/deployed-smoke.test.mjs` (against a real URL, opt-in via
`DOCS_SMOKE_URL`). The second is the one that was missing: nothing in the repo
ever sent the header to a deployment, which is how 2.0.0 could break this with
CI green.

**Not on Node.** Self-hosted deployments get the twins, the alternate links and
the contextual menu, but not the header form. See
*Markdown content negotiation on Vercel* in `wiki/private-docs.md`.

```

If Task 7 shipped the 307 fallback, change the first paragraph's "at the same URL" to "by a redirect to its `.md` twin — Vercel's CDN does not vary its cache on `Accept`, so a same-URL rewrite could not be made safe" and keep the rest.

- [ ] **Step 2: Bump the version**

```bash
cd packages/template && npm version minor --no-git-tag-version && node -e "console.log(require('./package.json').version)"
```

Expected: `2.4.0`, and `package-lock.json` updated to match (`git diff --stat` shows both).

- [ ] **Step 3: Commit**

```bash
cd packages/template && git add CHANGELOG.md package.json package-lock.json && git commit -m "chore: release 2.4.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: CI — the Vercel-adapter build on every PR, and the smoke test on every deployment

Layer 2 currently runs only inside Vercel's own build. Adding a `VERCEL=1` build to the PR job makes it a PR gate. The `deployment_status` job runs Layer 3 against every preview Vercel creates — the automation that would have caught the 2.0.0 break the day it happened.

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the Vercel-adapter build to the template job**

In `.github/workflows/ci.yml`, after the `- name: Build and test` step (`run: npm test`) in the `test` job, add:

```yaml
      # A second build, with the Vercel adapter. The markdown-negotiation routes
      # exist only in `.vercel/output/config.json`, which the Node-adapter build
      # above never produces, so without this step they are checked only by
      # Vercel's own build — after merge, at deploy time. `staticDir()` prefers
      # a `dist/client/` over `.vercel/output/static/`, so the Node output goes
      # first. The browser tests below rebuild with the Node adapter anyway.
      - name: Build with the Vercel adapter and check its routing config
        run: |
          rm -rf dist
          VERCEL=1 npm run build
          node --test tests/markdown-twins.test.mjs tests/markdown-negotiation.test.mjs
```

And in the `docs` job, after its own `npm test` step, add the same for the docs site. It has no negotiation unit test of its own — the integration and its tests live in the template — so only the twins suite runs here:

```yaml
      # Same reason as the template job's step of the same name: the routing
      # config the negotiation integration writes exists only in a
      # Vercel-adapter build, and `npm test` above built without one.
      - name: Build with the Vercel adapter and check its routing config
        run: |
          rm -rf dist
          VERCEL=1 npm run build
          node --test tests/markdown-twins.test.mjs
```

- [ ] **Step 2: Add the `deployment_status` trigger and the smoke job**

Change the `on:` block to:

```yaml
on:
  pull_request:
  push:
    branches: [main]
  # Vercel reports each preview and production deployment through GitHub's
  # deployments API. The `smoke` job below runs the deployed smoke test against
  # the URL it reports — the only place markdown negotiation can be observed.
  deployment_status:
```

Change the `concurrency` group so a deployment event does not cancel a PR run:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}
  cancel-in-progress: true
```

Add `if: github.event_name != 'deployment_status'` to both existing jobs, directly under their `name:` lines:

```yaml
  test:
    name: Check, build and test
    if: github.event_name != 'deployment_status'
```

```yaml
  docs:
    name: Docs site
    if: github.event_name != 'deployment_status'
```

Then append this job at the end of the file:

```yaml
  smoke:
    name: Deployed smoke test
    if: github.event_name == 'deployment_status' && github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.deployment.sha }}

      - uses: actions/setup-node@v7
        with:
          node-version: 22.x

      # Two Vercel projects deploy from this repo, and each reports its own
      # environment name. This line shows it in the log; the two `if`s below key
      # on it. If the naming ever changes, this is where to look first.
      - name: Which deployment
        run: echo "environment='${{ github.event.deployment.environment }}' url='${{ github.event.deployment_status.environment_url }}'"

      # No `npm ci`: the smoke test is plain Node — `fetch` and `node:test`.
      - name: Smoke test — template site
        if: ${{ !contains(github.event.deployment.environment, 'documentation') }}
        working-directory: packages/template
        env:
          DOCS_SMOKE_URL: ${{ github.event.deployment_status.environment_url }}
        run: node --test tests/deployed-smoke.test.mjs

      - name: Smoke test — docs site
        if: ${{ contains(github.event.deployment.environment, 'documentation') }}
        working-directory: apps/docs
        env:
          DOCS_SMOKE_URL: ${{ github.event.deployment_status.environment_url }}
        run: node --test tests/deployed-smoke.test.mjs
```

- [ ] **Step 3: Validate the YAML parses**

```bash
npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "yaml ok"
```

Expected: `yaml ok`. `js-yaml` parses the file and exits non-zero on any error, so a parse failure prints its message instead — fix the indentation before committing.

- [ ] **Step 4: Commit, and confirm the ask before pushing**

```bash
git add .github/workflows/ci.yml && git commit -m "ci: build with the Vercel adapter on every PR, and smoke-test every deployment

The negotiation routes exist only in the adapter's config.json, which the PR
job never produced; now it does. And a deployment_status job runs the deployed
smoke test against each preview Vercel reports — the check that would have
caught the 2.0.0 break the day it happened.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Ask your human partner, then `git push`. Watch the run:

```bash
gh run list --branch pa-claude/content-negotiation-markdown-685f88 --limit 5
```

Expected: the `pull_request` run passes both existing jobs including the new Vercel-adapter step; and, once Vercel reports the new deployments, a `deployment_status` run appears whose `Which deployment` step shows the environment names. **Read those names** and confirm the `contains(..., 'documentation')` split routed each deployment to the right smoke test — one run should execute the template step, the other the docs step. If the names do not contain `documentation`, change the `contains` string to whatever distinguishes them, commit as `ci: key the smoke job on Vercel's actual environment names`, and push again.

---

### Task 12: Final verification and the PR

**Files:** none new.

- [ ] **Step 1: Clean, full verification in the template**

```bash
cd packages/template && rm -rf dist .vercel && npm run check && npm test && rm -rf dist && VERCEL=1 npm run build && node --test tests/markdown-twins.test.mjs tests/markdown-negotiation.test.mjs
```

Expected: `astro check` clean; every `npm test` file passes; the Vercel-adapter build logs the `pages answer Accept: text/markdown` line; the twins suite reports 11 pass, 0 skipped.

- [ ] **Step 2: Clean, full verification in the docs site, and the shipped check**

```bash
cd apps/docs && rm -rf dist && npm run check && npm test && cd ../.. && npm run check:shipped
```

Expected: all pass.

- [ ] **Step 3: Smoke both production-shaped previews one last time**

Using the latest preview URLs from the CI run's `Which deployment` step (or the `gh api` commands from Task 7 Step 3):

```bash
cd packages/template && DOCS_SMOKE_URL=<template preview> node --test tests/deployed-smoke.test.mjs 2>&1 | grep -E "^# (pass|fail)"
cd ../../apps/docs && DOCS_SMOKE_URL=<docs preview> node --test tests/deployed-smoke.test.mjs 2>&1 | grep -E "^# (pass|fail)"
```

Expected: `# fail 0` on both.

- [ ] **Step 4: Confirm the branch is tidy**

```bash
git status --short && git log --oneline main..HEAD
```

Expected: a clean tree, and a commit list in Task order — fixture, matcher, routes, discovery, integration, Layer 2, Layer 3, (307 fallback, if taken), docs site, docs, release, CI.

- [ ] **Step 5: Open the PR**

Ask your human partner, then:

```bash
gh pr create --base main --title "feat: markdown content negotiation on Vercel (2.4.0)" --body "$(cat <<'EOF'
## What

A request to any docs page with `Accept: text/markdown` returns the page's Markdown twin at the same URL, on Vercel, out of the box — on the template as shipped, on the template with the logged-in experience removed, and on the docs site. One mechanism for all three: the Vercel adapter is its prerequisite, and the removal path keeps it.

## Why it was broken, and why this way

The 1.x `vercel.json` rewrites went inert when 2.0.0 introduced `@astrojs/vercel`: the adapter's generated `.vercel/output/config.json` supersedes `vercel.json` routing. Astro middleware cannot help either — the adapter's docs say prerendered pages never invoke it, even at the edge. What can is Build Output API `routes` placed before the filesystem handle, so the fix is an integration that edits the adapter's own output after the build. Details: `packages/template/wiki/private-docs.md` § *Markdown content negotiation on Vercel*.

Two alternatives were evaluated and set aside, with reasons in the wiki: `vercel.json` rewrites for adapter-less builds (Vercel's Astro guide says not to, and they 404 on twin-less pages), and Routing Middleware (its matcher is path-only, so it would run a function on every page view to serve the few that negotiate).

Spec: `docs/superpowers/specs/2026-09-04-vercel-markdown-negotiation-design.md`. Plan: `docs/superpowers/plans/2026-09-05-vercel-markdown-negotiation.md`.

## Measured

- Task 0: an integration added during `astro:config:setup` runs `astro:build:done` after the adapter (outer hook: no `config.json`; inner hook: present).
- Task 6: the new deployed smoke test, run against production before the fix, fails on exactly the five negotiated cases and passes the five unchanged ones.
- Task 7: against a preview with the fix, all ten pass on a cold and a warm CDN. The Vary gate (same URL, both `Accept` values, both orders, including `x-vercel-cache: HIT`) served the right body every time. <!-- or: the 307 fallback shipped, because … -->
- Task 8: the docs site, importing the same integration across the monorepo — nine of nine on its preview, including HTML (not 404) for an `/internals/**` page with a Markdown request.

## Tests

- `tests/markdown-negotiation.test.mjs` — the pure transform, against a captured real `config.json`. In `npm test`.
- `tests/markdown-twins.test.mjs` — on a `VERCEL=1` build, the routing config against the twins on disk. Now also run on every PR by CI.
- `tests/deployed-smoke.test.mjs` — against a real URL, opt-in via `DOCS_SMOKE_URL`; run by CI on every Vercel deployment via `deployment_status`. The layer whose absence let the 2.0.0 break go unnoticed for three months.

## Not in scope

Node / self-hosted negotiation (same constraint, different mechanism — noted in the wiki). Moving the transform into `@ekline/starlight-contextual-menu`, where it eventually belongs; it is written as a pure function so it can.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Fill in the Task 7 bullet from what was measured — the HTML comment is a reminder, not a placeholder to leave in.

---

## Self-review against the spec

**Spec coverage.** *One mechanism, and the adapter is its prerequisite* → Tasks 4 and 8, and the removal-path docs in Task 9. *The integration*, including the ordering trick and the never-silent guard → Tasks 0 and 4. *Exactly which URLs negotiate* → Task 3. *Four routes* → Task 2. *What "wants Markdown" means* → Task 1. *Rewrite, and the price of it*, with the pre-decided 307 fallback → Task 7. *If you removed the logged-in experience* → Tasks 8 and 9. *Testing plan* Layers 1, 2, 3 → Tasks 1–4, 5, 6 (with the production-first proof in Task 6 Step 3); Layer 3 automation → Task 11. *Files* → every file the spec lists has a task that touches it. *Sequence* → Task 0 (local), Task 7 (spike), Tasks 8–11 (build the rest), Task 11 (automation). *Non-goals* → named in the wiki and CHANGELOG text, not built.

**Type consistency.** `negotiationRoutes({ root, slugs })` and `discoverTwins()` return `{ root: boolean, slugs: string[] }` throughout; `withMarkdownNegotiation(config, twins)` takes that shape; `applyToBuildOutput({ projectRoot })` returns `{ configPath, root, slugs } | null`; the route markers (`dest === '/$1.md'`, `dest === '/index.md'`, `continue && headers.Vary === 'Accept'`) are the same in Tasks 2, 4, 5 and in the Task 7 fallback's rewrite of them.

**Placeholders.** The angle-bracket values in Task 7 Step 3 (`<id>`, `<environment_url>`) and Task 9 Step 1 (`<date from Task 7>`, the results line) are values the executor measures in an earlier step of the same plan, and each is called out as such; none can be written in advance.
