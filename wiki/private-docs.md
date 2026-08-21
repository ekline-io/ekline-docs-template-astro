# Private and per-org docs

The logged-in experience: pages any signed-in reader can see, and pages written for one customer. Read this before touching `src/middleware.ts`, `src/pages/private/`, `src/pages/auth/`, `src/lib/auth/`, or the `privateDocs` / `orgDocs` collections in [`src/content.config.ts`](../src/content.config.ts).

Most of what follows was measured against a real build rather than reasoned about, and several of these constraints exist because the bypass they describe served one customer another customer's page at HTTP 200 before it was closed.

## The security model in one sentence

Private content lives **outside the `docs` collection** and renders **only on demand behind the middleware**, so it is never part of the static build — which means Pagefind, `llms*.txt`, the sitemap and the `.md` twin routes cannot leak it *structurally*, rather than because someone remembered to exclude it.

`tests/private-leaks.test.mjs` turns that claim into a byte search over the entire static output, inflating gzip where it finds it (Pagefind's index is gzipped, so a plain search would be blind to the one surface most likely to carry indexed private prose). Every example private and org page carries the sentinel `EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK`, and a first test asserts the sentinel is still present in the source. Replace the shipped examples with your own content and that test fails — which is the correct signal, not a nuisance: the leak tests below it have nothing left to detect until your own content carries a marker.

## Constraints that are easy to break

### `prerender = false` on every route under `src/pages/private/` and `src/pages/auth/`

A prerendered guarded route is rendered once at build time and then served from disk by the static handler, which never calls the middleware. Measured on Astro 6.3.1 with SSO configured at build time: a `src/pages/private/oops.astro` missing its `prerender` export produced a static `dist/client/private/oops/index.html` containing a `<meta http-equiv="refresh">` to the SSO endpoint with a single-use `state` nonce baked into it — served anonymously, with `Cache-Control: public, max-age=0` and no `Set-Cookie`. The nonce becomes a public asset shipped to every visitor, and the round trip can never complete because no cookie matches it.

The middleware now refuses this rather than trusting the flag to be there: it checks `context.isPrerendered` and answers 404 with a named error naming the route. It is a loud failure at the first build or request instead of a silent one.

That check deliberately does not cover `/auth/**`, which returns earlier — a prerendered callback leaks no nonce, it just bakes its own failure page and breaks sign-in. Set `prerender = false` there anyway.

Keep every route under `src/pages/private/` a **dynamic or spread** route as well. `@astrojs/sitemap` never consults `isPrerendered` — its only filters are `type !== 'page'` and a defined `pathname`, and `pathname` is undefined for `[dynamic]` and `[...spread]` routes — so a plain `src/pages/private/welcome.astro` would be advertised to crawlers even while returning 302s. `astro.config.mjs` also passes a `filter` that drops `/private/`, but the route shape is the half that does not depend on anyone remembering the filter.

### The guard reads two signals, and the stricter one wins

**`context.originPathname`, never `context.url.pathname`.** `url.pathname` still carries the configured `base`, so on a site built with `base: '/docs'` a request for `/docs/private/secret/` classifies as **public** while Astro strips the base and renders the private page anyway. A complete bypass, costing a customer nothing more than deploying under a subpath. `originPathname` is base-stripped and agreed with the router in every non-rewrite probe, including the multi-level-encoding cases (`%252e%252e`) where the two disagree about which org segment is being asked for. A refactor that "simplifies" this back to `url.pathname` reintroduces the hole silently, on subpath deployments only.

**`context.routePattern` covers what `originPathname` cannot.** Astro re-enters the *entire* user middleware chain after any `Astro.rewrite()`, and on that second pass `originPathname` is still pinned to the pre-rewrite path. So a public page that rewrites into `/private/**` renders private content with the guard reporting `public` — the `base` case with the safe and unsafe inputs swapped, failing open. The rewrite may be issued by a page or by a third-party integration; the chain re-runs either way, and it is not something a middleware author opts into or can decline. Nothing in this template rewrites today, which makes this defence in depth rather than a live hole — but "no integration ever rewrites" is not a property a template can promise on its customers' behalf.

Neither signal is sufficient alone; each fails open in a case the other catches. When they disagree, the middleware refuses outright rather than guessing.

### An org route has to name the same org twice

`params.org` must equal the org in the path the guard classified. Only a rewrite can separate them, and both ways it separates them are a bypass of the membership check. Measured on Astro 6.3.1 with a session holding `orgs: ["acme"]`:

| Request | Rewrites to | What the guard saw |
| --- | --- | --- |
| `/private/to-org` | `/private/orgs/globex/` | path says `private`, params say `globex` — membership never checked |
| `/private/orgs/acme/x` | `/private/orgs/globex/` | path says `acme` (which passes), params say `globex` |

Both served Globex's page, HTTP 200, to a reader who is not in Globex. The route is the authority on what is about to render, so it is the route that has to agree with the path, not the other way round.

In every shape a reader can ask for directly the two are byte-identical — including the ones where the encoding suggests otherwise (`%61cme` decodes to `acme` on both sides; `a%2fb` and `a%25b` likewise) — because both are read off the same pathname after Astro has decoded it once. So this refuses nothing legitimate.

One coupling worth knowing: the check reads `params.org` by name, so renaming the `[org]` directory to `[organization]` makes it `undefined` and 404s every org page. That fails closed and says so in the log; the fix is to rename it back, not to loosen the check.

### Wrong org is a 404, never a 403

A 403 confirms the org exists, and org names are customer names. The bare 404 the middleware serves is byte-identical for an org that does not exist and an org the reader simply lacks — `tests/visual/auth.spec.mjs` asserts the two responses are the same string, which is the only way to test the property at all: either one alone looks correct while the pair still leaks which customer names are real.

The org slug is compared **byte-verbatim** — no lowercasing, trimming or decoding on either side. A slug that is odd (percent-encoded, `.`, `..`, containing `%2f`) therefore fails the membership check and 404s, which is the outcome we want. Repairing such a slug would invert that: falling back to "just private" when a slug looks wrong would let any logged-in reader clear the guard and land on the org route with no org check at all. **A malformed org must stay a failed org check, never become a passed private one.**

### Org folder names are slugified; the token's `orgs` claim is not

Astro's glob loader runs each path segment through `github-slugger` to build the entry id, while the org slug from the SSO token is compared verbatim (deliberately — see above). The two only meet if the folder name is already slug-shaped. Consequences to plan around:

- A folder named `Acme Labs` and one named `acme-labs` both become `acme-labs`, and their pages merge into one org.
- An org legitimately named `acme.co` in your token gets **no group at all**, silently, because the folder slugs to `acmeco`.

Normalising the token side would be worse than the empty group: it would make two different folders answer to one org. **Name org folders in lowercase kebab-case, and match the token's `orgs` values to them exactly.** If an org's section is mysteriously empty, this is the first thing to check.

### Never enable Vercel ISR

`vercel({ isr: true })` is the one configuration change that silently defeats everything on this page. `@astrojs/vercel` carries a high-severity advisory (CVE-2026-73424, "unauthenticated path override in the ISR function"): with ISR on, `/_isr?x_astro_path=/private/orgs/acme/` renders any route **bypassing Astro middleware entirely** — which is where this template's only auth check lives.

The template calls `vercel()` bare, so it is not affected as shipped. The fix landed in `@astrojs/vercel` v11, which requires Astro 7, and there is no fixed release on the 10.x line (10.0.8 is the last of it), so the `^10.0.8` range cannot pick one up either. Until this template moves to Astro 7, **"do not enable ISR" is the mitigation** — not an upgrade.

### `@astrojs/node` is pinned to exactly `10.1.1`

Not a `^` range, and that is load-bearing. 10.1.2 moved to an `astro/app/node` export (`createRequestFromNodeRequest`) that Astro only ships from 6.4 on, but kept declaring a peer of `astro: ^6.3.0` — so npm resolves 10.1.4 against this project's Astro 6.3.1 with no peer warning at all, `npm ls` comes out clean, and the build then dies deep in Rollup on a missing export. Raise the adapter and Astro together, or neither. The reason is repeated in `astro.config.mjs`.

### Shorter rules, same weight

- **`orgs/` is a reserved folder name inside `src/content/private-docs/`.** The collection's glob excludes it (`'!orgs/**'`) because `/private/orgs/**` is the org-docs URL space; content placed there is dropped from the collection rather than shadowing a real org route.
- **An org slug containing `/` gets no group.** `orgGroup` returns `null` for it, because a nested entry id like `acme/deep` would otherwise put one customer's page title in another's sidebar. Nothing is lost: the middleware captures a single path segment, so a slash-bearing org can never be granted access anyway.
- **`sidebar.hidden` is not access control.** It keeps a page out of the nav; the page is still served to any logged-in reader who has its URL. To deny access, move the page — to `org-docs/<org>/` for one customer, or out of the private collections entirely.
- **Fail closed.** `enabled: false` in `src/config/auth.mjs`, or any missing env var, makes `/private/**` a 404 in production. A `DOCS_SSO_URL` that is not an absolute http(s) URL counts as unset for this purpose, so a typo fails closed instead of throwing inside the guard on every request. The friendly setup page appears in `astro dev` only.
- **Keep secrets out of `src/config/auth.mjs`.** Behaviour knobs live there; `DOCS_SSO_URL`, `DOCS_SSO_SECRET` and `DOCS_SESSION_SECRET` are env vars, read at runtime so one build works across environments.

## The SSO handoff

1. The middleware redirects to `DOCS_SSO_URL` with `redirect_uri` and `state` (a nonce stored in a short-lived cookie alongside the page the reader asked for).
2. The customer's product signs a JWT (HS256, `DOCS_SSO_SECRET`) with claims `sub`, `email`, `name`, `orgs` (folder names under `src/content/org-docs/`), `state`, and a short `exp`, then redirects to `redirect_uri?token=<jwt>`.
3. `/auth/callback` verifies signature, `exp` and `state`, sets the site's own session cookie (8h, HttpOnly, SameSite=Lax, Secure outside dev), and redirects to the original page.

The README carries a copy-paste endpoint implementation for customers, and `tests/mock-sso/server.mjs` is the working reference version of it.

A **loop guard** stops the cycle after two failed round trips: a genuinely broken SSO endpoint gets an error page instead of a third redirect, while ordinary logged-out navigation never trips it. A redirect loop is a far worse failure to debug than a page that says what broke.

Three properties of this handshake are worth stating plainly, because their names suggest more than they deliver:

- **`state` is CSRF binding, not anti-theft.** JWTs are signed, not encrypted, so anyone holding a stolen handoff token can read its `state` claim and set a matching cookie in their own browser — `HttpOnly` stops other *sites* reading the cookie, not the browser's owner writing one. What actually limits theft is the short `exp`. Keep it at five minutes or less.
- **The session token carries an `aud` claim, and verification requires it.** Both tokens are HS256 JWTs, so if a customer sets `DOCS_SSO_SECRET` and `DOCS_SESSION_SECRET` to the same value — the ordinary slip — then without `aud` *any* token their product signs with that secret (an API token, a password-reset link) would verify as an 8-hour docs session. Only the session side is marked, because that is the side this template controls: requiring a new claim from the customer's product would change their integration contract to buy the same property. The reverse direction needs nothing — a session token carries no `state`, so it was never usable as a handoff token.
- **No maximum handoff lifetime is enforced.** `exp` is *required* on both tokens, but its length is the product's policy, and rejecting a customer's 15-minute token would be this template overruling it. A product that signs a ten-year handoff token silently voids the mitigation above. The README's sample endpoint uses `5m`, and the reason is worth keeping when adapting it. (Verification allows 60s of clock skew on the handoff token, so a 5-minute window is really 6.)

## The demo login

`src/pages/demo-login.astro` plays the product's part in the handshake above:
a persona picker that signs the same handoff JWT, so the template can be
demonstrated — and evaluated on a staging deploy — before any real SSO
endpoint exists. Enable it by pointing `DOCS_SSO_URL` at this site's own
`/demo-login` and setting `DOCS_UNSAFE_DEMO_LOGIN=1`. It is off unless both
that flag (spelled `1` or `true`, nothing else) and `authConfigured()` hold;
either missing and the route answers the same bare 404 as the rest of the
auth surface.

**The name is not decoration.** If the flag is enabled on a site holding real
private content, that content is readable by anyone — and not only via the
picker. The attacker does not need `DOCS_SSO_URL` to point at the demo route:
they visit `/private/` so the middleware sets their state cookie, read their
own cookie (`HttpOnly` stops other sites, not the browser's owner — see the
`state` note above), and call `/demo-login?as=…&redirect_uri=…&state=…`
directly. The token is signed with the site's real `DOCS_SSO_SECRET`, so
`/auth/callback` accepts it. Nothing but the flag staying unset prevents this,
which is why the flag carries the warning in its name and why the route logs
at error level on every token it issues.

What the route does defend, it defends as a model for your real endpoint:

- **`redirect_uri` must be an http(s) URL, same-origin with the request**, or
  the page refuses (400). The scheme half is the more surprising one, and the
  reason `parseDemoRedirectUri` returns a parsed `URL` rather than a boolean:
  `new URL('blob:http://your-origin/x').origin` *is* your origin, so an
  origin test alone lets it through. Without that check the route is an open redirector that hands a
  freshly signed token to any site named in the query string. The mock SSO
  server deliberately skips this and says why; a deployed endpoint must not —
  yours should check `redirect_uri` against an allowlist too.
- **The `?as=` value never enters a token.** Only a persona from the list in
  `src/lib/demo-login.mjs` is signed; unknown ids re-render the picker.
- **`/demo-login` is filtered out of the sitemap** in `astro.config.mjs` and
  carries `noindex`. It is a *static* pathname with `prerender = false` —
  precisely the shape `@astrojs/sitemap` advertises unless filtered (see the
  route-shape note above), and unlike `/private/**` it cannot hide behind a
  dynamic route shape.

The personas name org folders byte-verbatim, under the same contract as a real
token's `orgs` claim (see the slugging section above). `tests/demo-login.test.mjs`
fails if a persona names a folder that does not exist.

## What the customer's login flow has to preserve

Step 2 above assumes the reader already has a session with the customer's
product. Usually they do — they reached private docs from inside it. When they
have not, `/docs-sso` sits behind the product's own auth, so the product sends
them to its login page. That detour is the reader's whole login experience for
the docs site, and nothing in this template participates in it: there is no
login form here, no password field, no account to create.

What the template does depend on is the trip back. **The product's login flow
must return the reader to the full original URL, `redirect_uri` and `state`
query parameters intact.** Most login systems capture the requested URL and
replay it after authentication; some drop the query string, and some send
everyone to a dashboard.

When that happens the failure is silent and points nowhere:

- The reader signs in successfully. Nothing errors.
- They land on the product's home page instead of the docs page they wanted.
- `/auth/callback` is never reached, so the docs site has no idea a sign-in was
  attempted and logs nothing.
- The loop guard does not fire either — it counts *failed* round trips, and this
  round trip never came back at all.

From the outside it reads as "sign-in doesn't work", with no evidence anywhere.
That makes it worth an explicit test rather than an assumption, and it is the
one branch a signed-in developer never exercises: open the docs site in a
private window with no product session, click a private link, and confirm you
return to the page you asked for.

The state cookie's ten-minute `maxAge` bounds how long that detour may take. A
login flow that parks the reader somewhere for longer — an email verification
step, say — will find the cookie gone on return and start a fresh round trip,
which is correct but means the reader loses the page they originally wanted.

## Links that change state must opt out of prefetching

Starlight turns on `prefetchAll`, so Astro prefetches **every** link on hover,
and a prefetch is an ordinary GET carrying the reader's cookies. Any link whose
GET does something therefore does that thing on hover. Measured on this
template before it was fixed:

- Hovering **Log out** ended the session. No click.
- Hovering **Log in** ran the entire SSO round trip — guard, the customer's
  product, `/auth/callback` — and issued a session the reader never asked for.
  This is how logging out appeared not to work: click "Log out", leave the
  mouse still, and "Log in" occupies the same pixel, so the reader was signed
  back in about a second later.

Every such link therefore carries `data-astro-prefetch="false"`:
`src/components/AuthControl.astro` (both), `privateDocsLink` in
`src/config/sidebar.mjs`, and the "Log out" entry built in
`src/lib/private-sidebar.mjs`. `tests/visual/auth.spec.mjs` hovers both
controls and asserts nothing changes, so the attributes cannot be quietly
tidied away.

`src/pages/demo-login.astro` carries two more, for the same reason and one
extra: each persona link signs a handoff token, so hovering it signs the
reader in as whichever persona their mouse happened to cross — not the one
they meant to click. The page's other link, to "the private docs" on the
explanation screen shown with no round trip in progress, is prefetch-off for
the ordinary reason: it would run the full SSO round trip on hover, same as
**Log in** above. `tests/visual/demo-login.spec.mjs` pins both: it
asserts all three persona links carry the attribute in markup, and hovers one
of each kind while watching for the sign-in request.

If you add a link that signs in, signs out, or otherwise changes something,
add the attribute. Ordinary private content links are fine to prefetch — they
only render a page.

## Things that are outside the guard

The middleware guards a URL prefix. These are the non-obvious ways a request can render without passing through it:

- **Anything under `public/private/` is served straight past the guard, and the leak test's sentinel search cannot see it.** A customer's private roadmap PDF does not contain our sentinel — measured: with a sentinel-free file at `/private/orgs/roadmap.pdf` and nothing else wrong, the *directory* check in `tests/private-leaks.test.mjs` was the sole failing test. That check is the entire defence. The mechanism: Astro copies `public/` into the static output verbatim and the static handler runs *before* the middleware, so `public/private/leak.txt` answers an anonymous request with `200` and `Cache-Control: public, max-age=0` on a fully configured site, while `/private/` itself correctly answers `302` with `no-store`. Nothing in `src/middleware.ts` can prevent it — this is a hole beside the guard, not a bug in it. And it is the most likely way to leak in practice, because `public/` is exactly where a PDF, diagram or `.json` goes, and filing it under `private/` to keep it *with* the private docs is the natural instinct. **The URL prefix is not the boundary — the route table is. Private assets do not belong in `public/` at all.**
- **Unmatched routes never enter the middleware** on the Node adapter. Harmless — there is nothing to render — but it means "no `[auth]` log line" does not prove a request was allowed.
- **Server islands are fetched outside the guarded prefix**, at `/_server-islands/…`, even when the island is rendered inside a private page. Add one to private content and it must do its own session check.
- **`sidebar.hidden`** — see above.

## Reverse proxies and `redirect_uri`

On `@astrojs/node`, `context.url.origin` is **`http://localhost:<port>`** and nothing at the network layer changes it. Astro ignores `Host` *and* `X-Forwarded-Host` unless they match `security.allowedDomains`: with that list empty, `validateHost()` returns undefined and the hostname falls back to the literal `"localhost"` (`astro/dist/core/app/node.js:28-35`). Measured with `Host: docs.example.com`, and with `X-Forwarded-Host` plus `X-Forwarded-Proto: https`: identical `localhost` output every time. Only the adapter's `PORT` is carried across — `HOST` is never read, so `HOST=127.0.0.1` still yields `localhost`.

Good news for security: nobody can poison `redirect_uri` with a forged `Host`. But **a self-hosted deployment behind a reverse proxy must set `security.allowedDomains`** in `astro.config.mjs`, or the SSO round trip hands the customer's endpoint a `redirect_uri` pointing at the server's own loopback and sign-in can never complete. This survives local testing precisely because `astro dev` *does* use the real `Host`.

One related quirk, and the reason a test port is not a matter of taste: under `astro preview --port N`, `url.origin` always reports `http://localhost:4321` whatever `N` is — measured at four different ports. `astro dev` and the standalone Node server both report the real port; only `preview` is wrong.

## Adapters and output paths

The adapter is env-selected in `astro.config.mjs`: Vercel builds (`VERCEL=1`) get `@astrojs/vercel`, everything else gets `@astrojs/node`, because the Vercel adapter does not support `astro preview` and both test suites run against the build output. Public pages stay prerendered either way; only `/private/**` and `/auth/**` execute server-side.

The consequence is that the static output moves, so nothing may hardcode `dist/`:

| Build | Static files | Server bundle |
| --- | --- | --- |
| `@astrojs/node` (local, CI, self-hosted) | `dist/client/` | `dist/server/` |
| `@astrojs/vercel` (`VERCEL=1`) | `.vercel/output/static/` | `.vercel/output/functions/` |

Tests resolve this through `tests/helpers/static-dir.mjs`, which probes for an `index.html` rather than for the directory — `dist/` exists under the Node adapter too, as the parent of `client/` and `server/`, and a `dist/` left behind by an earlier static build survives a Vercel-adapter build that writes somewhere else entirely. Switching adapters in place is the one case that calls for deleting the old output first.

The sentinel *is* present in `dist/server/chunks/` — that bundle is what renders private pages at request time, and it is never served as a static asset. This is why the leak test walks the static directory rather than all of `dist/`: a test over the whole of `dist/` would fail on correct behaviour, and the obvious "fix" for that failure would be to stop testing the surface that matters.

## Local development

`npm run dev` needs nothing: `/private/**` shows a setup page explaining the next step. For a working login, copy `.env.example` to `.env` and run `npm run dev:sso` in a second terminal — the mock signs you in as `reader@acme.test` with org `acme`.

The mock redirects to the `redirect_uri` it was given rather than to a hardcoded callback, deliberately: the round trip is what the auth suite exists to prove, and a mock that ignored the parameter would keep passing if the middleware stopped sending one.

## Tests

| Command | What it covers |
| --- | --- |
| `npm run check` | Types, via `astro check`. |
| `npm test` | Build output plus pure functions: the guard's path rules (`tests/auth-guards.test.mjs`), token verification and session issuance (`tests/auth-tokens.test.mjs`), and the leak assertions (`tests/private-leaks.test.mjs`). No browser needed. |
| `npm run test:visual` | The real handshake in a browser: logged-out redirect, the full round trip, `returnTo`, org isolation, the 404-not-403 comparison, logout, and the private sidebar (`tests/visual/auth.spec.mjs`). |
| `npm run test:visual:ci` | The same, minus screenshot comparisons. None of the auth specs are tagged `@screenshot`, so all of them run in CI. |

Two traps in the browser suite, both worth knowing before you touch `playwright.config.mjs`:

- **The preview server must run on 4321.** Because of the `astro preview` origin quirk above, a preview on any other port tells the SSO endpoint to send readers back to a port nothing is listening on, and the round trip dies on connection refused. Someone will otherwise "tidy" the port and get an unexplainable failure. The fix is not to make the mock ignore `redirect_uri`.
- **`reuseExistingServer` will reuse a preview you started by hand.** A server from `npm run preview` lacks the `DOCS_*` env (those are read at runtime, `access: 'secret'`), so `/private/**` serves 404s instead of the SSO redirect and the auth specs fail with "expected 302, got 404" rather than "stop your other server". Stop it and let the config start its own.

## Known v1 limits

Private pages are not in site search (Pagefind indexes built HTML only). The public "Private docs" nav link is static, not session-aware — static HTML is identical for every visitor, so it cannot be. Handoff verification is HS256 shared-secret; JWKS/OIDC would slot into `verifyHandoffToken` and nowhere else.

## Open: `vercel.json` rewrites

Not caused by this feature, but newly relevant because of it. `vercel.json` carries two `rewrites` that serve the markdown twins on an `Accept: text/markdown` header. Before the adapter change, Vercel did zero-config detection on a plain static build and those rewrites applied. Now `@astrojs/vercel` emits Build Output API v3, and the generated `.vercel/output/config.json` contains only a filesystem handle, an `_astro` cache header and a 404 catch-all — no `text/markdown` route.

Vercel's own Astro documentation (checked 2026-08-20) states that rewrites only work for static files with Astro, that Vercel's Routing Middleware should be used instead, and that using `vercel.json` to rewrite URL paths in an Astro project produces inconsistent behaviour and is not officially supported. The twins *are* static files, so the rewrites may still work — but "may" is not good enough for a template other people deploy. Two things follow:

1. **Astro middleware cannot replace these rewrites.** Middleware runs only on on-demand routes; the pages these rewrites serve are prerendered and handed straight to the CDN, so the middleware never sees the request.
2. **The downside risk is not limited to the twins.** The same documentation warns that a `vercel.json` with conflicting routing config can override the adapter's generated configuration. If that happened it would affect `/private/**` too — the routes this whole feature depends on.

**Verify on a real Vercel preview deployment** that `curl -H 'Accept: text/markdown' <url>/` still returns markdown and that `/private/` still reaches the middleware. This cannot be checked locally: `astro preview` does not read `vercel.json`. If either fails, drop the `rewrites` and accept that the twins are reached only at their `.md` URLs on Vercel — the `.md` files are still emitted and still linked from the contextual menu, so the feature degrades rather than breaks. Record the outcome here.
