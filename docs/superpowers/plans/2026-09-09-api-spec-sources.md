# API Spec Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a template customer point an API reference at a document bundled in `public/`, elsewhere on disk, or at a remote URL by editing one config field — with the generated sidebar and search working identically in every case.

**Architecture:** `spec` becomes the single source of truth and accepts a path or URL; `specUrlFor()` in the config derives the browser URL from it. `loadSource()` in the sidebar lib reads or fetches the raw document once per build and is shared by the sidebar generator, the search index, and a new prerendered endpoint `src/pages/api-spec/[file].js` that emits documents the template has to serve itself (a path outside `public/`, or a remote URL in `snapshot` mode). Serving failures fail the build; everything else keeps today's warn-and-degrade contract.

**Tech Stack:** Astro 6 static endpoints (`getStaticPaths` + `GET`), Node 22 `fetch` / `AbortSignal.timeout`, `node:test`, `@scalar/openapi-parser`, `@scalar/workspace-store`.

**Spec:** `docs/superpowers/specs/2026-09-09-api-spec-sources-design.md`

## Global Constraints

- All template work happens in `packages/template/`; run every `npm` command there unless a step says "repo root". Node 22.x.
- `packages/template/` ships verbatim to customers. Prose you write under it (JSDoc, `wiki/`, `CHANGELOG.md`) is in the **customer's second person** and **never names a monorepo path** (`apps/`, `.github/`). `npm run check:shipped` at the repo root enforces the path rule.
- Match existing style: tabs, single quotes, JSDoc block comments that explain *why*. `.mjs` for config and lib, `.js` for the endpoint (so `node --test` can import it without a TypeScript loader).
- A URL is anything matching `/^https?:\/\//i`. `serve` accepts `'snapshot'`, `'live'`, or `undefined` (= `'snapshot'`). Emitted files live at `/api-spec/<id>.<ext>`, `<ext>` ∈ {`yaml`, `json`}, default `yaml`. Fetch timeout default `30_000` ms.
- Failure rule: **the build fails when the template is responsible for serving a document it cannot obtain** (rule-4 references). Every other failure warns and degrades.
- Both shipped references stay in `public/` and gain no `serve` field. `specUrl` is removed from them but stays honoured as an override when a customer sets it.
- Commit messages: conventional prefix (`feat:`, `test:`, `docs:`, `chore:`). Recent history appends a ticket like `(EK-2405)`; append one if you have it. End every commit with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Verified 2026-09-09 on this repo: a `src/pages/api-spec/[file].js` endpoint with `params.file = 'probe.yaml'` emits `dist/client/api-spec/probe.yaml` exactly; an empty `getStaticPaths()` emits nothing and prints **no** warning. Trust these; do not re-probe.

---

### Task 1: Read or fetch the document — `loadSource` in the sidebar lib

**Files:**
- Modify: `packages/template/src/lib/openapi-sidebar.mjs:42` (imports), `:81-86` (`warn`), `:125-146` (`documentCache` / `loadDocument`)
- Test: `packages/template/tests/openapi-sidebar.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export function isRemoteSpec(spec: string): boolean`
  - `export function loadSource(spec: string, options?: { timeoutMs?: number }): Promise<string>` — raw document text, memoised per `spec`; rejects with `Error` whose message includes `timed out after <n>ms` on timeout, `HTTP <status>` on non-2xx, the OS error code (e.g. `ECONNREFUSED`) on connection failure.
  - `openApiOperations` and `openApiSidebarGroup` signatures unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `packages/template/tests/openapi-sidebar.test.mjs`, after the existing imports add:

```js
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mock } from 'node:test';
import { loadSource } from '../src/lib/openapi-sidebar.mjs';
```

(Keep the existing `import { openApiSidebarGroup } …` line; the two imports from the lib may be merged into one.)

Append at the end of the file:

```js
/**
 * Serve one handler on a random loopback port. Returns the URL a spec would
 * be configured with and a `close()` that also drops open sockets, so a
 * handler that deliberately never responds cannot keep the process alive.
 */
function serve(handler) {
	const server = createServer(handler);
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			resolve({
				url: `http://127.0.0.1:${port}/openapi.yaml`,
				close: () =>
					new Promise((done) => {
						server.closeAllConnections();
						server.close(() => done());
					}),
			});
		});
	});
}

test('a remote document produces the same sidebar as the same document on disk', async () => {
	// The sidebar is built from whatever bytes arrive; where they came from must
	// not change a single entry or anchor.
	const body = readFileSync('./public/openapi.yaml', 'utf-8');
	const remote = await serve((_, res) => {
		res.setHeader('Content-Type', 'application/yaml');
		res.end(body);
	});
	try {
		const fromDisk = await openApiSidebarGroup({ spec: './public/openapi.yaml', base: BASE });
		const fromUrl = await openApiSidebarGroup({ spec: remote.url, base: BASE });
		assert.deepEqual(fromUrl, fromDisk);
	} finally {
		await remote.close();
	}
});

test('an unreachable URL degrades to a plain link and says the build machine must reach it', async () => {
	// Open then close a server so the port is known to have no listener:
	// the connection is refused immediately instead of waiting on a timeout.
	const remote = await serve(() => {});
	await remote.close();

	const warned = mock.method(console, 'warn', () => {});
	try {
		const group = await openApiSidebarGroup({ spec: remote.url, base: BASE });
		assert.deepEqual(group, { label: 'API reference', link: BASE });

		const messages = warned.mock.calls.map((call) => String(call.arguments[0]));
		assert.ok(
			messages.some((m) => m.includes(remote.url) && m.includes('must be able to reach this URL')),
			`expected a warning naming the URL, got:\n${messages.join('\n')}`
		);
	} finally {
		warned.mock.restore();
	}
});

test('a server error degrades to a plain link', async () => {
	const remote = await serve((_, res) => {
		res.statusCode = 500;
		res.end('nope');
	});
	try {
		const group = await openApiSidebarGroup({ spec: remote.url, base: BASE });
		assert.deepEqual(group, { label: 'API reference', link: BASE });
	} finally {
		await remote.close();
	}
});

