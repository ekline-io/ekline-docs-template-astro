# API spec sources: bundled, on disk, or a remote URL

**Date:** 2026-09-09
**Status:** Approved design, pending implementation plan

## Problem

A customer's OpenAPI document can live in one of three places:

1. **Bundled with the site** — a file in `public/`, what the template ships.
2. **Elsewhere on disk** — a spec that already exists in their repository
   (a monorepo's `api/openapi.yaml`, a generated file under `build/`) that
   they do not want to duplicate into `public/`.
3. **At a remote URL** — served by the API itself, a spec registry, or a CI
   artifact.

Today each reference in `src/config/api-reference.mjs` carries two fields for
one document, and they accept *disjoint* kinds of value:

| Field | Consumed by | Accepts |
| --- | --- | --- |
| `spec` | `readFile` at build time, to generate the sidebar and the search index | a filesystem path only |
| `specUrl` | Scalar in the browser, at runtime | a URL the deployed site can serve |

So only case 1 works. Verified against the shipped code on 2026-09-09:

| Source | `spec` (build) | `specUrl` (runtime) | What the customer sees |
| --- | --- | --- | --- |
| `./public/openapi.yaml` | works | works | the only case that fully works |
| `https://…/openapi.yaml` | `ENOENT` | works, if the host sends CORS headers | the reference renders, but the sidebar collapses to one link and **the API vanishes from search** |
| `../api/openapi.yaml` | works | 404 | the sidebar populates and **the page renders blank** |

The failures are near-silent. The sidebar generator warns on stderr and
degrades by design — a typo in a customer's document must not kill their
first build — so a remote spec loses search with a green build and one line
nobody reads. The hosted docs describe the two fields but never say they take
different kinds of value.

## Decisions made during design

| Decision | Choice |
| --- | --- |
| Config shape | One required field, `spec`, that takes a path *or* a URL. The browser URL is derived from it, so the two cannot disagree. |
| Remote specs at runtime | Chosen per reference with `serve: 'snapshot' \| 'live'`. Default `snapshot`. |
| Sidebar and search for remote specs | Generated at build time from a fetched copy, identical to a bundled spec, in **both** serve modes. |
| Failure policy | If the template is responsible for serving the document and cannot obtain it, **the build fails**. Otherwise it warns and degrades, as today. |
| Backwards compatibility | An explicit `specUrl` still wins, verbatim. No existing site changes on upgrade. |
| Serving off-`public` documents | A prerendered Astro endpoint, `src/pages/api-spec/[file].js`, emits the raw document into the build output. |
| What is emitted | The raw bytes as read or fetched — not the normalized, dereferenced copy. |

Approaches rejected:

- **Keep both fields, only teach `spec` to fetch.** Fixes the search
  regression for remote specs but leaves every customer maintaining two
  spellings of one path, and does nothing for a document elsewhere on disk.
- **Snapshot only, or live only.** Each is right for someone. A registry that
  updates hourly wants live; an internal API behind a firewall wants
  snapshot, because readers' browsers cannot reach it and the build machine
  can. The per-reference flag costs one optional field.
- **An Astro integration hook that copies files into the output directory.**
  More machinery than an endpoint, and the output directory differs by
  adapter (`dist/client/` under Node, `.vercel/output/static/` under Vercel —
  the reason `tests/helpers/static-dir.mjs` exists). A prerendered endpoint is
  adapter-agnostic: Astro puts it wherever static assets go.

## Configuration

As shipped — a bundled document, and the only field about it you must set:

```js
{
	id: 'payments',
	enabled: true,
	slug: '',
	layout: 'docs',

	/**
	 * Where the document is. A path relative to the project root, or an
	 * `http(s)://` URL.
	 */
	spec: './public/openapi.yaml',

	label: 'API reference',
	title: 'API reference',
	description: '…',
}
```

A remote document adds one optional field:

```js
{
	id: 'payments',
	spec: 'https://api.example.com/openapi.yaml',

	/**
	 * How a remote document reaches the reader's browser. Only meaningful
	 * when `spec` is a URL.
	 *
	 *   'snapshot' — (default) the build fetches it once and serves the copy
	 *                from this site. No CORS requirement on the API host, and
	 *                the reference cannot render blank because the host was
	 *                down. Updates when you rebuild.
	 *   'live'     — the reader's browser fetches the URL directly, so the
	 *                reference always shows the current document. The host
	 *                must allow cross-origin requests from this site.
	 */
	serve: 'snapshot',
	// …
}
```

A document elsewhere on disk needs nothing beyond `spec: '../api/openapi.yaml'`.

`specUrl` is no longer documented on the shipped entries. It remains accepted
as an override: when present it is used verbatim as the browser URL and no
document is emitted for that reference. This keeps every existing customer's
config working unchanged and leaves an escape hatch for anything the
derivation does not cover.

### How the browser URL is derived

`specUrlFor(reference)`, exported from `api-reference.mjs` beside `routeFor`,
applies these rules in order:

| # | Condition | Browser URL | Emitted? |
| --- | --- | --- | --- |
| 1 | `specUrl` is set | that value, verbatim | no |
| 2 | `spec` is a URL and `serve` is `'live'` | the URL itself | no |
| 3 | `spec` is a path under `public/` | the path with the `public/` prefix stripped, e.g. `./public/openapi.yaml` → `/openapi.yaml` | no — Astro already serves `public/` |
| 4 | anything else — a URL with `serve: 'snapshot'`, or a path outside `public/` | `/api-spec/<id>.<ext>` | yes |

"Under `public/`" matches `public/x`, `./public/x` and nested paths, with
`/` as the separator; the config is written in POSIX form on every platform,
as it is today.

`<ext>` is `.json` when the source path or URL ends in `.json`, otherwise
`.yaml`. Scalar sniffs the content, so an extensionless URL serving JSON
still renders; the extension exists so the "Download OpenAPI Document" link
hands readers a sensibly named file.

A URL is anything matching `/^https?:\/\//i`. Nothing else is treated as
remote.

