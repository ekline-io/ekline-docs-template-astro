# Demo login, hosted docs, and the monorepo — design

**Date:** 2026-08-21 · **Jira:** EK-2373 follow-up · **Status:** approved design, pre-plan

## What we are trying to accomplish

1. **A live demo** at `ekline-docs-template-astro.vercel.app` where a visitor clicks
   "Log in", picks a fake persona, and sees the private and per-org docs from PR #8
   actually work — including the org isolation (Acme's reader gets a 404 on Globex).
2. **Pristine customer copies.** What a customer adopts contains no EkLine dev
   history, no demo-only apps, no maintenance tooling.
3. **A hosted docs site for the template itself** — the setup and configuration
   guidance currently spread across the README, `wiki/`, and config-file comments.

Goal 3 is the only one that forces a repo restructure: "Use this template" copies
the entire default branch, so sibling apps in this repo would ship to every
customer. Goals 1–2 are achievable in the current layout. Hence two phases.

Rejected along the way, with reasons that should survive:

- **A long-lived `demo` branch** — drifts from `main`; every release becomes a
  merge; what we demo stops being what we ship.
- **A demo "overlay" recomposed onto the template at build time** — bespoke
  machinery nobody else maintains. The industry pattern for a template demo is
  *the template deployed with the feature enabled*, which needs no machinery at
  all once the demo login ships in the template, env-gated.
- **A mirror repo published by CI to keep the "Use this template" button** —
  deferred, not rejected. Launch with the `npm create astro` command (Astro's own
  starters have no button flow); add the mirror later only if customers miss it.

## Phase 1 — demo login, in the current layout

### Shape

One new route plays the part the customer's product plays in production. The
handshake is unchanged; the demo supplies the missing half. Nothing in
`src/middleware.ts` or `src/lib/auth/` changes — the demo exercises the real
guard, the real callback, the real session issuance.

```
/private/ → middleware → DOCS_SSO_URL (= /demo-login) → /auth/callback → /private/
              guard        persona picker signs the       verifies, issues
              + state      handoff JWT                    session cookie
```

This is also a customer feature, not just our demo: "evaluate the logged-in
experience on a staging deploy before your product team writes the SSO
endpoint." It is the deployable equivalent of `tests/mock-sso/server.mjs`,
which only exists for local dev.

### New files

**`src/lib/demo-login.mjs`** — pure logic, no `astro:env` import, so `node
--test` can import it (the same split `src/config/auth.mjs` documents):

- The persona list, as data. Three personas, matching the shipped org folders:

  | id | name / email | `orgs` | shows |
  |---|---|---|---|
  | `acme` | Dana Reed, `dana@acme.test` | `['acme']` | org docs + 404 on Globex |
  | `globex` | Sam Patel, `sam@globex.test` | `['globex']` | the mirror image |
  | `no-org` | Alex Kim, `alex@example.test` | `[]` | private docs, no org groups |

- `findPersona(id)` — lookup; unknown ids return `null`, and the raw `?as=`
  value is never placed into a JWT.
- `parseDemoRedirectUri(value, requestOrigin)` — `redirect_uri` must parse, use
  an http(s) scheme and be same-origin with the request. The mock SSO server
  deliberately skips this (documented there); a deployed endpoint must not:
  without it `/demo-login` is an open redirector that hands a signed handoff
  token to an arbitrary site. This also models what a customer's real endpoint
  should do. It returns the parsed `URL` rather than a boolean — amended after
  code review, because `URL` normalises what it parses (CR/LF stripped, scheme
  and host lowered), so a caller redirecting to the *raw* string would be
  redirecting to something never checked, and to a value Node refuses to write
  as a header. The scheme check is the same amendment: `URL#origin` reports a
  real origin for `blob:http://origin/x`, so origin alone is not enough.

**`src/pages/demo-login.astro`** — `export const prerender = false`.

- Gate first: 404 (via the shared `notFound()`) unless `DOCS_UNSAFE_DEMO_LOGIN`
  is `'1'` or `'true'` **and** `authConfigured()`. Both conditions checked
  independently; a fork gets an inert file.
- Validation order after the gate: `redirect_uri` and `state` present and the
  `redirect_uri` same-origin, then the persona. A request failing the first
  check gets the explanation page whether or not it carries `?as=`; a token is
  only ever signed when every check passes.
- With no `?as=`: render the persona picker. Links carry `redirect_uri` and
  `state` through. `<meta name="robots" content="noindex">`. A visible notice:
  *"This sign-in accepts anyone. It exists to demonstrate the template and must
  never be enabled on a site with real private content."* If `redirect_uri` or
  `state` is absent (someone browsed here directly), explain and link to
  `/private/` (via `withBase`) so the round trip starts properly.
- With a valid `?as=`: sign the handoff JWT — HS256 with `DOCS_SSO_SECRET`,
  claims `sub`, `email`, `name`, `orgs`, `state`, `exp` 5 minutes — and 302 to
  `redirect_uri?token=…`. Same claims as the mock; `jose` is already a
  dependency. Log at error level on every token issued, so an enabled flag is
  visible in production logs.

### Changed files

- **`astro.config.mjs`** — add `DOCS_UNSAFE_DEMO_LOGIN` to the env schema
  (server, secret, optional — runtime-read like the other three). Extend the
  sitemap filter to also drop `/demo-login`: it is a static pathname with
  `prerender = false`, exactly the shape `wiki/private-docs.md` documents as
  advertised by `@astrojs/sitemap` unless filtered. Make `site` env-overridable
  (`SITE_URL ?? 'https://example.com'`) so the demo's sitemap/llms-txt emit real
  URLs; generically useful, not demo-specific.
- **`.env.example`** — document the flag beside the other three, leading with
  the warning.
- **`.env.test`** — set the flag, so the Playwright preview server has the
  route live.
- **`README.md`** — a short "Try it without wiring SSO" subsection under the
  private-docs setup material.
- **`wiki/private-docs.md`** — a section on the demo login: what it is, the
  `UNSAFE` name, and the attack that justifies it (below).
- **`CHANGELOG.md`** — 2.1.0.

### Why the flag is named `DOCS_UNSAFE_DEMO_LOGIN`

If the flag is enabled on a site with real private content, that content is
readable by anyone — full stop. The attacker does not need the site's
`DOCS_SSO_URL` to point at the demo route: they visit `/private/` to make the
middleware set their state cookie, read their own cookie (`HttpOnly` stops other
sites, not the browser's owner — the wiki already documents this), and call
`/demo-login?as=…&redirect_uri=…&state=…` directly. The token is signed with the
site's real `DOCS_SSO_SECRET`, so `/auth/callback` accepts it. Same-origin
`redirect_uri` validation does not prevent this; nothing but the flag staying
unset does. So the name carries the warning (`dangerouslySetInnerHTML`
convention), the picker page states it, and every issued token logs at error
level.

The demo deployment itself has nothing real to protect — every private page in
the template carries the leak-test sentinel and exists to be seen.

### Tests

- **Unit (`tests/demo-login.test.mjs`)**: persona lookup returns `null` for
  unknown/empty ids; `parseDemoRedirectUri` rejects cross-origin,
  protocol-relative, non-http(s) and unparseable values; the gate helper is off
  unless both conditions hold.
- **Build assertions**: `/demo-login` absent from the sitemap — asserted in
  `tests/private-leaks.test.mjs` beside the `/private/` one, which is where
  this suite's build-output tests live; the rest of that suite stays green (the
  route is server-rendered, so it never enters the static output).
- **Playwright (`tests/visual/demo-login.spec.mjs`)**: drive the picker
  directly against the existing preview server — block the redirect to the mock
  SSO, read the state cookie via `context.cookies()`, request
  `/demo-login?as=acme&…`, land through the real callback, assert the session
  is Dana Reed's, assert `/private/orgs/acme/` renders and
  `/private/orgs/globex/` is a 404. One spec asserting the picker page renders
  personas and the warning. The off-state (flag unset → 404) is covered at the
  unit level; the preview server runs with the flag on.

### Deployment and the two open Vercel unknowns

Deploy a preview with the four env vars before merging; this closes PR #8's
open item. Verify, in order:

1. **`context.url.origin` on `@astrojs/vercel`.** `callbackUrl()` builds
   `redirect_uri` from it; on `@astrojs/node` it is literal `localhost` unless
   `security.allowedDomains` matches. If the Vercel adapter behaves the same,
   sign-in dies visibly on the first round trip; fix is `security.allowedDomains`
   in `astro.config.mjs`, driven from env. Not pre-added: measure first,
   per the project's rule.
2. **`vercel.json` rewrites vs the adapter.** `curl -H 'Accept: text/markdown'`
   on `/` still returns markdown, and `/private/` still reaches the middleware
   (302, `no-store`). If the rewrites conflict, drop them (the `.md` URLs still
   work) — record the outcome in `wiki/private-docs.md` either way.

Production env vars: `DOCS_SSO_URL=https://ekline-docs-template-astro.vercel.app/demo-login`,
`DOCS_UNSAFE_DEMO_LOGIN=1`, and `DOCS_SSO_SECRET` / `DOCS_SESSION_SECRET` from
two separate `openssl rand -base64 32` runs — never the published `.env.example`
values, and two different values (the `aud`-claim reason documented there).

## Phase 2 — monorepo, hosted docs, adoption

### Layout

```
packages/template/     the deliverable — everything a customer gets, and nothing else
apps/docs/             Starlight site documenting the template; hosted
docs/superpowers/      dev history — outside the deliverable, kept
```

### Adoption

`npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template`

Verified 2026-08-21: `create-astro` (giget) fetched exactly a subdirectory of
this public repo. This replaces the "Use this template" button as the documented
path (the Starlight starter itself is `withastro/starlight/examples/basics`,
adopted the same way). Turn off `isTemplate` on the repo when this lands, so
the button does not offer the whole monorepo. Deferred: a CI-published mirror
repo to restore the button, only if customers ask.

### The two deployments

- **Demo** — the existing Vercel project, root directory set to
  `packages/template`, Phase 1 env vars on. Not a separate app: it *is* the
  template, so it is in sync with every template change by construction.
- **Docs** — a new Vercel project rooted at `apps/docs`. A Starlight site (the
  strongest advertisement is dogfooding), content sourced from:
  - `packages/template/wiki/*.md` — loaded in place via a glob loader with a
    base outside the app (assumption to verify early in Phase 2 planning;
    fallback is a build-time copy script — still single-source).
  - New authored pages: quickstart (the `npm create` command), env-var
    reference, sidebar/API-reference/auth configuration guides — content that
    today lives only in the README and config comments.
  The wiki files stay in the template (they are the constraints a customer's
  future maintainer needs next to the code); the docs site renders them, never
  forks them.

### Migration mechanics (the churn, named)

`git mv` of the template surface into `packages/template/` (history follows);
CI workflow paths and working-directory; `vercel.json` moves with the template;
root `package.json` gains npm workspaces with delegating scripts (`npm test`
still works at the root); `CLAUDE.md` split — repo-level (monorepo map) and
`packages/template/CLAUDE.md` (current content); README split the same way;
wiki relative links re-checked; the demo Vercel project's root directory
updated at the same time as the merge.

### Sequencing

Phase 1 lands first, in the current layout — it is required in every end state
and carries over verbatim (only the Vercel root directory changes). Phase 2 is
its own plan, written after Phase 1 ships.

## Out of scope

- The mirror template repo (deferred; decision recorded above).
- An `npm run eject` cleanup script — Phase 2 removes the need by relocating
  everything non-deliverable outside `packages/template/`.
- Turning template placeholder content into self-documentation — considered and
  set aside: the docs site serves that goal without changing what "placeholder"
  means for customers.
- JWKS/OIDC handoff verification (unchanged v1 limit from PR #8).
