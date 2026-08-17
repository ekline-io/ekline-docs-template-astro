# API reference

The API reference at `/api/` is rendered by [Scalar](https://scalar.com/) through its official Astro integration, [`@scalar/astro`](https://scalar.com/products/api-references/integrations/astro). Scalar draws the whole reference — navigation, schemas, and a built-in client for sending real requests — from a single OpenAPI document.

## Swap in your own spec

Replace `public/openapi.yaml` with your own OpenAPI document. That is the only required change.

The file ships from `public/`, so it is served unprocessed at `/openapi.yaml` and Scalar fetches it in the browser. To rename it, or point at a spec you host elsewhere, update the `url` in `src/components/ScalarApiReference.astro`:

```astro
<ScalarComponent
  renderMode="client"
  configuration={{ url: 'https://api.example.com/openapi.json', ... }}
/>
```

JSON works as well as YAML, and both OpenAPI 3.0 and 3.1 are supported.

The placeholder spec is deliberately dense — multiple auth schemes, discriminated unions, webhooks, callbacks, multipart upload, cursor pagination, and RFC 9457 problem responses — so you can see how Scalar renders each construct before replacing it.

> A test asserts that the document is emitted and that each route actually references it. Without that, renaming the file still produces a clean build and only 404s once a visitor loads the page.

## Operations in the docs sidebar

The sidebar group under **API reference** is generated from your OpenAPI document at build time: one collapsible group per tag, one link per operation and webhook, each badged with its HTTP method. Replace `public/openapi.yaml` and it regenerates — there is nothing to maintain in `astro.config.mjs`.

Because Starlight's sidebar is global, those links are present on every page, so a reader on a guide can jump straight to an endpoint instead of finding the reference first and searching inside it.

The highlight follows the reader: clicking an operation, deep-linking to one, or simply scrolling past it moves the sidebar's active row, because Scalar keeps the URL hash in step with the section in view.

The generator lives in [`src/lib/openapi-sidebar.mjs`](../src/lib/openapi-sidebar.mjs). Two details matter if you touch it:

- **It uses Scalar's own navigation builder** (`createNavigation` from `@scalar/workspace-store`) rather than deriving anchors itself. Each link is an anchor into the rendered reference, so its hash must match the ID Scalar assigns — including how it slugifies tags and strips punctuation from webhook names (`payment.succeeded` becomes `paymentsucceeded`, the dot dropped rather than hyphenated). Sharing Scalar's builder means both sides move together on `npm update` instead of drifting apart silently. A test pins four representative anchors so a change fails the build rather than leaving links that scroll nowhere.
- **It never fails the build.** A missing, malformed, or empty spec degrades to a single link to the reference plus a warning on stderr.

## Two layouts

| Route | Chrome | Operation navigation |
| --- | --- | --- |
| `/api/embedded/` | Full Starlight page | Starlight's sidebar — shared with the rest of the docs |
| `/api/` | Starlight header only (`splash` template) | Scalar's own sidebar, plus its operation search |

**`/api/embedded/` is the better default for most sites.** The docs and the API share one navigation tree, so the reference reads as part of the documentation rather than a separate destination, and there is no second sidebar competing with Starlight's.

`/api/` is worth keeping if your spec is very large or you want Scalar's search over operations: Scalar owns the full width there, and its sidebar is virtualised, which handles hundreds of operations more gracefully than a fully-expanded Starlight tree.

**To ship only one**, delete the other route file and its entry in `astro.config.mjs`. If you drop `/api/embedded/`, also point `openApiSidebarGroup`'s `base` at `/api/` — the generated links follow whichever route you keep.

## Things worth knowing before you change the component

`src/components/ScalarApiReference.astro` holds the shared configuration. Each decision below has a comment in the file explaining it; these are the ones most likely to bite.

### `renderMode="client"` is required

This template mounts `<ClientRouter />` for view transitions. Scalar's default `static` mode pre-renders a document whose bootstrap script only runs on a hard page load, so the reference would be **blank after any in-site navigation** until the visitor refreshed. Client mode remounts around Astro's navigation events. Do not remove it while view transitions are on.

### The AI assistant is off by default

Scalar's "Ask AI" button uploads your OpenAPI document to Scalar's servers and asks the reader to accept Scalar's terms. That is not a decision a template should make for you, so it ships disabled via `agent: { disabled: true }`. Delete that line to enable it. Doing so also restores the "Generate MCP" button, which is part of the same feature.

### Dark mode is bridged, not automatic

Scalar's `darkMode` option only seeds the initial state. Starlight's toggle writes `data-theme` on `<html>`, so a small observer in the component mirrors that onto Scalar's root classes. Without it the two halves of the page disagree the moment someone touches the toggle.

### Theming goes through `--scalar-*`, not element selectors

The component maps Scalar's documented custom properties onto Starlight's `--sl-color-*` props, so retheming the site in `src/styles/global.css` carries into the reference for free. Scalar's internal class names are not a stable API — don't style against them.

Light mode also pins four colours to accessible values. Scalar's stock method-badge and syntax colours land between 2.9:1 and 4.35:1 against the panel fill, under the 4.5:1 minimum for small text; the replacements clear 4.5:1 with the hue unchanged, so blue-GET / green-POST still reads correctly.

### Search

Each layout shows exactly one search field. On `/api/` that is Scalar's, because it finds operations — Pagefind indexes only the prose pages and cannot see a reference that renders in the browser. Starlight's search stays reachable on <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd>; only its button is hidden. Scalar's is on <kbd>⌘J</kbd> / <kbd>Ctrl+J</kbd> so the two don't collide.

## Astro 6 and peer dependencies

`@scalar/astro` currently declares `peerDependencies: { astro: "^4 || ^5" }`, so a plain `npm install` on this Astro 6 template fails with `ERESOLVE`. `package.json` resolves it:

```json
"overrides": {
  "@scalar/astro": { "astro": "$astro" }
}
```

This pins the integration to whatever Astro version the project already uses, so `npm install` works with no extra flags. Remove the override once Scalar widens the range — nothing else depends on it.