### Validation, at config load

Alongside the existing duplicate-slug check, evaluated once when the module
loads so it fails `astro build` and `astro dev` before anything renders:

- `serve: 'live'` on a `spec` that is a path throws:
  `[api-reference] "<id>" sets serve: 'live' but its spec is a file, not a URL. Remove serve, or point spec at the URL the browser should fetch.`
- `serve` set to anything other than `'snapshot'`, `'live'` or `undefined`
  throws, naming the value and the two accepted ones.
- Two enabled references deriving the same emitted path is impossible while
  the path is keyed by `id`; two references sharing an `id` is already a
  mistake the duplicate-slug check does not catch, so add an `id` uniqueness
  check next to it.

## Reading the document at build time

`src/lib/openapi-sidebar.mjs` gains an exported `loadSource(spec, { timeoutMs })`
that returns the raw text, memoised per `spec` value exactly as `loadDocument`
is memoised today — the promise, so concurrent callers *within one module
instance* share one read.
`loadDocument` is rebuilt on top of it.

**Correction, post-implementation (verified on a real build):** this does
*not* give the sidebar, the search index and the emit endpoint one shared read
or fetch. `astro.config.mjs`, which builds the sidebar, is evaluated by the
Astro config loader as its own module instance; the search index and the emit
endpoint both run from the page build's Rollup-bundled SSR copy. Those are two
separate instances of this module, each with its own `sourceCache` map — so
the search index and the endpoint share one read or fetch, and the sidebar
always performs a second one. For a remote document that is two HTTP requests
per build, so the 30-second timeout is a per-request cap, not a per-build one,
and under `serve: 'snapshot'` there is a window where the sidebar was built
from one version of a fast-moving document and the emitted snapshot is
another. Consolidating the two module instances' reads is out of scope for
this fix — it would change how `astro.config.mjs` builds the sidebar — so this
stays two reads by design for now; a future change that wants one read has to
solve the module-instance split first, not just memoisation.

- A path is read with `readFile`, as today.
- A URL is fetched with `fetch(url, { signal: AbortSignal.timeout(timeoutMs) })`,
  `timeoutMs` defaulting to `30_000`. A non-2xx response is an error carrying
  the status; a timeout is an error saying so. A hung API host must not hang
  a customer's build indefinitely. The option exists so the test can use a
  short timeout; the sidebar, search index and endpoint all use the default.
