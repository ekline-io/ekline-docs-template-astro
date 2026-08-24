# Changelog

Notable changes to the EkLine docs template. This file is for people adopting
or upgrading the template — it describes what changed for *your* docs site, not
every commit.

The template is something you fork rather than install, so a new version is not
something you upgrade into. Use these notes to decide whether a change is worth
pulling across into a site you have already customised.

## 2.2.0

### There is now hosted documentation

<https://documentation-ekline-docs-template.vercel.app>

Configuration guides for everything the template does — branding, navigation,
API references and their two layout modes, the logged-in experience, and a
reference section covering every environment variable and command. The
constraints documents that ship in `wiki/` are published there too, under
*Internals*, so you can read them without a checkout.

The README is shorter as a result. What needed a browser is on the site now;
what you need before you have one — the create command, the commands table,
deployment essentials, and the full removal steps — stays in the README.

### `robots.txt`

Your build now emits one. It points crawlers at your sitemap and keeps them out
of `/private/`, which spares them a walk that only ever returns redirects.

It is generated from `site` rather than shipped as a static file, so it is
correct wherever you deploy without you editing it — including preview
deployments, and including a site built with a `base` path, where the
disallowed prefix follows the base. Until you replace the `https://example.com`
placeholder in `astro.config.mjs`, it deliberately advertises no sitemap at all
rather than pointing crawlers at a domain you do not own.

`Disallow` is not access control — `src/middleware.ts` is, and it answers a
redirect or a 404 to anyone unauthenticated. Delete `src/pages/robots.txt.ts`
if you would rather write your own.

## 2.1.0

### How you create a site from this template has changed

```bash
npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template
```

The GitHub **"Use this template"** button no longer works for this, and the
README no longer suggests it. The template now lives in `packages/template/`
inside a monorepo — that button copies whole repositories, so it would hand you
EkLine's build tooling and its own hosted sites along with the template. The
command above fetches exactly the template directory, lockfile included.

Nothing inside your site changes: the files you receive are byte-for-byte what
the previous version shipped. Only the way you fetch them is different, and
existing sites are unaffected — you already have your copy.

One consequence worth knowing: `npm create astro` strips `CHANGELOG.md` from a
fetched template, so your copy will not include this file. It records the
template's history rather than your site's, and it stays readable in the
repository.

### Demo login

`/demo-login` — a persona picker that plays your product's part in the SSO
handshake, so the logged-in experience can be demonstrated and evaluated with
no real SSO endpoint behind it. Off unless `DOCS_UNSAFE_DEMO_LOGIN=1` *and*
the three `DOCS_*` variables are set; a deployment that does not opt in is
unaffected in every reachable way, and the route answers 404. The name is the warning:
it accepts anyone, so it is for demo and staging deployments only — never a
site with real private content. See *The demo login* in `wiki/private-docs.md`.

Three fake readers ship with it (Acme, Globex, no-org — matching the example
org folders), so org isolation is visible in two clicks. Edit them in
`src/lib/demo-login.mjs`.

### Other

- `site` in `astro.config.mjs` can now come from a `DOCS_SITE_URL` env var, so one
  config serves deployments at different URLs. The placeholder default is
  unchanged.
- **The `vercel.json` markdown-twin rewrites are removed.** They served the
  `.md` twins on an `Accept: text/markdown` header, and they stopped working
  when 2.0.0 introduced the Vercel adapter — its generated routing config
  supersedes them. Measured on a real deployment rather than assumed. Nothing
  linked to the header-negotiated form (the contextual menu deep-links to the
  `.md` route), so the twins are unaffected; only a mechanism nothing used has
  gone. Self-hosting behind your own proxy, you can still negotiate on the
  header there.
- **`npm run test:visual` no longer needs port 4321.** It ran the site under
  `astro preview`, which reports a fixed `http://localhost:4321` origin whatever
  port it listens on — so the SSO round trip only worked on that one port, and a
  developer with anything else there could not run the suite. It now runs the
  Node adapter's standalone entry point, which reports the real port. Set
  `DOCS_TEST_PORT` to move it (default 4331); the mock SSO port follows
  `DOCS_SSO_URL` in `.env.test`. Ports live in `tests/helpers/test-servers.mjs`.

## 2.0.0

Adds a logged-in experience: documentation that only signed-in readers can see,
and sections written for one customer that only that customer can reach.

A major version because the build output moved. If you deploy anywhere other
than Vercel, read *Upgrading* at the end of this entry before pulling it across.

### Private and per-org documentation

Three levels of access, all enforced on the server:

| | Lives in | Who sees it |
| --- | --- | --- |
| Public | `src/content/docs/` | everyone, prerendered exactly as before |
| Private | `src/content/private-docs/` | any signed-in reader, at `/private/…` |
| Per-org | `src/content/org-docs/<org>/` | only members of that org, at `/private/orgs/<org>/…` |

