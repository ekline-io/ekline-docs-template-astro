# EkLine docs template

A documentation site template built on [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/). Click **"Use this template"**, replace the placeholder content, and ship.

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

**Live preview:** <https://ekline-docs-template-astro.vercel.app/>

## What's pre-wired

So you don't have to set these up yourself:

- **Tailwind v4** styling, with a single-file global theme — change colors, fonts, and tokens in `src/styles/global.css`. See [`wiki/theming.md`](./wiki/theming.md).
- **Interactive API references** rendered by [Scalar](https://scalar.com/) — schemas, examples, and a built-in client for sending real requests. Two example APIs ship, one per layout, so you can see both and delete the one you don't need; operations are listed in the docs sidebar, generated from your spec on each build. See [`wiki/api-reference.md`](./wiki/api-reference.md).
- **Private and per-org docs** behind your own SSO — server-enforced, so private pages never reach an anonymous browser. See [Private and per-org docs](#private-and-per-org-docs) below and [`wiki/private-docs.md`](./wiki/private-docs.md).
- **Sitemap** auto-generated on build (`sitemap-index.xml` + `sitemap-0.xml`).
- **`llms.txt`** for AI assistants — `/llms.txt`, `/llms-full.txt`, and `/llms-small.txt`.
- **Full-text search** out of the box (Starlight ships [Pagefind](https://pagefind.app/)).
- **Dark / light mode** with system preference detection.
- **Footer credit** rendered on every page via a Starlight `Footer` component override.

## Quick start

1. Click **"Use this template"** at the top of this GitHub page to create your own copy.
2. Clone your new repo and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd <your-repo>
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

The site is live at <http://localhost:4321/> with hot reload.

## Customize it

| What you want to change | Where to do it |
| --- | --- |
| Site title, sidebar, social links | `astro.config.mjs` |
| **Site URL** (required for sitemap + llms.txt) | `site` field in `astro.config.mjs` |
| Theme colors, fonts | `src/styles/global.css` — see [`wiki/theming.md`](./wiki/theming.md) |
| Homepage content | `src/content/docs/index.mdx` |
| **API reference** | Replace `public/openapi.yaml`, and edit `src/config/api-reference.mjs` — see [`wiki/api-reference.md`](./wiki/api-reference.md) |
| Add a new page | Create a `.md` or `.mdx` file under `src/content/docs/` |
| **Private / per-org pages** | `src/content/private-docs/`, `src/content/org-docs/<org>/` — see [`wiki/private-docs.md`](./wiki/private-docs.md) |
| Logo, favicon | `public/favicon.svg`, plus the `logo` field in `astro.config.mjs` |
| Footer credit | `src/components/CustomFooter.astro` |

For anything else, check the [Starlight docs](https://starlight.astro.build/) — they're the source of truth and cover sidebar groups, component overrides, content collection schema, i18n, and more.

## Private and per-org docs

The template ships a server-enforced logged-in experience:

- `src/content/private-docs/` — pages any logged-in reader can see, at `/private/…`
- `src/content/org-docs/<org>/` — pages only members of `<org>` can see, at `/private/orgs/<org>/…`

Readers sign in through **your product** — the docs site has no user database, no signup and no passwords. Set three environment variables (see [`.env.example`](./.env.example)) and implement one endpoint in your product:

```js
// Express example — your product's /docs-sso endpoint.
// npm install jose
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.DOCS_SSO_SECRET);

// `requireYourProductLogin` is your existing auth middleware — the one guarding
// the rest of your product. It is doing more work here than it looks: see
// "Readers who are not signed in yet" below.
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
	// Redirect to the `redirect_uri` you were given, not to a hardcoded URL.
	const target = new URL(req.query.redirect_uri);
	target.searchParams.set('token', token);
	res.redirect(target.href);
});
```

Three things about that endpoint are load-bearing:

- **Honour `redirect_uri`.** It is the docs site telling you where its callback lives, and it moves with the deployment (a `base` path puts it at `/docs/auth/callback`). A hardcoded callback URL works right up until it doesn't. A real endpoint should check the value against an allowlist of your own docs domains before redirecting to it.
- **Echo `state` back unchanged.** It binds the token to the browser that started the sign-in; the callback rejects a token whose `state` does not match.
- **Keep `exp` short.** The handoff token travels in a URL, so five minutes is the mitigation. Nothing in the template caps it — that would mean overruling your own token policy.

### Readers who are not signed in yet

The endpoint above assumes `req.user` exists. Most of the time it will: readers reach private docs from inside your product, so their session cookie comes along and the whole round trip is invisible — two redirects and they are on the page.

When it doesn't, `requireYourProductLogin` does what it always does and sends them to your login page. **That detour is the reader's entire login experience for the docs site, and the docs site has no part in it.** There is no login form here, no password field, nothing to configure: they see the sign-in page they already know.

The one thing that has to work is the trip back:

- **Your login flow must return the reader to the full original URL**, `redirect_uri` and `state` query parameters intact. Most login systems do this by default — they capture the requested URL and replay it after authentication. Some drop the query string, and some send everyone to a dashboard regardless.
- If yours drops them, the reader signs in successfully and lands somewhere else entirely. Nothing errors. The docs site never hears about it, so nothing appears in its logs either — from the outside it just looks like sign-in "doesn't work".

**Test this path deliberately.** It is the one branch that a signed-in developer never exercises: open the docs site in a private window with no product session, click a private link, and check you come back to the page you asked for rather than to your product's home page.

If your login redirect can only return a path you choose, point it at `/docs-sso` and preserve the original query string:

```js
// Inside your login middleware, when there is no session yet.
const returnTo = req.originalUrl; // '/docs-sso?redirect_uri=…&state=…'
res.redirect(`/login?next=${encodeURIComponent(returnTo)}`);
```

`tests/mock-sso/server.mjs` is a working reference implementation of exactly this endpoint. It also doubles as the local dev login: copy `.env.example` to `.env`, run `npm run dev:sso`, and `npm run dev` has a working sign-in.

Before relying on any of this, read [`wiki/private-docs.md`](./wiki/private-docs.md) — the constraints there are what keep private content out of the public build, and several of them are easy to undo by accident.

### Deploying somewhere private docs aren't configured?

A staging site, a public demo, a preview build — anywhere the `DOCS_*` variables
aren't set. Set `showLoginLink` to `false` in
[`src/config/sidebar.mjs`](./src/config/sidebar.mjs) for that deployment.

The guard fails closed without those variables, so `/private/**` answers a bare
404 — correct, and exactly what makes the sidebar's "Private docs" link a dead
link on every page rather than merely an unhelpful one. The flag drops the link;
the routes and the guard are untouched, so nothing becomes reachable.

It is a flag rather than something detected automatically because it cannot be
detected: the sidebar is built at build time, the SSO settings are read at
request time (deliberately, so one build can serve a configured environment and
an unconfigured one), and Astro does not load `.env` early enough for a
build-time check to see your local configuration anyway.

### Don't need private docs?

Delete the feature: `src/content/private-docs/`, `src/content/org-docs/`, `src/pages/private/`, `src/pages/auth/`, `src/middleware.ts`, `src/config/auth.mjs`, `src/lib/auth/`, `src/lib/private-sidebar.mjs` and `src/lib/sidebar-items.mjs`. Then drop the `privateDocs` and `orgDocs` collections from `src/content.config.ts`, and the `loginLink` entry and `showLoginLink` flag from `src/config/sidebar.mjs` along with their use in `astro.config.mjs`. Their tests go too (`tests/auth-*.test.mjs`, `tests/private-leaks.test.mjs`, `tests/sidebar-items.test.mjs`, `tests/visual/auth.spec.mjs`, `tests/mock-sso/`), as do the `dev:sso` script in `package.json` and the mock-SSO `webServer` entry in `playwright.config.mjs`.

**Then get the plain static build back**, or the site still ships a server it does not need. In `astro.config.mjs`, remove the `adapter:` line, the `env:` block, the two adapter imports and the sitemap `filter`; then uninstall `@astrojs/node`, `@astrojs/vercel` and `jose`. Skip this second half and the build keeps emitting a `dist/server/` bundle with no root `dist/index.html` — which silently breaks the deploy instructions below.

## Deploy

**The build output depends on the adapter**, because private docs need a server runtime. Public pages are prerendered either way; only `/private/**` and `/auth/**` render on demand.

| Target | Adapter | Static output | Notes |
| --- | --- | --- | --- |
| **Vercel** | `@astrojs/vercel` (automatic — Vercel builds set `VERCEL=1`) | `.vercel/output/static/` | What the live preview uses; one-click import. |
| **Self-hosted / Docker** | `@astrojs/node` (the default everywhere else) | `dist/client/`, with the server in `dist/server/` | Run the standalone server; set `security.allowedDomains` if you sit behind a reverse proxy. |
| **Netlify, Cloudflare Pages** | swap in `@astrojs/netlify` / `@astrojs/cloudflare` | per that adapter | One line in `astro.config.mjs`. The auth code is adapter-agnostic, so nothing else changes. |
| **GitHub Pages** | none — static only | `dist/` | Cannot run a server, so private docs cannot work there. Follow the removal steps above and the flat `dist/` returns. |

There is no longer a flat `dist/` folder you can host anywhere: on Netlify, Cloudflare Pages and GitHub Pages, `VERCEL` is unset, so an unmodified template hands them the **Node** adapter — a server bundle none of them runs.

See Astro's [deploy guides](https://docs.astro.build/en/guides/deploy/) for step-by-step instructions per platform, and [`wiki/private-docs.md`](./wiki/private-docs.md) for the adapter and output-path details.

> **Before deploying, set the `site` URL** in `astro.config.mjs` to your real domain. The sitemap and `llms.txt` files use it to emit absolute URLs.

## Commands

Run all commands from the project root in a terminal.

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server at `localhost:4321` |
| `npm run build` | Production build — static files to `./dist/client/`, server to `./dist/server/` |
| `npm run preview` | Preview the production build locally |
| `npm run dev:sso` | Mock SSO server, for developing the logged-in experience locally |
| `npm run check` | Type-check the project (`astro check`) |
| `npm test` | Build, then check the output (no browser needed) |
| `npm run test:visual` | Browser tests for the API reference and the SSO round trip — needs `npx playwright install chromium` |
| `npm run astro ...` | Run Astro CLI commands |

All of these run on every pull request via [`.github/workflows/ci.yml`](.github/workflows/ci.yml), except the screenshot comparisons — those are macOS-only baselines and stay a local check. See [`wiki/api-reference.md`](./wiki/api-reference.md).

## Changelog

Notable changes are recorded in [`CHANGELOG.md`](./CHANGELOG.md). The template is something you fork rather than install, so use it to decide whether a change is worth pulling across into a site you have already customised.

## Learn more

- [Starlight docs](https://starlight.astro.build/) — sidebar, components, content schema, theming.
- [Astro docs](https://docs.astro.build/) — routing, integrations, deployment.
- [Starlight plugin showcase](https://starlight.astro.build/resources/plugins/) — search, i18n, OG images, redirects, and more.

## License

[MIT](./LICENSE) — fork it, ship it, change it.

---

Maintained by [EkLine](https://ekline.io).
