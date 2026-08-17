# Changelog

Notable changes to the EkLine docs template. This file is for people adopting
or upgrading the template — it describes what changed for *your* docs site, not
every commit.

The template is something you fork rather than install, so a new version is not
something you upgrade into. Use these notes to decide whether a change is worth
pulling across into a site you have already customised.

## 1.0.0

The first tagged release. The template has been in use before now; this marks
the point where it has a version worth quoting.

### Interactive API references, rendered by Scalar

The headline change. API documentation is rendered by
[Scalar](https://scalar.com/) through its official Astro integration, replacing
the previous `starlight-openapi` setup. Readers get schemas, examples, and a
built-in client that sends real requests without leaving the page.

- **Two example APIs ship, one per layout**, so you can see both before
  choosing: a dense payments API in the `docs` layout at `/api/`, and a wide,
  flat admin API in the full-width layout at `/api/admin/`. Delete whichever you
  do not need — removing its entry from `src/config/api-reference.mjs` takes its
  route, sidebar entries and search entries with it.
- **Every operation appears in the docs sidebar**, generated from your OpenAPI
  document on each build and reachable from any page in the site. Swap the
  document and the sidebar follows; there is nothing to maintain by hand.
- **The site's own search covers the API.** Searching for an endpoint returns
  it and links straight to the operation, rather than only finding the guides
  that mention it.
- **One theme.** The reference takes its colours, fonts and dark mode from
  `src/styles/global.css` like everything else, so retheming the site rethemes
  the reference.
- **Scalar's product surfaces are off by default** — its AI assistant, the
  links out to scalar.com, and the platform toolbar. The AI assistant in
  particular uploads your OpenAPI document to Scalar's servers, which is not a
  default a template should choose for you. Each is one line to restore;
  `wiki/api-reference.md` lists them.

Everything about the references is configured in
[`src/config/api-reference.mjs`](src/config/api-reference.mjs). See
[`wiki/api-reference.md`](wiki/api-reference.md) for the full guide.

### Continuous integration

- `.github/workflows/ci.yml` runs type checking, the build, the output tests and
  the browser tests on every pull request. The Vercel build already ran `npm test`;
  this adds the checks that gated nothing.
- `npm run check` (`astro check`) is now clean and enforced. Getting there meant
  adding `src/env.d.ts`, which types the Starlight virtual modules the Header and
  Search overrides import.
- Browser tests via Playwright: `npm run test:visual`. These cover the parts
  that build cleanly and behave wrongly — theme, search, navigation, and the API
  client's stacking.

### Accessibility

- The footer credit met 2.63:1 in light and 2.35:1 in dark against a 4.5:1
  minimum, on every page. Fixed.
- The API reference's method badges and syntax colours were between 2.9:1 and
  4.35:1 in light mode. Corrected to clear 4.5:1 with the hues unchanged, so the
  blue-GET / green-POST convention still reads.

### Upgrading from the pre-Scalar template

If you have already customised a copy and want the API reference:

1. Remove `starlight-openapi` and its `plugins` entry, and delete
   `src/schemas/api.yaml`.
2. Copy `src/config/api-reference.mjs`, `src/lib/openapi-sidebar.mjs`,
   `src/pages/api/`, and the `ApiSearchIndex` and `ScalarApiReference`
   components.
3. Put your OpenAPI document at `public/openapi.yaml` and point the config at it.
4. Add the `overrides` entry from `package.json` — `@scalar/astro` still
   declares Astro `^4 || ^5` as a peer, so a plain `npm install` fails on Astro 6
   without it.

Nothing outside the API reference changed, so the rest of a customised site
carries over untouched.