**Readers sign in through your product.** The docs site has no user database, no
signup and no password field — it hands the reader to an endpoint you implement
(about twenty lines; the README has it) and trades a short-lived signed token
for its own session cookie. Access follows your existing users and permissions,
including revocation, and readers never learn a second credential.

**Private content cannot leak, structurally rather than by configuration.** It
lives outside the `docs` collection and is never prerendered, so it is not
present in the build for Pagefind, `llms.txt`, the sitemap or the `.md` twin
routes to find. `tests/private-leaks.test.mjs` asserts it on every `npm test`,
searching raw bytes and inflating Pagefind's gzipped index so the check cannot
pass by looking in the wrong place.

**A wrong org is a 404, never a 403.** A 403 would confirm the org exists, and
org names are customer names. The refusal is byte-identical to the one for an
org that does not exist — asserted by a test that compares the two responses.

### Signing in, from the reader's side

- A **Log in / Log out** control sits in the header, next to the theme toggle,
  and in the mobile menu. Public pages are prerendered and identical for every
  visitor, so the swap is decided client-side from a content-free cookie read
  before first paint: no flash, no extra request, and public pages stay
  CDN-cacheable.
- The sidebar's **Private docs** entry appears only once a reader is signed in,
  so nobody is offered a section they cannot open. Org sections are deliberately
  *not* handled this way — those labels are customer names, and prerendered HTML
  would hand every one of them to every anonymous visitor.
- **Nothing is offered on a deployment that cannot honour it.** With the
  `DOCS_*` variables unset, the control and the sidebar entry are absent from
  the build entirely — no dead link on a demo, a staging site, or a fork that
  has not wired SSO yet. Derived from configuration, not a flag to remember.

### Breaking: the build output moved

There is no longer a flat `dist/` you can host anywhere. Private docs need a
server runtime, so an adapter is now wired in:

- **Vercel** builds (`VERCEL=1` is set automatically) use `@astrojs/vercel`;
  static files land in `.vercel/output/static/`.
- **Everywhere else** uses `@astrojs/node`; static files land in `dist/client/`
  and the server in `dist/server/`.

Public pages are still prerendered in both cases — only `/private/**` and
`/auth/**` render on demand, so the public site keeps its CDN behaviour.

Netlify, Cloudflare Pages and GitHub Pages need attention: an unmodified
template hands them the Node adapter, which none of them runs. Swap in that
platform's adapter, or remove the feature and get the flat `dist/` back. The
README's Deploy table says which.

### Breaking: three new dependencies

`@astrojs/node`, `@astrojs/vercel` and `jose`. `@astrojs/node` is pinned to
exactly `10.1.1`, and the pin is load-bearing: 10.1.2 began importing an Astro
export that only exists from 6.4, while still declaring a peer of `^6.3.0` — so
a caret range resolves cleanly, reports no peer warning, and then fails the
build inside Rollup. Raise the adapter and Astro together, or neither.

### Also

- `astro.config.mjs` filters `/private/` out of the sitemap. `@astrojs/sitemap`
  never consults `isPrerendered`, so a non-dynamic on-demand page under that
  prefix would otherwise be advertised to crawlers.
- `npm run dev:sso` starts a mock SSO server, so `npm run dev` has a working
  sign-in locally with nothing to configure beyond copying `.env.example`.
- `wiki/private-docs.md` documents the constraints that keep this safe. Several
  exist because a bypass was found and measured; the file says which and why.

### Upgrading from 1.x

Nothing about your existing content, theming or API references changed. Public
pages render exactly as they did.

1. **Check your deploy target.** If you are on Vercel, nothing to do. Otherwise
   your publish directory changes from `dist/` to `dist/client/`, and Netlify,
   Cloudflare and GitHub Pages need the adapter swapped or the feature removed.
2. **Don't want private docs at all?** The README's *Don't need private docs?*
   section lists the files to delete — including the `adapter` and `env` entries
   in `astro.config.mjs` and the three dependencies. Skip that second half and
   the build keeps emitting a server bundle you have no use for.
3. **Want them?** Copy `src/middleware.ts`, `src/config/auth.mjs`,
   `src/lib/auth/`, `src/lib/private-sidebar.mjs`, `src/lib/sidebar-items.mjs`,
   `src/pages/private/`, `src/pages/auth/` and the two content collections, then
   set the three environment variables from `.env.example` and implement the
   SSO endpoint from the README.
4. **If you have customised `src/config/sidebar.mjs`**, note it now also exports
   `privateDocsLink`, which `astro.config.mjs` includes only when SSO is
   configured.

Read [`wiki/private-docs.md`](wiki/private-docs.md) before changing anything
under `src/pages/private/`, `src/pages/auth/` or `src/middleware.ts`.

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
