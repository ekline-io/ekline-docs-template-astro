# Markdown content negotiation on Vercel — design

**Date:** 2026-09-04, revised 2026-09-09 · **Jira:** not filed · **Status:** approved design, pre-plan

## What we are trying to accomplish

A request to any docs page with `Accept: text/markdown` gets that page's
Markdown twin back, at the same URL, on a Vercel deployment of the template —
out of the box, with nothing for the customer to configure.

```
GET /reference/errors/    Accept: text/markdown   →  200 text/markdown  (the twin)
GET /reference/errors/    Accept: text/html,…     →  200 text/html      (unchanged)
GET /reference/errors.md                          →  200 text/markdown  (unchanged)
```

The twins themselves, the `<link rel="alternate" type="text/markdown">` tags,
the contextual menu's deep links and `llms.txt` all work today and are not in
scope. Only the header-negotiated form is missing.

## Why it is missing, measured

The feature shipped on 2026-05-13 as two `rewrites` in `vercel.json`. On
2026-08-20 the template gained `@astrojs/vercel` for the logged-in experience;
the adapter emits Build Output API v3, whose generated
`.vercel/output/config.json` supersedes `vercel.json` routing entirely. The
rewrites went inert with no signal — CI stayed green — because nothing in the
repo ever sent the header: `tests/markdown-twins.test.mjs` excluded negotiation
from day one ("runs only at the Vercel edge — not exercised here"). Measured
on 2026-08-21 and removed; re-measured on 2026-09-04, same result on both the
template site and the docs site.

Two other things were measured or read on 2026-09-04 and rule out the obvious
alternatives:

- **Astro middleware cannot do it, even at the edge.** `@astrojs/vercel`'s
  `middlewareMode: 'edge'` docs: *"Static assets and prerendered pages are
  served from Vercel's filesystem and do not invoke your middleware."* Every
  docs page is prerendered.
- **Build Output API `routes` can.** A `Source` route accepts
  `has: [{ type: 'header', key: 'accept', value: … }]` with a `dest`, and routes
  placed before `{ handle: 'filesystem' }` are evaluated before static files
  are served. The adapter owns that file, so the fix goes there — not in
  `vercel.json`.
- **`vercel.json` rewrites cannot do it on an adapter-less build either — not
  supportably.** They worked in 1.x and would work on a build with no adapter
  today, but Vercel's Astro guide says: "You should not use `vercel.json` to
  rewrite URL paths with astro projects; doing so produces inconsistent
  behavior, and is not officially supported." A template does not ship a
  mechanism its platform disowns. (The first draft of this design did; see
  *One mechanism* below.)
- **Vercel Routing Middleware could, at a price this feature does not
  justify.** It is Vercel's named mechanism for rewrites with Astro and runs
  before the cache. But its `config.matcher` is path-only — it cannot be
  scoped to requests whose `Accept` mentions Markdown — so a root
  `middleware.ts` would invoke a function on every page view, browsers
  included, to serve the few that negotiate; the routing config does the
  same header check for free. It would also sit beside `src/middleware.ts`,
  the auth guard, as a second file called middleware with different
  semantics. And whether Vercel honours it at all when the adapter emits its
  own Build Output is asserted only by a page that still documents Astro 3
  option names. Set aside; it is the named fallback if the spike shows that
  routes placed before the filesystem handle do not fire.

A side finding worth keeping: the original `vercel.json` used
`"value": "text/markdown"`, which Vercel matches as a full-string regex. It
would only ever have matched a bare `Accept: text/markdown`; a realistic
agent header like `text/markdown, text/plain;q=0.9, */*;q=0.8` would have
fallen through to HTML even when the rewrites were live.

## Design

### One mechanism, and the adapter is its prerequisite

