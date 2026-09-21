# API reference

> This is the maintainer-facing deep end: constraints for whoever edits the API-reference code next. For how to configure and customize the API reference as a customer, see the hosted docs' [API reference](https://potluck.ekline.io/api-reference/) and [Customizing the API reference](https://potluck.ekline.io/api-reference-appearance/) pages.

API references are rendered by [Scalar](https://scalar.com/) through its official Astro integration, [`@scalar/astro`](https://scalar.com/products/api-references/integrations/astro).

Every reference is declared in **[`src/config/api-reference.mjs`](../src/config/api-reference.mjs)** — its document, its slug, its layout, what it is called. The routes, the sidebar, and the search index are all derived from that list.

## Where the document comes from

`spec` takes a path or an `http(s)://` URL. Three things consume it through
`loadSource()` in `src/lib/openapi-sidebar.mjs`: the sidebar generator, the
search index, and — when the site has to serve the document itself — the
endpoint at `src/pages/api-spec/[file].js`. Only two of those three actually
share a read or fetch. `astro.config.mjs`, which builds the sidebar, runs in
the Astro config loader's own module registry; the search index and the
endpoint both run from the page build's Rollup-bundled SSR copy. Those are two
separate instances of `loadSource()` with two separate memoisation caches, so
the search index and the endpoint share one read or fetch and **the sidebar
always performs its own**, in addition. For a remote document that is two HTTP
requests per build, not one — the 30-second fetch timeout is a per-request
cap, so the worst case across a build is 60 seconds of stall, not 30. It also
means that under `serve: 'snapshot'` against a document that changes between
those two requests, the sidebar can be built from one version while the
snapshot the endpoint emits is a different one. The memoisation is still
useful where it applies: the search index and the endpoint genuinely make one
request between them rather than two, and a failed read or fetch is dropped
from the cache so a dev server can retry once the customer fixes the path or
the host comes back.

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
30 seconds so a hung host cannot hang a build. The sidebar and search index each emit a warning
before the endpoint's error in a rule-4 failure — two redundant lines, in
exchange for the generator staying ignorant of serve modes.

External file `$ref`s (`./schemas/pet.yaml`) do not resolve — `dereference`
reports `EXTERNAL_REFERENCE_NOT_FOUND` — for bundled and remote documents
alike. Tags and operations live in the root document, so the sidebar is
unaffected. Pre-existing; noted so it is not mistaken for a regression.

JSON works as well as YAML, and Swagger 2.0 and OpenAPI 3.0 documents are
upgraded to 3.1 automatically.

## Two references, two layouts

The template ships **two** example APIs, each demonstrating one layout:

| Reference | `slug` | Route | Layout | Navigation |
| --- | --- | --- | --- | --- |
| Example Payments API | `''` | `/api/` | `docs` | Starlight's sidebar, shared with the rest of the docs |
| Example Admin API | `'admin'` | `/api/admin/` | `full` | Scalar's own sidebar, full width |
| Petstore API (remote) | `'petstore'` | `/api/petstore/` | `docs` | Starlight's sidebar, generated from a document fetched over the network |

References are addressed by **`slug`, not a full path** — every route this template builds lives under `/api/`, because that is where the route file is. An empty slug is `/api/` itself. `routeFor()` turns a slug into the one URL the page, the sidebar and the search index all use, so those three cannot end up disagreeing. Two references sharing a slug fails the build rather than silently making one unreachable.

The third is the odd one out, and deliberately so: its `spec` is a URL rather
than a file, so it demonstrates that a document you do not host produces the
same generated operation sidebar and the same search entries as a bundled one.
It is `serve: 'live'`, not the default `'snapshot'`, because a snapshot the
build cannot fetch fails that build — correct for a real API, wrong for an
example that would otherwise break the first build of anyone working offline.
It is also the only thing in the shipped configuration that touches the
network, so deleting it is what makes a build hermetic again.

**`docs` is the right default for most sites.** The API and the prose share one navigation tree, so the reference reads as part of the documentation rather than a separate destination. Every operation appears in the sidebar, generated from the document, and is reachable from any page in the site.

**`full`** hands the whole width to Scalar. Worth it for large documents: Scalar's sidebar is virtualised, so it stays responsive where a fully expanded Starlight tree would not.

There is deliberately **no control for switching between layouts**. That would be meta-UI about the documentation rather than documentation, and it is not something to ship to readers. Two real APIs make the same point and leave you with something to keep.

### Keeping one

Delete the entry you do not want from `apiReferences`, and delete its file from `public/`. Its route, sidebar entries and search entries go with it. The placeholder specs are examples — you are expected to remove at least one.

Keeping both is also fine. Plenty of products document more than one API, and the list exists for exactly that.

### Changing a layout rather than removing one

Set `layout` to `'docs'` or `'full'` on the reference. Nothing else changes — the sidebar switches between an operation list and a plain link on its own, because a `full` route already has Scalar's sidebar and a second copy in Starlight's would be two navigation trees for one document.

## How the pieces fit

Starlight renders the page, Scalar renders the document in the browser, and a few small bridges keep them agreeing. Each has a comment in the source explaining it; these are the ones most likely to bite.

### `renderMode="client"` is required

This template mounts `<ClientRouter />` for view transitions. Scalar's default `static` mode pre-renders a document whose bootstrap script only runs on a hard page load, so the reference would be **blank after any in-site navigation** until the visitor refreshed. Do not remove it while view transitions are on.

### The sidebar's operation list is generated

`src/lib/openapi-sidebar.mjs` builds it from the document using **Scalar's own navigation builder** (`createNavigation` from `@scalar/workspace-store`), not a hand-rolled one. Each link is an anchor into the rendered reference, so its hash must match the ID Scalar assigns — including how it slugifies tags and strips punctuation from webhook names (`payment.succeeded` becomes `paymentsucceeded`, the dot dropped rather than hyphenated). Sharing Scalar's builder means both sides move together on `npm update`.

Generated only for `docs`-layout references — a `full` one already has Scalar's sidebar.

Four representative anchors are pinned in `tests/scalar-api-reference.test.mjs`. If a Scalar upgrade changes the scheme, that test fails rather than leaving links that render and scroll nowhere.

The generator never fails the build: a missing, malformed, or untagged document degrades to a plain link to the reference plus a warning on stderr.

### Search covers the API

Pagefind indexes the HTML a page ships, and Scalar renders everything in the browser — so out of the box the reference is invisible to search. `ApiSearchIndex.astro` emits one server-rendered heading per operation, whose `id` is the anchor Scalar uses, giving Pagefind real content to index and letting results link straight to an operation.

Each reference is indexed under its own route, so searching for one of its operations lands the reader on the page that renders it.

Scalar's own search is switched off everywhere. Two search fields — one for prose, one for the reference, neither labelled — makes the reader guess.

### Theme

The component maps Scalar's documented `--scalar-*` custom properties onto Starlight's `--sl-color-*` props, so retheming the site in `src/styles/global.css` carries into the reference. Scalar's internal class names are not a stable API — don't style against them.

Two things need active bridging:

- **The toggle.** Scalar's `darkMode` option only seeds the initial state, so an observer mirrors Starlight's `data-theme` onto Scalar's classes — including on `<body>`, which Scalar also themes and paints a background from.
- **Light-mode contrast.** Scalar's stock method-badge and syntax colours land between 2.9:1 and 4.35:1 against the panel fill, under the 4.5:1 minimum for small text. The overrides clear 4.5:1 with the hue unchanged, so blue-GET / green-POST still reads.

### Scalar's own product surfaces are off

Scalar ships several controls that make sense on scalar.com and not inside a customer's documentation. All are disabled, and all are one line to restore:

| Surface | Why it is off | Restore |
| --- | --- | --- |
| **Ask AI** | Uploads your OpenAPI document to Scalar's servers and asks the reader to accept Scalar's terms | delete `agent: { disabled: true }` |
| **Open API Client** | Opens scalar.com's hosted client in a new tab; the URL carries `utm_source` / `utm_medium` / `utm_campaign` | set `hideClientButton: false` |
| **Powered by Scalar** | Two links out to scalar.com, in the sidebar footer and the client's empty state | delete the `a[href*='scalar.com']` rule in `ScalarApiReference.astro` |
| **Developer Tools / Configure / Share / Deploy** | Scalar's platform toolbar; shows on localhost by default, so a customer sees it exactly while evaluating the template | set `showToolbar` / `showDeveloperTools` back to their defaults |

Turning off Ask AI also removes the "Generate MCP" button, which is part of the same feature. The embedded API client stays — "Test Request" still opens it in place, which is the part readers actually want.

Scalar is MIT licensed. That requires the copyright notice to travel with the source, which it does; it does not require an attribution badge in rendered output, so removing the "Powered by" links is within the licence.

## Tests

| Command | What it covers |
| --- | --- |
| `npm run check` | Types, via `astro check`. |
| `npm test` | Build output: routes exist, the document is emitted and referenced, anchors match Scalar's scheme, the agent is disabled. No browser needed. |
| `npm run test:visual` | The bridges, in a real browser: theme parity in both modes, each reference rendering its own document, search resolving to the right route, the sidebar's active row, the client overlay covering the page, mobile overflow, plus a screenshot of the generated sidebar. |
| `npm run test:visual:ci` | An alias for the above, kept as a stable name to point CI at. |

### What runs automatically

Nothing, until you wire it up — no CI configuration ships with your copy. The template's own [CI workflow](https://github.com/ekline-io/potluck-docs/blob/main/.github/workflows/ci.yml) runs `npm run check`, `npm test`, and `npm run test:visual:ci` — the whole browser suite, screenshots included — on every pull request and on pushes to `main`; that file lives at the template repository's root, so it did not travel with the directory. It is a reasonable set to copy. Separately, the Vercel build runs `npm test` (`buildCommand` in `vercel.json`), so once you deploy there, a failure blocks the deploy.

The browser tests matter most. Every integration bug this reference has had — a blank reference after client-side navigation, white seams in dark mode, the API client rendering underneath the sidebar, method badges coming out white-on-white — produced a page that **built perfectly**. `npm test` reads build output and cannot see paint order, theme classes, or scroll behaviour. Only the browser suite can.


Visual tests need a browser: `npx playwright install chromium`. They run serially and retry once — the reference loads Scalar's bundle from a CDN, and a cold fetch is slow enough to trip a timeout on an otherwise healthy run.

**Screenshot baselines are per-platform.** Font rendering differs between macOS and Linux, so `tests/visual/__screenshots__/` is split by platform. `darwin/` and `linux/` are both committed, which is what lets the same suite run on a Mac and on a Linux CI runner. A platform with no committed baseline fails on its first run — that is Playwright refusing to invent a comparison, not a regression.

To replace or add one, run `npm run test:visual:update` on a machine or container of that platform and commit what it writes. For Linux, the Playwright project publishes an image per release; use the tag matching your `@playwright/test` version, and pin the architecture your CI runner uses — a baseline generated for the wrong one is a baseline CI can never match:

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD:/work" -v docs-template-node-modules:/work/node_modules \
  -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc 'npm ci && npm run test:visual:update'
```

The named volume is not optional on macOS: a `node_modules` installed there holds Darwin binaries that cannot run on Linux, and letting the container install over it leaves your host copy unusable.

**Never let CI write a missing baseline.** A runner's filesystem is thrown away, so every run would compare against a file it had produced moments earlier and pass whatever the page looked like.

## Astro 6 and peer dependencies

`@scalar/astro` currently declares `peerDependencies: { astro: "^4 || ^5" }`, so a plain `npm install` on this Astro 6 template fails with `ERESOLVE`. `package.json` resolves it:

```json
"overrides": {
  "@scalar/astro": { "astro": "$astro" }
}
```

This pins the integration to whatever Astro version the project already uses, so `npm install` works with no extra flags. Remove the override once Scalar widens the range.