- No credentials, headers or redirects beyond `fetch`'s defaults. Documents
  behind authentication are out of scope; the `specUrl` override is the
  escape hatch.

The rest of the pipeline — `normalize`, `upgrade`, `dereference`,
`createNavigation` — is unchanged, so the sidebar and search entries for a
fetched document are byte-identical to those for the same document on disk.
Verified on 2026-09-09 by running the shipped `openapi.yaml` through both
paths: same 7 tags, 35 entries, and anchor IDs.

External file `$ref`s (`./schemas/pet.yaml`) do not resolve today for a
bundled document either — `dereference` reports
`EXTERNAL_REFERENCE_NOT_FOUND` — and they resolve no better or worse for a
fetched one. Tags and operations live in the root document, so the sidebar is
unaffected. Not in scope; noted so it is not mistaken for a regression.

## Serving the document

`src/pages/api-spec/[file].js` — a static endpoint, JavaScript with JSDoc
like the config and the lib so `node --test` can import it without a
TypeScript loader.

- `getStaticPaths()` returns one path per entry in `emittedReferences`, with
  `params.file` set to `<id>.<ext>` and `props` carrying the reference.
- `GET` calls `loadSource(reference.spec)` and returns its text with
  `Content-Type: application/json` for `.json`, `application/yaml`
  otherwise.
- It is prerendered, which is the project default: the endpoint emits a real
  file into the static output, served from the CDN on Vercel and from disk
  under the Node adapter, exactly like a file in `public/`. The private-docs
  middleware only runs for on-demand routes and never sees it.

When the shipped config has no rule-4 references — as shipped, both examples
live in `public/` — `getStaticPaths` returns an empty array and Astro emits
nothing. A customer who deletes the API reference entirely deletes this file
along with the others listed in the hosted "Removing features" page.

## Failure policy

One rule: **the build fails when the template is responsible for serving a
document it cannot obtain.** Everything else keeps today's warn-and-degrade
behaviour.

| Case | Document unobtainable at build | Result |
| --- | --- | --- |
| Path under `public/`, missing | today's behaviour | warning; sidebar is a plain link, search skips the API; the page 404s on its document at runtime, as it does now |
| URL, `serve: 'live'` | fetch fails or times out | warning naming the URL and both consequences (no operation sidebar, not searchable); the page still works wherever the reader's browser can reach the host |
| URL, `serve: 'snapshot'` | fetch fails or times out | **build fails** — the endpoint's `GET` throws with the URL, the underlying error, and the sentence "Nothing to serve at `/api-spec/…`; the reference would render blank." |
| Path outside `public/`, missing | `readFile` fails | **build fails**, same message shape |

Rationale for the two hard failures: the warn-and-degrade contract exists so
a typo *inside* a document costs some sidebar entries, not a build. Here the
document is entirely absent and the outcome is a blank reference page, and
"your spec URL is unreachable" is worth hearing at build time rather than
from a reader.

Warnings from the sidebar generator and search index still fire for these references before the
endpoint throws, because `astro.config.mjs` builds the sidebar first. The
build output is then two warnings followed by the fatal error; the error is
the one that names the fix. Acceptable — keeping the generator ignorant of
serve modes is worth redundant lines.

The generator's existing warning is reworded to name the consequence for
remote documents in one place:
`[openapi-sidebar] Could not fetch "<url>": <error>. The reference is still linked, but has no operation sidebar and is not searchable. The build machine must be able to reach this URL.`

## Changes, by file

`packages/template/`:

- `src/config/api-reference.mjs` — `serve` on both shipped entries is
  **omitted** (they are paths; the field would be noise); `specUrl` removed
  from both. Three new exports: `isRemoteSpec(spec)` (the URL regex),
  `specUrlFor(reference)` (the four rules), and `emittedReferences` (the
  enabled references that land on rule 4, so the endpoint and the tests
  agree on the set). `serve` and `id` validation beside the slug check.
  Header comment rewritten to describe the three sources.
- `src/lib/openapi-sidebar.mjs` — exported `loadSource`, URL branch, timeout,
  reworded warnings. `openApiOperations` and `openApiSidebarGroup`
  signatures unchanged.