The integration edits the routing config that `@astrojs/vercel` emits, so it
needs the adapter present — on every Vercel deployment, including a site with
nothing rendered on demand. That is not a requirement this feature invents:
Vercel's own Astro guide says the adapter is how *any* Vercel feature reaches
a static Astro site ("a static Astro site with Vercel features like Web
Analytics and Image Optimization … you must add Astro's Vercel adapter").
Negotiation is a Vercel feature; same rule. With every page prerendered the
output is still entirely static on the CDN; the adapter only changes the
directory it lands in and the file that routes it.

So there is one mechanism, and three consumers of it:

| Deployment | Adapter | Gets negotiation from |
| --- | --- | --- |
| The template as shipped | `@astrojs/vercel` on Vercel, `@astrojs/node` elsewhere | The integration, registered in `astro.config.mjs` |
| The template after the *Don't need private docs?* removal path | `@astrojs/vercel` on Vercel, none elsewhere | The same integration. The removal instructions change from "uninstall both adapters" to "uninstall `@astrojs/node`; keep `@astrojs/vercel` if you deploy to Vercel" |
| `apps/docs` | `@astrojs/vercel` on Vercel, none elsewhere | The same integration, imported from `packages/template` across the monorepo — the way the site already reads the template's wiki. One copy of the code |

**What the first draft got wrong.** It gave adapter-less builds a second
mechanism, `vercel.json` `rewrites`, because those worked in 1.x. Vercel's
Astro guide says not to: "You should not use `vercel.json` to rewrite URL
paths with astro projects; doing so produces inconsistent behavior, and is not
officially supported." The wiki had recorded that sentence when the 1.x
rewrites were removed; the draft dropped it. And the second mechanism was
worse in a way a reader would have met: `vercel.json` cannot express "only
pages with a twin", so a Markdown request for a page without one — every
`/internals/**` page on the docs site, which renders from the wiki collection
and has no `.md` — would have answered 404 where the integration falls back
to HTML. One mechanism means one behaviour everywhere, and a mechanism the
platform stands behind.

### The integration (adapter builds)

One file, `src/lib/vercel-markdown-negotiation.mjs`, registered in
`astro.config.mjs`'s `integrations` array with a comment. A customer sees it
where every other piece of site configuration lives, and removes it by
deleting one line. No `package.json` change, no `scripts/` directory.

**Ordering, and why the file is shaped the way it is.** Astro pushes the
adapter onto the *end* of the integrations list during config setup, so a
plain integration's `astro:build:done` runs before the adapter has written
`config.json`. The integration therefore does its work through an inner
integration that it registers via `updateConfig({ integrations })` during
`astro:config:setup` — integrations added that way land after the adapter,
and their `astro:build:done` runs after it. This is documented Astro
behaviour (Starlight itself adds integrations this way), but it is
non-obvious, so the file says why, and Task 0 of the plan verifies it on a
real `VERCEL=1` build before anything is built on top of it.

**It never silently no-ops on Vercel.** If `VERCEL` is set and
`.vercel/output/config.json` is absent when the hook runs, that is the
ordering assumption failing — the integration throws with a message naming
this section, rather than shipping a deployment that quietly lacks the
feature. Off Vercel (Node adapter, `npm test`, `astro preview`) there is no
`.vercel/` directory and the hook returns early; local builds are untouched.

**Exactly which URLs negotiate.** A *twin* is a `.md` file in the static
output that has an HTML page at the corresponding route: `<slug>.md` beside
`<slug>/index.html`, and `index.md` beside `index.html`. The set is read from
the emitted static directory — the same ground truth `markdown-twins.test.mjs`
checks — not from a route list. Anything without a twin (the Scalar `/api/**`
pages, any custom `.astro` page a customer adds, every on-demand route under
`/private/**` and `/auth/**`) is simply not in the set and falls through to
whatever it served before. The integration can only ever rewrite to a path
that is already served statically, so it cannot widen exposure;
`private-leaks.test.mjs` continues to guarantee no private twin exists to be
rewritten to.

**Four routes, whatever the page count.** Inserted immediately before
`{ handle: 'filesystem' }`, in this order:

```jsonc
// 1. Vary on the HTML side too, or a cached HTML response can be served to a
//    markdown request. `continue` so routing carries on to the rewrite.
{ "src": "^/(<slug-1>|<slug-2>|…)/?$", "headers": { "Vary": "Accept" }, "continue": true },
{ "src": "^/$",                         "headers": { "Vary": "Accept" }, "continue": true },

// 2. The rewrite. One route, an alternation of every twin slug.
{ "src": "^/(<slug-1>|<slug-2>|…)/?$",
  "has": [{ "type": "header", "key": "accept", "value": "<contains text/markdown>" }],
  "dest": "/$1.md",
  "headers": { "Vary": "Accept" } },

// 3. The root, which has no slug to capture.
{ "src": "^/$",
  "has": [{ "type": "header", "key": "accept", "value": "<contains text/markdown>" }],
  "dest": "/index.md",
  "headers": { "Vary": "Accept" } }
```

One route per twin was the first design and was rejected: it scales
`config.json` with page count, and Vercel's routing has ceilings a 500-page
site would find. The alternation keeps the exact-set semantics with a
constant route count. Slugs are regex-escaped; if Vercel turns out to cap
`src` length (unknown — a spike probe), the contingency is chunking the
alternation into a few routes of *n* slugs each, which changes nothing else.

**What "wants Markdown" means.** The `Accept` header contains `text/markdown`
as a complete media-type token — `text/markdown`, `text/markdown;q=0.9`,
`text/plain, text/markdown, */*` all match; `text/markdownx` does not. Written
so it works whether or not Vercel anchors the match (another spike probe); the plain string form of `value`, not the newer `{ re }` object, because it has years of production behind it. Quality
values are not evaluated — Build Output routing cannot — so
`text/html, text/markdown;q=0.1` would negotiate to Markdown. No browser or
known agent sends that; it is a documented limit, not a bug to fix.

**Rewrite, not redirect, and the price of it.** This restores the original
intent exactly: one canonical URL, two representations, no extra hop. It
depends on Vercel's CDN honouring `Vary: Accept` end to end. If it does not,
the failure is not graceful — a cached Markdown body served to a browser
breaks the page — which is why the spike below proves it before this ships,
and why the fallback is decided in advance: the same routes with
`"status": 307` and `"headers": { "Location": "/$1.md" }` in place of `dest`.
Redirects cache per URL and cannot poison. Known cost of the rewrite even when
Vary works: the CDN keys negotiable pages by `Accept` string, so Chrome,
Firefox, Safari and curl each warm their own copy. Modest for a docs site.

### If you removed the logged-in experience

The integration has nothing to edit without `@astrojs/vercel`, so the removal
path keeps it: uninstall `@astrojs/node` and `jose`, and leave the adapter
line as `adapter: process.env.VERCEL ? vercel() : undefined`. Off Vercel that
is a plain static build into `dist/`; on Vercel it is Build Output with every
page prerendered, and the integration works unchanged. `apps/docs` is exactly
that configuration, built and deployed, which is what keeps the removal
instructions honest.

### Where this wants to live eventually

`@ekline/starlight-contextual-menu` *generates* the twins, so it already knows
the exact set — no static-directory walk — and every consumer of the plugin
would get negotiation, not only this template. That is the right long-term
home. The transform is written as a pure function with no Astro or filesystem
dependency so it lifts across unchanged; moving it is a separate piece of
work in a separate repository and is not part of this one. A `routes`
passthrough upstream in `@astrojs/vercel` would make the integration a
one-line option; worth an issue, not worth waiting for.

## Testing plan

The break this fixes went undetected for three months because the one part of
the feature that only existed on Vercel was the one part no test reached.
The plan below is built around not repeating that: every layer says what it
can and cannot see.

### Layer 1 — unit, hermetic, in `npm test`

`tests/markdown-negotiation.test.mjs`, `node --test`, no network, no build.

The transform is a pure function `withMarkdownNegotiation(config, twins)` over
a parsed `config.json` and a list of twin paths. Tests run it against a
**captured fixture** — a real `config.json` from an actual `VERCEL=1 astro
build`, committed under `tests/fixtures/`, so the tests exercise the adapter's
real shape rather than an imagined one. Assertions:

- Routes are inserted immediately before `{ handle: 'filesystem' }`; every
  adapter route is preserved, in its original order, before and after.
- Exactly four routes are added regardless of how many twins are passed
  (1, 40, 1000).
- `/api/**`, `/private/**` and any path without a twin do not appear in the
  alternation.
- Root is handled by its own route; `/` never captures into `$1`.
- Slugs containing regex metacharacters are escaped (a `.` in a slug does not
  become a wildcard).
- `Vary: Accept` is present on the `continue` route, the rewrite route and the
  root route.
- The Accept matcher, tested as a regex against real headers: matches bare
  `text/markdown`, `text/markdown;q=0.9`, `text/markdown, text/plain;q=0.9,
  */*;q=0.8`, `text/plain, text/markdown`; rejects Chrome's, Firefox's, and
  Safari's default `Accept`, curl's `*/*`, and `text/markdownx`.
- The twin-discovery function, run against a temp directory: `<slug>.md` with
  `<slug>/index.html` is a twin; a stray `.md` with no HTML sibling (a
  `public/README.md`) is not; `index.md` beside `index.html` is the root twin.
- The hook's guard: with `VERCEL` set and no `config.json`, it throws with a
  message that names the wiki section; without `VERCEL`, it returns without
  touching the filesystem.

What this layer cannot see: whether Vercel's router actually evaluates these
routes the way the documentation says. That is Layer 3's job.

### Layer 2 — build-output, in `npm test`, adapter build only

Extends `tests/markdown-twins.test.mjs` rather than adding a file. When the
build output is `.vercel/output/` (i.e. `VERCEL=1` was set), additionally:

- `config.json` contains the four routes, before the filesystem handle.
- Every slug in the alternation resolves to a `.md` in `static/` **and** an
  `index.html` at the route — the same resolution the alternate-link test
  already does, now for the route table.
- No slug under `api/` or `private/`.

CI runs the Node-adapter build today, so this layer is exercised only when
someone builds with `VERCEL=1` — which the Vercel build itself does, via
`buildCommand: npm test`. That makes it a *deploy* gate: a build whose
`config.json` lacks the routes fails on Vercel before it goes live. The plan
also adds a `VERCEL=1` build to CI, in both projects, so the gate runs on
every PR, not only at deploy time; the assertions are the same, only the
trigger differs.

### Layer 3 — deployed smoke test, opt-in, against a real URL

`tests/deployed-smoke.test.mjs`, `node --test`, enabled only when
`DOCS_SMOKE_URL` is set; **skipped, not failed, when unset**, so `npm test`
stays hermetic. Runs against a preview or production URL of either the
template site or the docs site, and is the only layer that can observe the
CDN.

| # | Request | Expect |
| --- | --- | --- |
| 1 | `/` with `Accept: text/markdown` | 200, `text/markdown`, body starts `# ` |
| 2 | A docs page with `Accept: text/markdown` | same |
| 3 | Same page with `text/markdown, text/plain;q=0.9, */*;q=0.8` | `text/markdown` — the realistic agent header |
| 4 | Same page with Chrome's default `Accept` | `text/html` |
| 5 | Same page with `*/*` (curl's default) | `text/html` |
| 6 | A page with no twin — the template's `/api/**`, the docs site's `/internals/**` — with `Accept: text/markdown` | `text/html`, **not 404**: the route table is the exact twin set, and anything outside it is untouched |
| 7 | Every response in 1–5 | carries `Vary: Accept` |
| 8 | **The Vary gate.** A page not yet fetched: HTML, then Markdown, then HTML; and on a second page, the reverse order. Assert each body matches its `Accept` on every request **including those with `x-vercel-cache: HIT`** | no cross-served body in either order |
| 9 | The page's `.md` twin, fetched directly | 200, `text/markdown` — the existing contract, unchanged |
| 10 | `/private/` with `Accept: text/markdown` | the guard's own answer (redirect or 404), never `200 text/markdown` |

Row 8 is the go/no-go for the rewrite design. If it fails on the spike
deployment, the routes switch to 307 (one field), the row is rewritten to
expect a redirect to the twin, and the rest of the table stands.

What this layer costs: it needs a deployment, so it cannot run in a plain
`npm test`. It is run by hand against the spike preview, then wired to run
automatically on Vercel's `deployment_status` webhook so it gates every
preview — that wiring is the last task in the plan and the only one that may
be deferred without leaving the feature untested.

### What is deliberately not tested

- q-value ordering (`text/html, text/markdown;q=0.1`) — documented limit.
- Node-adapter negotiation — out of scope (below).

## Sequence

The unknowns are answered before production code depends on them:

1. **Task 0, local:** install, `VERCEL=1 astro build`, capture `config.json`
   as the fixture, confirm the inner-integration ordering with a logging stub,
   confirm the `dir` the hook receives and where the twins are.
2. **Spike deployment:** the minimal integration on a branch, pushed for a
   preview. Run Layer 3 by hand. This answers: does a pre-filesystem route
   fire on a prerendered page; is `Vary` honoured (row 8); is `re` anchored;
   is there a `src` length cap. Nothing built so far is thrown away if it
   works, and the 307 fallback is a one-field change if it does not.
3. **Build the rest against known facts:** Layers 1 and 2, `apps/docs`'s
   adapter and integration, the wiki rewrite, the customer-facing docs, the
   CHANGELOG, CI.
4. **Layer 3 automation.**

## Files

**`packages/template`**

- `src/lib/vercel-markdown-negotiation.mjs` — the integration and the pure
  transform. New.
- `astro.config.mjs` — one entry in `integrations`, with a comment.
- `tests/markdown-negotiation.test.mjs` — Layer 1. New.
- `tests/fixtures/vercel-config.json` — captured `config.json`. New.
- `tests/markdown-twins.test.mjs` — Layer 2 additions; header comment
  rewritten (it currently says negotiation "is gone").
- `tests/deployed-smoke.test.mjs` — Layer 3. New.
- `wiki/private-docs.md` — *Resolved: `vercel.json` rewrites do not work with
  the adapter* is rewritten: its measurement stands, its conclusion ("cannot
  bring the rewrites back") does not. The static-path alternative goes beside
  the *Don't need private docs?* material.
- `CHANGELOG.md` — a minor release: a feature, no output move.
- `README.md` — a line under the Markdown/AI feature bullet.

**`apps/docs`**

- `astro.config.mjs` — `adapter: process.env.VERCEL ? vercel() : undefined`,
  and the integration imported from
  `../../packages/template/src/lib/vercel-markdown-negotiation.mjs`, the way
  the site already reads the template's wiki. One copy of the code.
- `package.json`, `package-lock.json` — `@astrojs/vercel`, the template's
  version range. A second copy in a second lockfile, on purpose: the projects
  are independent (root `CLAUDE.md`, *No npm workspaces*).
- `tests/markdown-twins.test.mjs` — the same Layer 2 additions as the
  template's, with `internals/` as the twin-less prefix; header comment
  rewritten.
- `tests/deployed-smoke.test.mjs` — Layer 3, with an `/internals/**` page as
  the twin-less row and no `/private/` row. New.
- `src/content/docs/search-and-ai.md` — the customer-facing description:
  what it does, that it needs the adapter, the q-value limit.
- `src/content/docs/removing-features.md` — keep `@astrojs/vercel` on
  Vercel.

**Repo root**

- `.github/workflows/ci.yml` — a `VERCEL=1` build in both jobs so Layer 2 runs
  on PRs; the `deployment_status` job for Layer 3.
- `npm run check:shipped` must stay green: no monorepo path in anything under
  `packages/template`.

## Non-goals

- **Node / self-hosted negotiation.** The standalone server serves prerendered
  pages from disk under the same constraint; Astro middleware does not see
  them. A different mechanism (a proxy rule, or serving twins from an
  on-demand endpoint) — noted in the wiki, not built.
- **Negotiating `llms.txt` or anything that is not a page twin.**
- **Moving the transform into `@ekline/starlight-contextual-menu`.** Written
  so it can be; not done here.
- **Routing Middleware.** Evaluated and set aside for its per-request cost
  (*Why it is missing, measured*). It is the named fallback if the spike shows
  routes ahead of the filesystem handle do not fire — not a second
  implementation.