test('a fetch that never completes times out instead of hanging the build', async () => {
	const remote = await serve(() => {
		/* never respond */
	});
	try {
		await assert.rejects(loadSource(remote.url, { timeoutMs: 200 }), /timed out after 200ms/);
	} finally {
		await remote.close();
	}
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/openapi-sidebar.test.mjs`
Expected: the file fails to load — `SyntaxError: The requested module '../src/lib/openapi-sidebar.mjs' does not provide an export named 'loadSource'`.

- [ ] **Step 3: Implement `isRemoteSpec`, `loadSource`, and the URL branch**

In `packages/template/src/lib/openapi-sidebar.mjs`, replace the `warn` function (lines 81–86) with:

```js
function warn(spec, error, consequence) {
	const remote = isRemoteSpec(spec);
	console.warn(
		`[openapi-sidebar] Could not ${remote ? 'fetch' : 'read'} "${spec}": ${error?.message ?? error}\n` +
			`  ${consequence}` +
			(remote ? '\n  The build machine must be able to reach this URL.' : '')
	);
}
```

Replace the block from `const documentCache = new Map();` through the end of `loadDocument` (lines 125–146) with:

```js
/** Is this `spec` value fetched over the network rather than read from disk? */
export function isRemoteSpec(spec) {
	return /^https?:\/\//i.test(String(spec));
}

/**
 * Longest a build waits on one remote document. A customer's API host that
 * hangs must not hang their build with it; thirty seconds is generous for a
 * file and short enough to notice.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Fetch a remote document as text, turning the three ways this fails into
 * one-line messages a customer can act on. `fetch` itself reports a refused
 * connection as a bare "fetch failed" with the code buried in `cause`, and a
 * timeout as a DOMException whose message never mentions the duration.
 */
async function fetchSource(url, timeoutMs) {
	let response;
	try {
		response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		if (error?.name === 'TimeoutError') {
			throw new Error(`timed out after ${timeoutMs}ms`, { cause: error });
		}
		const code = error?.cause?.code;
		throw new Error(code ? `${error.message} (${code})` : error?.message ?? String(error), {
			cause: error,
		});
	}
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
	}
	return response.text();
}

/**
 * The raw document, once per `spec` value per build.
 *
 * Three things need it — the sidebar, the search index, and the endpoint that
 * serves documents kept outside `public/` — and they run from different places
 * at different moments. Memoising the promise means one read or one fetch,
 * shared, with concurrent callers waiting on the same request rather than
 * racing. Failures are dropped from the cache so a dev server can retry after
 * the customer fixes the path or the host comes back.
 *
 * `timeoutMs` exists for the test suite; every real caller takes the default.
 */
const sourceCache = new Map();

export function loadSource(spec, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
	const cached = sourceCache.get(spec);
	if (cached) return cached;

	const pending = isRemoteSpec(spec) ? fetchSource(spec, timeoutMs) : readFile(spec, 'utf-8');

	pending.catch(() => sourceCache.delete(spec));
	sourceCache.set(spec, pending);
	return pending;
}

/**
 * Read and fully resolve an OpenAPI document, once per `spec` per build.
 *
 * `normalize` accepts YAML or JSON, `upgrade` lifts Swagger 2.0 and OpenAPI 3.0
 * documents to 3.1, and `dereference` resolves `$ref`s — so a customer's spec
 * works whatever shape it arrives in. Built on `loadSource`, so a document
 * that is also served by the endpoint is still only read or fetched once.
 *
 * Memoised separately because dereferencing dominates the cost on a large
 * spec and the sidebar and the search index each need the result.
 */
const documentCache = new Map();

function loadDocument(spec) {
	const cached = documentCache.get(spec);
	if (cached) return cached;

	const pending = (async () => {
		const raw = await loadSource(spec);
		const { specification } = upgrade(normalize(raw));
		// `dereference` is synchronous despite the name — no `await` here.
		const { schema } = dereference(specification);
		return schema ?? specification;
	})();

	pending.catch(() => documentCache.delete(spec));

	documentCache.set(spec, pending);
	return pending;
}
```

Then update the two consequence strings passed to `warn` so the sidebar one reads exactly `'The reference is still linked, but has no operation sidebar.'` (both call sites in `openApiSidebarGroup`) and the search one stays `'The API reference is not searchable by operation.'` (both call sites in `openApiOperations`).

Update the header comment of the file: the paragraph beginning `This is a template. Customers replace \`public/openapi.yaml\`` — change its first two sentences to: `This is a template. You point \`spec\` at your own document — a file in \`public/\`, a file elsewhere in your repository, or a URL — and the sidebar has to follow without anyone editing config.` Update the `@param {string} options.spec` lines on both exported functions to read `Path to the OpenAPI document on disk, or an http(s) URL.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/openapi-sidebar.test.mjs`
Expected: all tests pass, including the four new ones. The unreachable-URL and 500 tests print `[openapi-sidebar] Could not fetch …` warnings to stderr — that is the behaviour under test, not a failure.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openapi-sidebar.mjs tests/openapi-sidebar.test.mjs
git commit -m "feat: read the OpenAPI document from a URL as well as from disk

loadSource() fetches http(s) specs with a 30s timeout and is memoised so the
sidebar, search index and (next) the serving endpoint share one request.
A fetched document yields the same sidebar as the same bytes on disk.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Derive the browser URL — `specUrlFor` and validation in the config

**Files:**
- Modify: `packages/template/src/config/api-reference.mjs` (whole file — the header comment, both shipped entries, and the helpers change)
- Test: `packages/template/tests/api-reference-config.test.mjs` (new)

**Interfaces:**
- Consumes: `isRemoteSpec` from `../lib/openapi-sidebar.mjs` (Task 1).
- Produces, all exported from `src/config/api-reference.mjs`:
  - `apiReferences`, `enabledReferences`, `routeFor(reference)`, `listsOperationsInSidebar(reference)` — unchanged.
  - `isRemoteSpec` — re-exported from the lib.
  - `emittedFileFor(reference): string` — `` `${reference.id}.${'json' | 'yaml'}` ``.
  - `needsEmit(reference): boolean` — true when the template must serve the document itself.
  - `specUrlFor(reference): string` — the URL the browser fetches.
  - `emittedReferences: reference[]` — `enabledReferences.filter(needsEmit)`.
  - `validateReferences(references): void` — throws on config mistakes; called at module load with `apiReferences`.

- [ ] **Step 1: Write the failing tests**

Create `packages/template/tests/api-reference-config.test.mjs`:

```js
/**
 * Unit tests for the API reference config helpers.
 *
 * These pin the rules that turn one `spec` value into the URL the browser
 * fetches, and the config mistakes that fail a build by name. They run against
 * the module directly, not the built site.
 *
 * Run:  node --test tests/api-reference-config.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	specUrlFor,
	emittedFileFor,
	needsEmit,
	validateReferences,
	emittedReferences,
	enabledReferences,
} from '../src/config/api-reference.mjs';

/** A complete, valid reference with the given fields changed. */
const ref = (overrides = {}) => ({
	id: 'payments',
	enabled: true,
	slug: '',
	layout: 'docs',
	spec: './public/openapi.yaml',
	label: 'API reference',
	title: 'API reference',
	description: 'Example.',
	...overrides,
});

// --- specUrlFor: the four rules, in order -----------------------------------

test('an explicit specUrl wins verbatim and nothing is emitted', () => {
	const reference = ref({ spec: '../api/openapi.yaml', specUrl: '/custom/openapi.yaml' });
	assert.equal(specUrlFor(reference), '/custom/openapi.yaml');
	assert.equal(needsEmit(reference), false);
});

test("a live remote document is fetched from its origin", () => {
	const reference = ref({ spec: 'https://api.example.com/openapi.yaml', serve: 'live' });
	assert.equal(specUrlFor(reference), 'https://api.example.com/openapi.yaml');
	assert.equal(needsEmit(reference), false);
});

test('a document under public/ is served from the site root', () => {
	assert.equal(specUrlFor(ref({ spec: './public/openapi.yaml' })), '/openapi.yaml');
	assert.equal(specUrlFor(ref({ spec: 'public/openapi.yaml' })), '/openapi.yaml');
	assert.equal(specUrlFor(ref({ spec: './public/specs/v2/openapi.json' })), '/specs/v2/openapi.json');
	assert.equal(needsEmit(ref({ spec: './public/openapi.yaml' })), false);
});

test('a document elsewhere on disk is emitted under /api-spec/', () => {
	const reference = ref({ spec: '../api/openapi.yaml' });
	assert.equal(specUrlFor(reference), '/api-spec/payments.yaml');
	assert.equal(needsEmit(reference), true);
});

test('a remote document is snapshotted by default', () => {
	const reference = ref({ spec: 'https://api.example.com/openapi.json' });
	assert.equal(specUrlFor(reference), '/api-spec/payments.json');
	assert.equal(needsEmit(reference), true);

	// Saying it explicitly changes nothing.
	assert.equal(specUrlFor(ref({ ...reference, serve: 'snapshot' })), '/api-spec/payments.json');
});

test('a public/ path is matched as a path, not a substring', () => {
	// `./not-public/openapi.yaml` and `../public/openapi.yaml` are not this
	// project's public directory and must be emitted, not served from the root.
	assert.equal(specUrlFor(ref({ spec: './not-public/openapi.yaml' })), '/api-spec/payments.yaml');
	assert.equal(specUrlFor(ref({ spec: '../public/openapi.yaml' })), '/api-spec/payments.yaml');
});

// --- emittedFileFor: the extension ------------------------------------------

test('the emitted file takes its extension from the source', () => {
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi.json' })), 'payments.json');
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi.yaml' })), 'payments.yaml');
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi.yml' })), 'payments.yaml');
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi' })), 'payments.yaml');
});

test('a URL with a query string still gets the right extension', () => {
	assert.equal(
		emittedFileFor(ref({ spec: 'https://api.example.com/openapi.json?version=2' })),
		'payments.json'
	);
});

// --- validateReferences: mistakes that fail the build by name ---------------

test("serve: 'live' on a file is a config error", () => {
	assert.throws(
		() => validateReferences([ref({ serve: 'live' })]),
		/"payments" sets serve: 'live' but its spec is a file, not a URL/
	);
});

test('an unknown serve value is a config error', () => {
	assert.throws(
		() => validateReferences([ref({ spec: 'https://api.example.com/openapi.yaml', serve: 'cached' })]),
		/"payments" sets serve: 'cached'.*'snapshot'.*'live'/s
	);
});

test('two references sharing an id is a config error', () => {
	assert.throws(
		() => validateReferences([ref({ slug: 'a' }), ref({ slug: 'b' })]),
		/Two references share the id "payments"/
	);
});

test('two references sharing a route is a config error', () => {
	assert.throws(
		() => validateReferences([ref({ id: 'a' }), ref({ id: 'b' })]),
		/Two references are configured at "\/api\/"/
	);
});

test('disabled references are not validated', () => {
	assert.doesNotThrow(() => validateReferences([ref({ serve: 'live', enabled: false })]));
});

test('a valid list passes', () => {
	assert.doesNotThrow(() =>
		validateReferences([
			ref(),
			ref({ id: 'admin', slug: 'admin', spec: 'https://api.example.com/admin.yaml', serve: 'live' }),
		])
	);
});

// --- the shipped config -----------------------------------------------------

test('the shipped references live in public/ and emit nothing', () => {
	assert.ok(enabledReferences.length >= 1);
	assert.deepEqual(emittedReferences, []);
	for (const reference of enabledReferences) {
		assert.ok(specUrlFor(reference).startsWith('/'), `${reference.id}: expected a site-root URL`);
		assert.ok(!('specUrl' in reference), `${reference.id}: shipped entries no longer set specUrl`);
	}
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/api-reference-config.test.mjs`
Expected: fails to load — `does not provide an export named 'specUrlFor'` (or `emittedFileFor`, whichever the loader reports first).

- [ ] **Step 3: Rewrite the config module**

Replace the entire contents of `packages/template/src/config/api-reference.mjs` with:

```js
/**
 * API references — the one file to edit.
 *
 * Each entry below becomes a route rendering one OpenAPI document with Scalar.
 * The routes, the sidebar, and the search index are all derived from this list,
 * so there is no second place to keep in sync.
 *
 * ## Where your document lives
 *
 * `spec` says where the document is, and it is the only field about the
 * document you must set. It takes a path relative to this project, or an
 * `http(s)://` URL. Everything else — the URL the reader's browser loads,
 * whether the build serves a copy — is derived from it by `specUrlFor()`:
 *
 * | `spec`                            | The browser loads                         |
 * | --------------------------------- | ----------------------------------------- |
 * | `./public/openapi.yaml`           | `/openapi.yaml` — `public/` is the root   |
 * | `../api/openapi.yaml`             | `/api-spec/<id>.yaml`, served by the build |
 * | `https://…/openapi.yaml`          | see `serve` below                         |
 *
 * A remote document is fetched at build time to generate the sidebar and the
 * search index, so it gets exactly the sidebar a bundled one does. `serve`
 * chooses how it reaches the reader's browser:
 *
 *   'snapshot' — (default) the build fetches it once and serves the copy from
 *                this site. No CORS requirement on the API host, and the
 *                reference cannot render blank because that host was down.
 *                The copy updates when you rebuild.
 *   'live'     — the reader's browser fetches the URL directly, so the
 *                reference always shows the current document. The host must
 *                allow cross-origin requests from this site.
 *
 * Either way the machine running the build must be able to reach the URL.
 *
 * `specUrl` is optional and rarely needed: set it and the browser loads that
 * value verbatim, with nothing derived and nothing served for you.
 *
 * ## The two layouts
 *
 * **`docs`** keeps the full Starlight page — same header, same sidebar, same
 * navigation as the rest of the documentation. Every operation is listed in
 * that sidebar, generated from the document, so the API and the prose share one
 * navigation tree. This is the right default for most sites.
 *
 * **`full`** hands the whole width to Scalar: Starlight's sidebar steps aside
 * and Scalar's own operation navigation takes over. Better for large documents
 * — Scalar's sidebar is virtualised, so it stays quick where a fully expanded
 * Starlight tree would not.
 *
 * ## Why two entries ship
 *
 * So you can see both layouts running on real content before choosing. They are
 * two different example APIs rather than one document shown twice, because a
 * control for flipping between layouts is not something a docs site should ship
 * to its readers.
 *
 * **Delete the one you do not want.** Remove its entry here and its file from
 * `public/`, and the route, its sidebar entries and its search entries all go
 * with it. Keeping both is also fine — plenty of products document more than
 * one API, and that is exactly what this list is for.
 *
 * To change a layout rather than remove it, set `layout` to `'docs'` or
 * `'full'`. Nothing else needs to change.
 */
import { isRemoteSpec } from '../lib/openapi-sidebar.mjs';

export { isRemoteSpec };

/** @typedef {'docs' | 'full'} ApiLayout */
/** @typedef {'snapshot' | 'live'} ServeMode */

export const apiReferences = [
	{
		id: 'payments',
		enabled: true,

		/**
		 * Path segment under `/api/`, or `''` for `/api/` itself.
		 *
		 * A slug rather than a full path because the route file lives at
		 * `src/pages/api/[...reference].astro` — everything it builds is under
		 * `/api/` whatever this says. Taking a slug makes that a fact of the API
		 * instead of a rule to remember, and `routeFor()` derives the one URL that
		 * the page, the sidebar and the search index all use.
		 */
		slug: '',

		/** @type {ApiLayout} */
		layout: 'docs',

		/**
		 * Where the document is: a path, or an `http(s)://` URL. See the header
		 * comment for what each kind does. Replace this file with your own to
		 * get started — nothing else needs to change.
		 */
		spec: './public/openapi.yaml',

		/** Sidebar group label, page `<title>`, and H1. */
		label: 'API reference',
		title: 'API reference',
		description:
			'Interactive reference for the Example Payments API, rendered with Scalar.',
	},
	{
		id: 'admin',
		enabled: true,
		slug: 'admin',
		/** @type {ApiLayout} */
		layout: 'full',
		spec: './public/openapi-admin.yaml',
		label: 'Admin API',
		title: 'Admin API',
		description:
			'Interactive reference for the Example Admin API, rendered full-width with Scalar.',
	},
];

/** References that are actually built, in declaration order. */
export const enabledReferences = apiReferences.filter((reference) => reference.enabled);

/**
 * The URL a reference is served at — the single source for the page, its
 * sidebar entries and its search anchors, so those three cannot disagree.
 */
export function routeFor(reference) {
	const slug = (reference.slug ?? '').replace(/^\/+|\/+$/g, '');
	return slug ? `/api/${slug}/` : '/api/';
}

/** The `serve` mode in effect, with the default applied. */
function serveModeFor(reference) {
	return /** @type {ServeMode} */ (reference.serve ?? 'snapshot');
}

/**
 * Where under the site root a `public/` path is served, or `null` when the
 * path is not under this project's `public/`.
 *
 * Anchored, so `./not-public/x` and `../public/x` — a sibling project's
 * directory — do not match. Written for POSIX separators, which is how this
 * file is written on every platform.
 */
function publicUrlFor(spec) {
	const match = /^(?:\.\/)?public\/(.+)$/.exec(String(spec));
	return match ? `/${match[1]}` : null;
}

/**
 * The file the build emits for a reference it serves itself: `<id>.<ext>`.
 *
 * The extension follows the source so the "Download OpenAPI Document" link
 * hands readers a sensibly named file; Scalar sniffs the content, so it is
 * cosmetic. Query strings on a URL are ignored when deciding.
 */
export function emittedFileFor(reference) {
	const source = String(reference.spec);
	const path = isRemoteSpec(source) ? new URL(source).pathname : source;
	const extension = /\.json$/i.test(path) ? 'json' : 'yaml';
	return `${reference.id}.${extension}`;
}

/**
 * Must the build serve this document itself?
 *
 * True for the cases nothing else serves: a file outside `public/`, or a remote
 * document being snapshotted. False when the customer set `specUrl` (they are
 * serving it), when Astro serves it from `public/`, or when the browser goes
 * to the origin (`serve: 'live'`).
 */
export function needsEmit(reference) {
	if (reference.specUrl) return false;
	if (isRemoteSpec(reference.spec)) return serveModeFor(reference) === 'snapshot';
	return publicUrlFor(reference.spec) === null;
}

/**
 * The URL the reader's browser fetches the document from.
 *
 * Derived from `spec` so the two can never disagree — the failure this design
 * replaces was two hand-maintained fields for one document, where a remote
 * URL silently lost the sidebar and a file outside `public/` rendered blank.
 * Rules, first match wins: an explicit `specUrl`; a live remote URL; a
 * `public/` file at the site root; otherwise the file the build emits.
 */
export function specUrlFor(reference) {
	if (reference.specUrl) return reference.specUrl;
	if (isRemoteSpec(reference.spec) && serveModeFor(reference) === 'live') return reference.spec;
	return publicUrlFor(reference.spec) ?? `/api-spec/${emittedFileFor(reference)}`;
}

/**
 * Enabled references the build serves itself. The endpoint at
 * `src/pages/api-spec/[file].js` emits exactly these, and the tests read the
 * same list, so the two cannot disagree about what is in the build output.
 */
export const emittedReferences = enabledReferences.filter(needsEmit);

/**
 * Config mistakes with confusing symptoms, caught at build time by name.
 *
 * Each of these builds green and misbehaves quietly: two references on one
 * route leave one silently unreachable; two sharing an `id` collide on the
 * emitted file; `serve: 'live'` on a file would send the browser to a path it
 * cannot fetch. All are easy to introduce by copying an entry and changing one
 * field too few, so they are reported here rather than left to review.
 *
 * Exported so the tests can hand it bad lists; the module calls it on its own
 * list below.
 */
export function validateReferences(references) {
	const enabled = references.filter((reference) => reference.enabled);
	const routes = new Set();
	const ids = new Set();

	for (const reference of enabled) {
		if (ids.has(reference.id)) {
			throw new Error(
				`[api-reference] Two references share the id "${reference.id}". ` +
					`Give each one a distinct \`id\`.`
			);
		}
		ids.add(reference.id);

		const route = routeFor(reference);
		if (routes.has(route)) {
			throw new Error(
				`[api-reference] Two references are configured at "${route}" ` +
					`("${reference.id}" is the second). Give each one a distinct \`slug\`.`
			);
		}
		routes.add(route);

		const serve = reference.serve;
		if (serve !== undefined && serve !== 'snapshot' && serve !== 'live') {
			throw new Error(
				`[api-reference] "${reference.id}" sets serve: '${serve}', which is not a mode. ` +
					`Use 'snapshot' (serve a copy the build fetched) or 'live' (the browser fetches the URL).`
			);
		}
		if (serve === 'live' && !isRemoteSpec(reference.spec)) {
			throw new Error(
				`[api-reference] "${reference.id}" sets serve: 'live' but its spec is a file, not a URL. ` +
					`Remove serve, or point spec at the URL the browser should fetch.`
			);
		}
	}
}

validateReferences(apiReferences);

/**
 * Show each operation as its own sidebar link.
 *
 * Only for the `docs` layout: it is the one that keeps Starlight's sidebar on
 * screen, so without this there would be a single entry for the whole reference
 * and finding an endpoint would mean scrolling. Under `full`, Scalar's own
 * sidebar already lists every operation and a second copy in Starlight's would
 * be two navigation trees for one document.
 */
export function listsOperationsInSidebar(reference) {
	return reference.layout === 'docs';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/api-reference-config.test.mjs tests/openapi-sidebar.test.mjs`
Expected: all pass.

Then run: `npm run check`
Expected: `astro check` passes. The route still reads `reference.specUrl` until Task 4, but `Astro.props` is untyped there, so that is not a type error — it is a runtime gap the Task 4 tests catch. If the check objects to the JSDoc cast in `serveModeFor`, replace `/** @type {ServeMode} */ (reference.serve ?? 'snapshot')` with plain `reference.serve ?? 'snapshot'`.

- [ ] **Step 5: Commit**

```bash
git add src/config/api-reference.mjs tests/api-reference-config.test.mjs
git commit -m "feat: derive the browser URL for an API document from spec

spec now takes a path or a URL and is the only field about the document.
specUrlFor() derives what the browser fetches; serve: 'snapshot' | 'live'
chooses how a remote document reaches it. Bad combinations fail the build
by name. An explicit specUrl still wins, so existing configs are untouched.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Serve documents the template is responsible for — the `api-spec` endpoint

**Files:**
- Create: `packages/template/src/pages/api-spec/[file].js`
- Test: `packages/template/tests/api-spec-endpoint.test.mjs` (new)

**Interfaces:**
- Consumes: `emittedReferences`, `emittedFileFor`, `specUrlFor`, `isRemoteSpec` (Task 2); `loadSource` (Task 1).
- Produces: `export function getStaticPaths()` and `export async function GET(context)` — Astro's static-endpoint contract. `GET` reads `context.props.reference`.

- [ ] **Step 1: Write the failing tests**

Create `packages/template/tests/api-spec-endpoint.test.mjs`:

```js
/**
 * Unit tests for the endpoint that serves OpenAPI documents kept outside
 * `public/` — a file elsewhere on disk, or a remote document being
 * snapshotted. Astro calls `getStaticPaths` then `GET` once per path at build
 * time; these tests call them the same way.
 *
 * Run:  node --test tests/api-spec-endpoint.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

import { GET, getStaticPaths } from '../src/pages/api-spec/[file].js';

const YAML = 'openapi: 3.1.0\ninfo:\n  title: Outside public\n  version: "1"\npaths: {}\n';
const JSON_DOC = '{"openapi":"3.1.0","info":{"title":"Outside public","version":"1"},"paths":{}}';

/** Write a throwaway document outside `public/` and return its path. */
function specFile(name, contents) {
	const dir = mkdtempSync(join(tmpdir(), 'api-spec-endpoint-'));
	const file = join(dir, name);
	writeFileSync(file, contents, 'utf-8');
	return file;
}

const ref = (overrides = {}) => ({
	id: 'external',
	enabled: true,
	slug: 'external',
	layout: 'docs',
	label: 'External',
	title: 'External',
	description: 'Example.',
	...overrides,
});

/** A URL on a loopback port that has no listener, so connecting is refused at once. */
async function closedUrl() {
	const server = createServer(() => {});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	await new Promise((resolve) => server.close(resolve));
	return `http://127.0.0.1:${port}/openapi.yaml`;
}

test('the shipped config emits nothing', () => {
	// Both shipped references live in public/, which Astro serves itself.
	assert.deepEqual(getStaticPaths(), []);
});

test('a YAML document outside public/ is served verbatim as YAML', async () => {
	const reference = ref({ spec: specFile('openapi.yaml', YAML) });
	const response = await GET({ props: { reference }, params: { file: 'external.yaml' } });

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('Content-Type'), 'application/yaml');
	assert.equal(await response.text(), YAML, 'the raw bytes, not a normalized copy');
});

