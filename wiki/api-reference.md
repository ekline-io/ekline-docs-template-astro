# API reference

The API reference is rendered by [Scalar](https://scalar.com/) through its official Astro integration, [`@scalar/astro`](https://scalar.com/products/api-references/integrations/astro), from a single OpenAPI document.

Everything about it is declared in **[`src/config/api-reference.mjs`](../src/config/api-reference.mjs)** — the document, which views are built, what they are called. The routes, the sidebar, the search index, and the switcher readers see are all derived from that one object.

## Swap in your own spec

Replace `public/openapi.yaml` with your own document. That is the only required change: the routes, the sidebar's operation list, and the search entries all regenerate on the next build.

To rename it, or point at a spec hosted elsewhere, change both fields in the config together:

```js
spec: './public/openapi.yaml',   // read at build time, to generate the sidebar
specUrl: '/openapi.yaml',        // fetched by the browser, at runtime
```

JSON works as well as YAML, and Swagger 2.0 and OpenAPI 3.0 documents are upgraded to 3.1 automatically.

The placeholder spec is deliberately dense — multiple auth schemes, discriminated unions, webhooks, callbacks, multipart upload, cursor pagination, RFC 9457 problem responses — so you can see how each construct renders before replacing it.

## Two views

| View | Route | Chrome | Operation navigation |
| --- | --- | --- | --- |
| `docs` | `/api/` | Full Starlight page | Starlight's sidebar, shared with the rest of the docs |
| `full` | `/api/full/` | Header only (`splash`) | Scalar's own sidebar |

**`docs` is the default.** The API and the prose share one navigation tree, so the reference reads as part of the documentation rather than a separate destination.

**`full`** hands the whole width to Scalar. Worth keeping for large documents: Scalar's sidebar is virtualised, so it stays responsive where a fully expanded Starlight tree would not.

Readers switch between them with the control above the reference, which carries the current anchor across so they keep their place.

### Shipping only one

Set the other's `enabled: false`. Its route stops being built and the switcher disappears on its own. To change which view is served at `/api/`, move `default: true` — the sidebar and the search index follow automatically.

## How the pieces fit

Starlight renders the page, Scalar renders the document in the browser, and a few small bridges keep them agreeing. Each has a comment in the source explaining it; these are the ones most likely to bite.

### `renderMode="client"` is required

This template mounts `<ClientRouter />` for view transitions. Scalar's default `static` mode pre-renders a document whose bootstrap script only runs on a hard page load, so the reference would be **blank after any in-site navigation** until the visitor refreshed. Do not remove it while view transitions are on.

### The sidebar's operation list is generated

`src/lib/openapi-sidebar.mjs` builds it from the document using **Scalar's own navigation builder** (`createNavigation` from `@scalar/workspace-store`), not a hand-rolled one. Each link is an anchor into the rendered reference, so its hash must match the ID Scalar assigns — including how it slugifies tags and strips punctuation from webhook names (`payment.succeeded` becomes `paymentsucceeded`, the dot dropped rather than hyphenated). Sharing Scalar's builder means both sides move together on `npm update`.

Four representative anchors are pinned in `tests/scalar-api-reference.test.mjs`. If a Scalar upgrade changes the scheme, that test fails rather than leaving links that render and scroll nowhere.

The generator never fails the build: a missing, malformed, or untagged document degrades to a plain link to the reference plus a warning on stderr.

### Search covers the API

Pagefind indexes the HTML a page ships, and Scalar renders everything in the browser — so out of the box the reference is invisible to search. `ApiSearchIndex.astro` emits one server-rendered heading per operation, whose `id` is the anchor Scalar uses, giving Pagefind real content to index and letting results link straight to an operation.

Only the default view is indexed. Both views render the same document, so indexing both would return every operation twice and send readers to whichever layout ranked higher.

Scalar's own search is switched off in both views. Two search fields — one for prose, one for the reference, neither labelled — makes the reader guess.

### Theme

The component maps Scalar's documented `--scalar-*` custom properties onto Starlight's `--sl-color-*` props, so retheming the site in `src/styles/global.css` carries into the reference. Scalar's internal class names are not a stable API — don't style against them.

Two things need active bridging:

- **The toggle.** Scalar's `darkMode` option only seeds the initial state, so an observer mirrors Starlight's `data-theme` onto Scalar's classes — including on `<body>`, which Scalar also themes and paints a background from.
- **Light-mode contrast.** Scalar's stock method-badge and syntax colours land between 2.9:1 and 4.35:1 against the panel fill, under the 4.5:1 minimum for small text. The overrides clear 4.5:1 with the hue unchanged, so blue-GET / green-POST still reads.

### The AI assistant is off

Scalar's "Ask AI" uploads your OpenAPI document to Scalar's servers and asks the reader to accept Scalar's terms. That is not a decision a template should make for you, so it ships disabled via `agent: { disabled: true }`. Delete that line to enable it; doing so also restores the "Generate MCP" button, which is part of the same feature.

## Tests

| Command | What it covers |
| --- | --- |
| `npm test` | Build output: routes exist, the document is emitted and referenced, anchors match Scalar's scheme, the agent is disabled. No browser needed. |
| `npm run test:visual` | The bridges, in a real browser: theme parity in both modes, search returning operations, the sidebar's active row, the switcher preserving position, mobile overflow, plus screenshots of the parts we render ourselves. |

Update screenshots after an intentional visual change with `npm run test:visual:update`, and commit the result.

Visual tests need a browser: `npx playwright install chromium`. They run serially and retry once — the reference loads Scalar's bundle from a CDN, and a cold fetch is slow enough to trip a timeout on an otherwise healthy run.

## Astro 6 and peer dependencies

`@scalar/astro` currently declares `peerDependencies: { astro: "^4 || ^5" }`, so a plain `npm install` on this Astro 6 template fails with `ERESOLVE`. `package.json` resolves it:

```json
"overrides": {
  "@scalar/astro": { "astro": "$astro" }
}
```

This pins the integration to whatever Astro version the project already uses, so `npm install` works with no extra flags. Remove the override once Scalar widens the range.