- `src/pages/api-spec/[file].js` — new.
- `src/pages/api/[...reference].astro` — passes `specUrlFor(reference)` to
  the Scalar component. `ApiSearchIndex` keeps taking `reference.spec`.
- `src/components/ScalarApiReference.astro` — the `url` prop's doc comment no
  longer claims the document is always under `public/`. No behavioural
  change.
- `tests/openapi-sidebar.test.mjs` — a local `http.createServer` serves the
  shipped spec; assert the group equals the disk-read group. Unreachable URL
  (a closed port on `127.0.0.1`, so it fails fast) degrades to the fallback
  link. A 500 degrades. `loadSource` with a short `timeoutMs` against a
  server that never responds rejects with the timeout error.
- `tests/api-reference-config.test.mjs` — new; one case per derivation rule,
  the two validation errors, `specUrl` override precedence, extension
  choice.
- `tests/api-spec-endpoint.test.mjs` — new; imports the endpoint,
  `getStaticPaths` is empty for the shipped config, `GET` returns the raw
  text and the right content type for a temp file outside `public/`, `GET`
  throws the named error for a missing file and for an unreachable snapshot
  URL.
- `tests/scalar-api-reference.test.mjs` — `specFor` and the "points at its
  own document" assertion use `specUrlFor(reference)`; the "emitted as a
  static asset" test skips any reference whose browser URL is absolute
  (`isRemoteSpec(specUrlFor(reference))`), since there is nothing in the
  build output to check for it.
- `tests/visual/api-reference.spec.mjs` — no change; both shipped references
  stay in `public/`.
- `wiki/api-reference.md` — "Swap in your own spec" becomes "Where the
  document comes from": the derivation table, the failure rule, that the
  emitted bytes are raw, which two of the three consumers actually share a
  fetch (the search index and the endpoint — not the sidebar, per the
  correction above), and the pre-existing external-`$ref` limitation.
- `CHANGELOG.md` — a `2.4.0` entry, customer-facing: one field instead of
  two, the three places a document can live, `snapshot` versus `live`, and
  that an existing `specUrl` keeps working.
- `package.json`, `package-lock.json` — version `2.4.0`.
- `CLAUDE.md` line 77 and `README.md` line 87 — re-read; likely unchanged,
  both already say "edit `src/config/api-reference.mjs`".

`apps/docs/`:

- `src/content/docs/api-reference.md` — "Add your document" becomes "Where
  your document lives" with a subsection per source, the `snapshot` / `live`
  table, the note that the build machine must reach a remote URL, a pointer
  to Vercel deploy hooks for rebuilding a snapshot on a schedule, and one
  line on the `specUrl` override for anyone upgrading. Frontmatter
  `description` updated.
- `src/content/docs/removing-features.md` — add `src/pages/api-spec/` and
  the two new test files to the removal table.

Repo root: `npm run check:shipped` must pass after the wiki edit — no
monorepo paths in shipped prose.

## Testing

| Command | Covers |
| --- | --- |
| `node --test tests/openapi-sidebar.test.mjs` | fetch path identical to disk path; every degrade case |
| `node --test tests/api-reference-config.test.mjs` | derivation rules and validation |
| `node --test tests/api-spec-endpoint.test.mjs` | emit and the two hard failures |
| `npm test` (template) | build output still correct for the shipped config |
| `npm run check` (template) | `astro check` passes with the JS endpoint |
| `npm run test:visual:ci` | unchanged, must stay green |
| `npm run check:shipped` (root) | shipped prose names no monorepo path |

Not automated: a build with a real remote URL in each serve mode. The plan
includes a manual verification step for both, run once against a public spec
(e.g. the Petstore example on GitHub) before the PR is opened, with the
resulting sidebar screenshot compared by eye to the bundled one.

## Out of scope

- Authenticated remote documents (headers, tokens). Escape hatch: `specUrl`.
- Resolving external file `$ref`s. Pre-existing, unchanged.
- Automatic rebuilds when a remote document changes. Documented as "use your
  host's deploy hook"; not built.
- A third shipped example reference exercising the remote path. Two examples
  is already one more than a customer keeps.