test('a JSON document is served as JSON', async () => {
	const reference = ref({ spec: specFile('openapi.json', JSON_DOC) });
	const response = await GET({ props: { reference }, params: { file: 'external.json' } });

	assert.equal(response.headers.get('Content-Type'), 'application/json');
	assert.equal(await response.text(), JSON_DOC);
});

test('a missing file fails the build and names what would have gone blank', async () => {
	const reference = ref({ spec: '/definitely/not/here/openapi.yaml' });
	await assert.rejects(
		GET({ props: { reference }, params: { file: 'external.yaml' } }),
		/Could not read "\/definitely\/not\/here\/openapi\.yaml" for reference "external".*Nothing to serve at \/api-spec\/external\.yaml; the reference would render blank/s
	);
});

test('an unreachable snapshot URL fails the build and names what would have gone blank', async () => {
	const url = await closedUrl();
	const reference = ref({ spec: url });
	await assert.rejects(
		GET({ props: { reference }, params: { file: 'external.yaml' } }),
		new RegExp(
			`Could not fetch "${url.replace(/[.\\/]/g, '\\$&')}" for reference "external".*` +
				`Nothing to serve at /api-spec/external\\.yaml; the reference would render blank`,
			's'
		)
	);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/api-spec-endpoint.test.mjs`
Expected: `Cannot find module '…/src/pages/api-spec/[file].js'`.

If instead the loader complains about the `[` in the specifier, switch the import to
`const { GET, getStaticPaths } = await import(new URL('../src/pages/api-spec/[file].js', import.meta.url));`
— the bracketed filename is fixed by Astro's routing, the test adapts.

- [ ] **Step 3: Write the endpoint**

Create `packages/template/src/pages/api-spec/[file].js`:

```js
/**
 * Serves the OpenAPI documents this site has to serve itself.
 *
 * Scalar renders a reference in the browser from a URL, so every document has
 * to be reachable over HTTP on the deployed site. A file in `public/` already
 * is — Astro copies that directory to the site root. Two kinds of `spec` are
 * not: a file kept elsewhere in your repository, and a remote URL you have
 * asked to be snapshotted (`serve: 'snapshot'`, the default). This endpoint
 * emits those, one static file each at `/api-spec/<id>.<ext>`, at build time.
 *
 * Which references that is comes from `emittedReferences` in
 * `src/config/api-reference.mjs`, the same list the tests read, so what the
 * config promises and what the build output contains cannot drift apart. As
 * shipped, both example references live in `public/` and this emits nothing.
 *
 * A static endpoint rather than a build hook copying files: Astro puts the
 * result wherever static assets go for the adapter in use, which differs
 * between the Node and Vercel adapters, and this file does not need to know.
 *
 * It serves the **raw** document — the bytes as read or fetched, not the
 * normalized, dereferenced copy the sidebar is built from. Scalar upgrades
 * older documents itself, and the "Download OpenAPI Document" link should hand
 * readers the file they would recognise. `loadSource` is memoised, so the
 * sidebar, the search index and this endpoint share one read or fetch.
 *
 * ## Why this throws
 *
 * The sidebar generator warns and degrades on a bad document, so a typo does
 * not fail your first build. This is the one place that policy would be wrong:
 * if the document cannot be obtained here there is nothing to serve, and the
 * reference page would render blank. "Your spec URL is unreachable" is worth
 * hearing at build time rather than from a reader.
 */
import {
	emittedReferences,
	emittedFileFor,
	specUrlFor,
	isRemoteSpec,
} from '../../config/api-reference.mjs';
import { loadSource } from '../../lib/openapi-sidebar.mjs';

const CONTENT_TYPES = {
	json: 'application/json',
	yaml: 'application/yaml',
};

export function getStaticPaths() {
	return emittedReferences.map((reference) => ({
		params: { file: emittedFileFor(reference) },
		props: { reference },
	}));
}

/** @param {{ props: { reference: (typeof emittedReferences)[number] } }} context */
export async function GET({ props }) {
	const { reference } = props;

	let body;
	try {
		body = await loadSource(reference.spec);
	} catch (error) {
		throw new Error(
			`[api-spec] Could not ${isRemoteSpec(reference.spec) ? 'fetch' : 'read'} ` +
				`"${reference.spec}" for reference "${reference.id}": ${error?.message ?? error}\n` +
				`  Nothing to serve at ${specUrlFor(reference)}; the reference would render blank.`,
			{ cause: error }
		);
	}

	const extension = emittedFileFor(reference).split('.').pop();
	return new Response(body, {
		headers: { 'Content-Type': CONTENT_TYPES[extension] ?? CONTENT_TYPES.yaml },
	});
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/api-spec-endpoint.test.mjs`
Expected: all five pass.

Then run: `npm run check`
Expected: passes. The `@param` JSDoc type on `GET` is documentation only — JS files are not type-checked here — so if `astro check` objects to it, delete that one comment line.

- [ ] **Step 5: Commit**

```bash
git add 'src/pages/api-spec/[file].js' tests/api-spec-endpoint.test.mjs
git commit -m "feat: serve OpenAPI documents kept outside public/ from /api-spec/

A prerendered endpoint emits the raw document for a file elsewhere on disk
or a snapshotted remote URL, so the browser can fetch what the sidebar was
built from. It throws — failing the build — when the document cannot be
obtained, since the alternative is a blank reference page.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Wire the derived URL into the page, and teach the build tests the new rules

**Files:**
- Modify: `packages/template/src/pages/api/[...reference].astro:23` (import) and `:103` (`url=`)
- Modify: `packages/template/src/components/ScalarApiReference.astro:29-33` (`url` prop comment)
- Modify: `packages/template/src/components/ApiSearchIndex.astro` (the `spec` prop comment: `/** Path to this reference's OpenAPI document on disk. */`)
- Modify: `packages/template/tests/scalar-api-reference.test.mjs:25-29` (imports), `:38` (`specFor`), `:46-55` (emitted test), `:63-75` (own-document test)

**Interfaces:**
- Consumes: `specUrlFor`, `isRemoteSpec` (Task 2).
- Produces: nothing new. After this task `npm test` is the integration check for the whole feature on the shipped config.

- [ ] **Step 1: Update the build tests first**

In `packages/template/tests/scalar-api-reference.test.mjs`, change the import from the config (around lines 25–29) to also pull in the two helpers:

```js
import {
	enabledReferences,
	listsOperationsInSidebar,
	routeFor,
	specUrlFor,
	isRemoteSpec,
} from '../src/config/api-reference.mjs';
```

Replace the `specFor` helper (line 38):

```js
/**
 * Absolute path of the document a reference is served from — for the
 * references the build output contains. A reference whose browser URL is
 * remote (`serve: 'live'`, or an absolute `specUrl`) has nothing on disk.
 */
const specFor = (reference) => join(STATIC_DIR, specUrlFor(reference).replace(/^\//, ''));
```

Replace the body of the test `"every reference's OpenAPI document is emitted as a static asset"`:

```js
test("every reference's OpenAPI document is emitted as a static asset", () => {
	for (const reference of enabledReferences) {
		// Nothing to check on disk for a document the browser fetches from its
		// origin; the "points at its own document" test below covers that case.
		if (isRemoteSpec(specUrlFor(reference))) continue;

		const spec = specFor(reference);
		assert.ok(existsSync(spec), `${reference.id}: ${specUrlFor(reference)} missing from the build output`);

		const content = readFileSync(spec, 'utf-8');
		assert.match(content, /^openapi:\s*3\./m, `${reference.id}: not an OpenAPI 3.x document`);
		assert.match(content, /^paths:/m, `${reference.id}: document declares no paths`);
	}
});
```

Replace the body of the test `'every reference points at its own document'`:

```js
test('every reference points at its own document', () => {
	// The failure this catches is a reference rendering someone else's API —
	// easy to introduce when copying an entry in the config, and invisible until
	// someone reads the page.
	for (const reference of enabledReferences) {
		const html = readFileSync(htmlFor(reference), 'utf-8');
		const url = specUrlFor(reference);
		assert.ok(
			html.includes(url),
			`${reference.id}: ${routeFor(reference)} does not reference ${url} — ` +
				`it would 404 on its document at runtime`
		);
	}
});
```

Those were the only three uses of `.specUrl` in the file as of 2026-09-09 (lines 38, 49, 70–71). Confirm with `grep -n specUrl tests/scalar-api-reference.test.mjs` — the only hits left should be inside the `specUrlFor(` calls above.

- [ ] **Step 2: Run the build tests to verify they fail**

Run: `npm test`
Expected: the build succeeds, then `'every reference points at its own document'` fails for both references — the route still passes `reference.specUrl`, which is now `undefined`, so the serialised Scalar configuration in the HTML has no `url` and the page no longer contains `/openapi.yaml`.

- [ ] **Step 3: Wire the route and fix the two prop comments**

In `packages/template/src/pages/api/[...reference].astro`, line 23:

```js
import { enabledReferences, specUrlFor } from '../../config/api-reference.mjs';
```

Line 103, inside `<ScalarApiReference …>`:

```astro
		url={specUrlFor(reference)}
```

In `packages/template/src/components/ScalarApiReference.astro`, replace the `url` prop's comment (lines 29–32):

```ts
	/**
	 * URL of the OpenAPI document as the browser fetches it. Derived by
	 * `specUrlFor()` in `src/config/api-reference.mjs` from where the document
	 * lives — a file in `public/`, a file the build serves from `/api-spec/`,
	 * or a remote URL — so you change the config, not this component.
	 */
	url?: string;
```

In `packages/template/src/components/ApiSearchIndex.astro`, replace the `spec` prop comment:

```ts
	/** Path to this reference's OpenAPI document on disk, or an http(s) URL. */
	spec: string;
```

- [ ] **Step 4: Run the full template checks**

Run: `npm run check && npm test`
Expected: both pass — `astro check` clean; the build emits both `public/` documents; every `tests/*.test.mjs` passes, including the three touched or added in Tasks 1–3.

Run: `npm run test:visual:ci`
Expected: passes. Nothing visual changed — both shipped references are still `public/` files at the same URLs — so this is a regression guard, not new coverage. Needs `npx playwright install chromium` once if it has never run on this machine.

- [ ] **Step 5: Commit**

```bash
git add 'src/pages/api/[...reference].astro' src/components/ScalarApiReference.astro src/components/ApiSearchIndex.astro tests/scalar-api-reference.test.mjs
git commit -m "feat: the reference page loads its document from the derived URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Documentation — hosted how-to, maintainer wiki, removal table

**Files:**
- Modify: `apps/docs/src/content/docs/api-reference.md` (frontmatter `description`; replace the `## Add your document` section)
- Modify: `apps/docs/src/content/docs/removing-features.md:11-19` (the "Remove the API reference" table)
- Modify: `packages/template/wiki/api-reference.md:9-20` (replace `## Swap in your own spec`)

**Interfaces:**
- Consumes: the names from Task 2 (`specUrlFor`, `emittedReferences`, `loadSource`, `/api-spec/<id>.<ext>`), exactly as spelled there.
- Produces: nothing code-facing. `npm run check` at the repo root is the test.

- [ ] **Step 1: Rewrite the hosted how-to section**

In `apps/docs/src/content/docs/api-reference.md`, change the frontmatter `description` to:

```yaml
description: Point src/config/api-reference.mjs at your OpenAPI document — bundled, elsewhere in your repo, or at a URL — and choose between Starlight's sidebar and Scalar's full-width shell.
```

Replace everything from `## Add your document` up to (not including) `## Two layouts` with:

````md
## Where your document lives

`spec` is the one field that says where the document is. It takes a path or a
URL, and everything else — the address the reader's browser loads, whether the
build serves a copy — follows from it.

### Bundled with the site

```js
spec: './public/openapi.yaml',
```

Replace that file with your own. Anything under `public/` is served from the
site root, so the browser loads it from `/openapi.yaml`. JSON works as well as
YAML, and Swagger 2.0 / OpenAPI 3.0 documents upgrade to 3.1 automatically —
nothing else to change.

### Elsewhere in your repository

```js
spec: '../api/openapi.yaml',
```

Point at the file where it already is — a monorepo's API package, a file your
build generates. The template reads it at build time and serves a copy at
`/api-spec/<id>.yaml` (or `.json`, following the source), so nothing is
duplicated into `public/` and the two can't drift.

### At a remote URL

```js
spec: 'https://api.example.com/openapi.yaml',
serve: 'snapshot', // or 'live'
```

The build fetches the document to generate the sidebar and the search index —
the same sidebar a bundled document gets. `serve` decides how it reaches the
reader's browser:

| `serve` | The browser loads | Suits |
| --- | --- | --- |
| `'snapshot'` (default) | a copy the build saved, from your own site at `/api-spec/<id>.yaml` | Most cases. No CORS setup on the API host, and the reference can't render blank because that host was down. The copy updates when you rebuild. |
| `'live'` | the URL itself, on every visit | A document that changes more often than you deploy. The host must allow cross-origin requests from your docs site. |

Either way, **the machine running the build must be able to reach the URL.**
If it can't, a `snapshot` build fails with the URL in the error; a `live` build
succeeds with a warning, and the reference has no operation sidebar and isn't
searchable until the next build that can reach it.

To keep a snapshot current without a manual deploy, trigger a rebuild from
your API's release pipeline — on Vercel, a
[deploy hook](https://vercel.com/docs/deploy-hooks) is one URL to `POST`.

:::note[Upgrading from an earlier version]
Entries that set `specUrl` keep working: an explicit `specUrl` is used as-is
and nothing is derived or served for you. None of the three cases above needs
it, so drop it the next time you touch the entry.
:::

````

- [ ] **Step 2: Add the new files to the removal table**

In `apps/docs/src/content/docs/removing-features.md`, in the table under `## Remove the API reference`, insert after the `src/pages/api/` row:

```md
| `src/pages/api-spec/` | The endpoint that serves documents kept outside `public/`. |
```

and change the tests row to:

```md
| `tests/openapi-sidebar.test.mjs`, `tests/api-reference-config.test.mjs`, `tests/api-spec-endpoint.test.mjs`, `tests/scalar-api-reference.test.mjs`, `tests/visual/api-reference.spec.mjs` | Their tests. |
```

- [ ] **Step 3: Rewrite the wiki section**

In `packages/template/wiki/api-reference.md`, replace everything from `## Swap in your own spec` up to (not including) `## Two references, two layouts` with:

````md
## Where the document comes from

`spec` takes a path or an `http(s)://` URL. Three things consume it, and they
share one read or fetch per build through `loadSource()` in
`src/lib/openapi-sidebar.mjs`: the sidebar generator, the search index, and —
when the site has to serve the document itself — the endpoint at
`src/pages/api-spec/[file].js`.

The URL the browser fetches is derived by `specUrlFor()` in
`src/config/api-reference.mjs`. First rule that matches:

| # | When | The browser fetches | Emitted by the endpoint? |
| --- | --- | --- | --- |
| 1 | `specUrl` is set | that value, verbatim | no |
| 2 | a URL with `serve: 'live'` | the URL | no |
| 3 | a path under `public/` | the path minus `public/` | no — Astro serves `public/` |
| 4 | anything else | `/api-spec/<id>.<ext>` | yes |

`emittedReferences` is the rule-4 set. The endpoint's `getStaticPaths()` and
the build tests both read it, so what the config promises and what the build
output contains cannot disagree. As shipped, both examples are rule 3 and the
endpoint emits nothing.

**What is emitted is the raw document** — the bytes as read or fetched, not the
normalized, dereferenced copy the sidebar is built from. Scalar upgrades old
documents itself, and the "Download OpenAPI Document" link should hand readers
the file they would recognise.

**Failure policy.** The build fails when the site is responsible for serving a
document it cannot obtain — rule 4, where the endpoint throws naming the source
and the emitted path, because the alternative is a blank reference page.
Everything else warns and degrades as it always has: a `public/` file that is
missing, or a `live` URL the build machine cannot reach, leaves the reference
linked but without an operation sidebar or search entries. A fetch is capped at
30 seconds so a hung host cannot hang a build. The sidebar's warning fires
before the endpoint's error in a rule-4 failure — one redundant line, in
exchange for the generator staying ignorant of serve modes.

External file `$ref`s (`./schemas/pet.yaml`) do not resolve — `dereference`
reports `EXTERNAL_REFERENCE_NOT_FOUND` — for bundled and remote documents
alike. Tags and operations live in the root document, so the sidebar is
unaffected. Pre-existing; noted so it is not mistaken for a regression.

JSON works as well as YAML, and Swagger 2.0 and OpenAPI 3.0 documents are
upgraded to 3.1 automatically.

````

- [ ] **Step 4: Confirm the two shipped summaries still hold**

Read `packages/template/CLAUDE.md` around line 77 and `packages/template/README.md` around line 87. Both say the API reference is configured by editing `src/config/api-reference.mjs` (the README adds "Replace `public/openapi.yaml`") — still true, and neither mentions `specUrl`. Expected: no edit needed. If either names `specUrl` or says the document must be in `public/`, fix that sentence to match the hosted page's three cases and include the file in the commit below.

- [ ] **Step 5: Run the repo-wide checks**

From the **repo root**:

Run: `npm run check`
Expected: passes — `check:shipped` finds no monorepo path in the wiki edit, `template:check` and `docs:check` are clean. If `docs:check` fails on missing modules, run `npm --prefix apps/docs ci` once and retry. If `check:shipped` flags a path, it prints the file and line; the text above names only paths that exist in a customer's copy, so a hit means a typo.

Run: `npm --prefix apps/docs run build`
Expected: builds; the Internals section renders the updated wiki page and the API reference page renders the new section.

- [ ] **Step 6: Commit**

From the repo root:

```bash
git add apps/docs/src/content/docs/api-reference.md apps/docs/src/content/docs/removing-features.md packages/template/wiki/api-reference.md
git commit -m "docs: where an OpenAPI document can live, and how each case is served

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Verify the two unshipped paths against a real remote document

**Files:**
- Temporarily modify (then revert, never commit): `packages/template/src/config/api-reference.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: confidence. `npm test` only exercises the shipped `public/` configuration; this task is the only end-to-end run of rules 2 and 4 with a real network fetch.

- [ ] **Step 1: Snapshot a public remote document**

In `packages/template/src/config/api-reference.mjs`, change the `admin` entry's `spec` to:

```js
		spec: 'https://petstore3.swagger.io/api/v3/openapi.json',
```

(leave `serve` unset — snapshot is the default). Then, in `packages/template`:

```bash
npm run build 2>&1 | tee /tmp/api-spec-snapshot.log | grep -i "api-spec\|openapi-sidebar\|error"
```

Expected: the log shows `/api-spec/admin.json` being generated, no `[openapi-sidebar]` warning, and exit 0. Then:

```bash
ls dist/client/api-spec/ && head -c 200 dist/client/api-spec/admin.json && echo && grep -o '/api-spec/admin.json' dist/client/api/admin/index.html | head -1
```

Expected: `admin.json` exists; it begins with `{` and its first lines carry `"openapi"` with a `3.0.x` version in **the upstream's own formatting** (Petstore serves pretty-printed JSON with a space before each colon — seeing that spacing is the proof the raw bytes were emitted, not a re-serialised copy); and the admin page's HTML references `/api-spec/admin.json`.

- [ ] **Step 2: See it render, and the sidebar for a `docs`-layout remote reference**

Change the `admin` entry's `layout` to `'docs'` for this step only (so the generated operation sidebar is on screen), rebuild, then:

```bash
npm run preview
```

Open `http://localhost:4321/api/admin/` in a browser. Expected: Scalar renders the Petstore API; the Starlight sidebar's "Admin API" group expands to tags (`pet`, `store`, `user`) with method badges; clicking an operation scrolls the reference to it; the site search for "Add a new pet" returns a result under Admin API that lands on that operation (search indexes operation summaries, not `operationId`s). The Network panel shows the document loaded from `/api-spec/admin.json` on this origin.

- [ ] **Step 3: Live mode**

Add `serve: 'live',` to the same entry, rebuild, `npm run preview`, reload `/api/admin/`.

Expected: identical sidebar and search (built from the same fetch); the Network panel now shows the document loaded from `petstore3.swagger.io` directly; `dist/client/api-spec/` no longer contains `admin.json`.

- [ ] **Step 4: The two hard failures**

Set `spec` to `'https://petstore3.swagger.io/api/v3/does-not-exist.json'` with `serve` removed, and run `npm run build`.

Expected: the build **fails**; the error names the URL, `HTTP 404`, reference `"admin"`, and `Nothing to serve at /api-spec/admin.json; the reference would render blank.` Preceded by one `[openapi-sidebar] Could not fetch …` warning — expected, per the spec.

Set `spec` to `'../nope/openapi.yaml'` and rebuild. Expected: fails with `Could not read "../nope/openapi.yaml"` and the same `Nothing to serve` sentence.

- [ ] **Step 5: Revert — nothing from this task is committed**

```bash
git checkout -- src/config/api-reference.mjs
git status --short
```

Expected: clean. Then `npm test` once more to confirm the shipped configuration still builds and passes.

---

### Task 7: Release notes and version

**Files:**
- Modify: `packages/template/CHANGELOG.md:11` (insert a `2.4.0` section above `## 2.3.0`)
- Modify: `packages/template/package.json`, `packages/template/package-lock.json` (version, via `npm version`)

**Interfaces:**
- Consumes: the customer-facing vocabulary from Task 5.
- Produces: the `2.4.0` release commit, matching the `chore: release 2.3.0` precedent.

This task assumes the change ships as its own minor version. If it is being folded into a larger release, skip the version bump and add the CHANGELOG section under that release's heading instead.

- [ ] **Step 1: Write the changelog entry**

In `packages/template/CHANGELOG.md`, insert directly above `## 2.3.0`:

````md
## 2.4.0

### One field says where your OpenAPI document is

Each API reference used to carry two fields for one document — `spec`, a path
the build read to generate the sidebar, and `specUrl`, the address the reader's
browser fetched — and they accepted different kinds of value. Only a file in
`public/` satisfied both. A remote URL built green but lost the operation
sidebar and dropped out of search; a file elsewhere in your repository filled
the sidebar and rendered a blank page.

Now `spec` is the only field, and it takes a path or an `https://` URL:

```js
spec: './public/openapi.yaml', // bundled, as before
spec: '../api/openapi.yaml', // elsewhere in your repo — served for you at /api-spec/
spec: 'https://api.example.com/openapi.yaml', // remote — fetched at build time
```

The browser URL is derived, so the two can no longer disagree. A remote
document gets the same generated sidebar and search entries as a bundled one,
and an optional `serve` chooses how readers load it: `'snapshot'` (the default)
serves the copy the build fetched from your own site — no CORS setup, and
nothing goes blank when the API host is down — while `'live'` has the browser
fetch the URL directly so the reference is always current.

If the build is responsible for serving a document and can't obtain it — a
snapshot URL that's unreachable, a file that isn't there — the build now fails
naming the source and the reason, rather than shipping a blank reference. A
remote fetch is capped at 30 seconds.

**Upgrading:** an entry that still sets `specUrl` keeps working unchanged; the
value is used as-is. See
[API reference](https://documentation-ekline-docs-template.vercel.app/api-reference/)
for the three cases.

````

- [ ] **Step 2: Bump the version**

In `packages/template`:

```bash
npm version 2.4.0 --no-git-tag-version
git diff --stat
```

Expected: `package.json` and `package-lock.json` each change their own `"version"` fields (two lines in the lockfile: the root and the `""` package entry). No other lockfile changes.

- [ ] **Step 3: Final full run**

In `packages/template`: `npm run check && npm test`. From the repo root: `npm run check`. Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: release 2.4.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
