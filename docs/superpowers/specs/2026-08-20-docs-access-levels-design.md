# Docs access levels: public, private, and per-org documentation

**Date:** 2026-08-20
**Status:** Approved design, pending implementation plan

## Problem

The template only serves a public documentation experience. EkLine customers
need to host docs with three access levels:

1. **Public** — available to everyone (what exists today).
2. **Private** — visible only to logged-in readers (the customer's customers).
3. **Org-specific** — bespoke sections written for one organization (custom
   workflows, integration guides), visible only to members of that org.

## Decisions made during design

| Decision | Choice |
| --- | --- |
| Security bar | Server-enforced secrecy: private HTML must never reach an unauthenticated browser. |
| Identity | Existing customer SSO only. The docs site validates a token issued by the customer's own product login. No user directory, signup, or password handling in the template. |
| Hosting | Adapter-pluggable Astro SSR middleware; Vercel is the default deploy target. |
| Level 2 shape | Bespoke per-org folders only. Access is "which org are you" → "which folder do you see". No entitlement-based filtering of shared docs. |
| Architecture | Split rendering: public docs stay fully static; private content renders on demand behind middleware (Approach A below). |

Approaches rejected:

- **Whole-site on-demand rendering** (`starlight({ prerender: false })`):
  breaks Pagefind outright (it indexes built HTML, and there would be none),
  turns every public page into a paid server render, and forces exclude-list
  maintenance on every public surface.
- **Platform-level gating** (Cloudflare Access / Vercel protection over split
  deployments): no template code, but no per-org story, disjointed navigation,
  and per-customer platform configuration instead of template capability.
  Documented as an escape hatch for customers who cannot run SSR, not built.

No existing Starlight plugin covers authentication or access control — the
plugin showcase was checked on 2026-08-20 and has nothing in this space, which
is why this is custom-built (per this repo's "look for an existing plugin
first" rule).

## Architecture overview

Public docs remain exactly as today: statically built, served from CDN,
indexed by Pagefind, present in llms.txt and the sitemap. Private content
lives in **separate content collections**, rendered by **on-demand routes**
under a single guarded URL prefix, authenticated by a **JWT-handoff SSO flow**
against the customer's product.

Because private content is never part of the static build, every build-time
surface — Pagefind index, `llms.txt` / `llms-full.txt` / `llms-small.txt`,
`sitemap-*.xml`, and the contextual-menu `.md` routes — is safe
**structurally**, not via exclude lists.

## Content model

```
src/content/docs/           → public docs (unchanged)
src/content/private-docs/   → shared docs for any logged-in reader
src/content/org-docs/
  ├── acme/                 → bespoke section for org "acme"
  └── globex/               → bespoke section for org "globex"
```

- `private-docs` and `org-docs` are new collections in `content.config.ts`,
  both using `docsSchema()` so frontmatter (title, description, sidebar
  ordering) is identical to public docs.
- Org folder names under `org-docs/` **are** the org identifiers. They must
  match the `orgs` claim values in the SSO token. No mapping file.

## URL space and routing

| Route | Requirement | On failure |
| --- | --- | --- |
| `/private/<slug>/` | valid session | redirect to SSO |
| `/private/orgs/<org>/<slug>/` | valid session AND `<org>` ∈ session orgs | 404 (not 403 — org names must not be confirmable) |
| `/auth/callback` | valid handoff token | error page with retry link |
| `/auth/logout` | none | clears cookie, redirects to `/` |

Implementation:

- `src/pages/private/[...slug].astro` and
  `src/pages/private/orgs/[org]/[...slug].astro`, both with
  `export const prerender = false`. Each looks up its entry in the matching
  collection at request time and renders it through Starlight's documented
  `<StarlightPage>` component (same layout, ToC, and theme as public pages).
  Missing entry → 404.
- Everything gated lives under the one `/private/**` prefix. The middleware
  guards the prefix, not specific pages — so any future route placed under it
  (e.g. an org-specific Scalar API reference) is protected automatically.

## Sidebar

- **Public (static) pages:** keep today's config-defined sidebar, identical
  for everyone (static HTML cannot vary per user). A static "Log in" link is
  added to the nav; clicking it while logged out triggers the SSO round trip.
- **Private (on-demand) pages:** pass a custom `sidebar` prop to
  `<StarlightPage>`, built per request by a new `src/lib/private-sidebar.mjs`:
  the public nav groups, plus a "Private docs" group generated from the
  `private-docs` collection, plus one group per org in the viewer's session.
  This mirrors the existing generated-sidebar pattern in
  `src/lib/openapi-sidebar.mjs`.

## Authentication: JWT-handoff SSO

The pattern Zendesk and Discourse use for SSO. The customer's integration
surface is one endpoint (~20 lines) in their product backend.

**Flow:**

1. Unauthenticated request to `/private/**` → middleware stores the requested
   URL and a random `state` nonce in a short-lived cookie, then redirects to
   the customer-configured SSO URL:
   `https://app.customer.com/docs-sso?redirect_uri=<docs>/auth/callback&state=<nonce>`.
2. The product — already knowing the user from its own session — signs a JWT
   with the shared secret (HS256) and redirects back to
   `<docs>/auth/callback?token=<jwt>`. Claims:

   ```json
   {
     "sub": "user-id",
     "email": "reader@acme.com",
     "name": "Reader Name",
     "orgs": ["acme"],
     "state": "<nonce from step 1>",
     "exp": "<now + 5 minutes>"
   }
   ```

3. The callback verifies signature, expiry, and that `state` matches the
   cookie; then issues the docs site's **own session**: an HttpOnly, Secure,
   SameSite=Lax cookie containing a JWT signed with a separate session secret
   (TTL 8 hours), and redirects to the originally requested page. The handoff
   token never persists — it exists only in that one redirect.

**Middleware** (`src/middleware.ts`, standard Astro middleware,
adapter-agnostic):

- No-ops for any path outside `/private/**` and `/auth/**`. Prerendered pages
  are unaffected at request time by design.
- For guarded paths: verify session cookie → attach `{ user, orgs }` to
  `Astro.locals` → continue. Invalid/absent session → SSO redirect.
- Org routes additionally check `params.org` against `locals.orgs`; failure
  is a 404.
- **Loop guard:** the state cookie carries an attempt counter; after 2 failed
  round trips the middleware renders an error page instead of redirecting
  again, so a broken SSO endpoint cannot cause an infinite loop.
- **Fail closed:** with env vars unset, guarded routes return 404 in
  production builds. In `astro dev` only, they render a setup page explaining
  how to configure SSO.

**Session expiry mid-browse:** the next navigation re-runs the SSO redirect;
since the product session is usually still alive, the reader round-trips
invisibly.

**Configuration surface** (mirrors `src/config/api-reference.mjs`):

- `src/config/auth.mjs` — non-secret knobs: enabled flag, SSO endpoint URL,
  session TTL, cookie name. Setting `enabled: false` behaves exactly like
  unset env vars in production: guarded routes 404.
- Environment variables (documented in `.env.example`):
  - `DOCS_SSO_SECRET` — HS256 secret shared with the customer's product.
  - `DOCS_SESSION_SECRET` — signs the docs site's own session cookie.
- One new dependency: **`jose`** for JWT sign/verify. Small, standard, runs on
  Node and edge runtimes. No auth framework, no database.

**Accepted trade-off:** the handoff token travels in a URL query parameter
(as in Zendesk SSO). Mitigations: 5-minute expiry, single-purpose `state`
binding, and the callback immediately redirects so the token does not remain
in the address bar or history.

## Adapter strategy

`astro.config.mjs` selects the adapter by environment:

- `VERCEL=1` (set automatically on Vercel builds) → `@astrojs/vercel`.
- Otherwise → `@astrojs/node` (standalone).

Rationale: the Vercel adapter does not support `astro preview`, and both test
suites run against the build output. The Node adapter keeps `npm test`,
`npm run preview`, and Playwright fully working locally, and gives
self-hosting customers a Node/Docker path for free.

Consequence: the static portion of the build output moves (`dist/client/`
under Node, `.vercel/output/static/` on Vercel). Test helpers resolve the
static directory instead of hardcoding `dist/`. Public pages remain
prerendered and CDN-served on Vercel; only `/private/**` and `/auth/**`
execute server-side.

## Local development loop (must keep working, zero config)

- `npm run dev` with no env vars: public docs behave exactly as today;
  `/private/**` renders the dev-only setup page. No configuration required
  to start working on the template.
- To exercise login locally, the mock SSO server (built for the Playwright
  suite) doubles as the dev login: run it and set `DOCS_SSO_URL` plus the
  test secrets in `.env`. This is a supported, documented workflow, not a
  test-only tool.
- `npm run preview`, `npm test`, and Playwright all run against the Node
  adapter locally, which is why the adapter is env-selected.
- Unchanged pre-existing quirk: search does not work under `astro dev`
  (Pagefind indexes at build time only).

## Error handling summary

| Condition | Behavior |
| --- | --- |
| No/expired session on `/private/**` | Redirect to SSO |
| SSO round trip fails twice | Error page, no further redirects |
| Invalid/expired handoff token | Error page with a retry link that restarts SSO |
| Org not in session's `orgs` | 404 |
| Entry not found in collection | 404 |
| Env vars unset (production) | Guarded routes 404; server log explains |
| Env vars unset (`astro dev`) | Setup page with configuration instructions |

## Testing

Extends both existing suites; the "structurally safe" claim becomes an
executable guarantee.

**`node --test` (no browser, runs in `npm test`):**

- Pure-function tests: middleware guard rules (path matching, org checks),
  handoff-token verification and session issuance using test keys.
- **Leak assertions:** every example private and org doc contains a sentinel
  phrase. Tests assert the sentinel appears nowhere in the static output
  directory, the Pagefind index, any `llms*.txt` variant, or the sitemap.

**Playwright (`npm run test:visual` alongside the existing API tests):**

- A **mock SSO server**: a ~30-line local HTTP server that signs JWTs with a
  test secret, started through Playwright's multi-webServer support. The
  preview server runs with matching test env vars.
- Specs: logged-out `/private/` redirects to SSO; the full handoff round trip
  lands on the requested page rendered with the Starlight layout; a user with
  `orgs: ["acme"]` sees the acme sidebar group and receives 404 on
  `/private/orgs/globex/…`; logout clears the session.
- Existing visual/screenshot tests are unchanged.

## Shipped example content

Same philosophy as the two example API references — features are visible on
real content, and a customer deletes what they don't need:

- Two placeholder pages in `private-docs/`.
- Two example orgs: `org-docs/acme/` and `org-docs/globex/`, one page each.
- `.env.example` documenting both secrets.
- `wiki/private-docs.md` — the constraints doc (what breaks if you move
  content out of the collections, why 404 not 403, why the adapter is
  env-selected, etc.), following the `wiki/api-reference.md` pattern.
- A README section with the ~20-line sample SSO endpoint (Node/Express) a
  customer pastes into their product.

## Out of scope for v1 (architecture accommodates all)

- **Authenticated search** over private docs (Pagefind only indexes built
  HTML; a private index served behind the guard is a clean follow-up).
- **Entitlement-based filtering** of shared docs (plan/product tags).
- **RS256/JWKS and OIDC** verification modes — isolated behind the one
  verification function in the callback.
- **Org-specific Scalar API references** — nearly free later: any route under
  `/private/**` is guarded regardless of what renders it.
- **Session-aware header chrome** ("Logged in as…") on public pages — static
  pages would need a client-side session probe; v1 ships a static "Log in"
  link only.
