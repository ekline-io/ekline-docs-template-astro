/**
 * Classify a pathname for the auth middleware.
 *
 * This is the single rule deciding which URLs are protected. `src/middleware.ts`
 * acts on the result: `public` and `auth` pass through untouched, `private`
 * requires a valid session, `org` requires a valid session *and* membership of
 * that specific org.
 *
 * - `auth`    → `/auth/**` (SSO callback and logout; never guarded, or the
 *               callback could not run to create a session)
 * - `org`     → `/private/orgs/<org>/**` (requires login AND org membership)
 * - `private` → everything else under `/private/**` (requires login)
 * - `public`  → everything else (the middleware does not touch it)
 *
 * Pure and dependency-free so it can be unit-tested under `node --test`
 * without an Astro runtime. The middleware is the only other consumer.
 *
 * ## Pass `context.originPathname`, not `context.url.pathname`
 *
 * The contract is narrower than "a pathname", and the difference is a silent
 * content leak rather than a bug you would notice. **The argument must be the
 * same string Astro matches routes against**, which on an `APIContext` is
 * `context.originPathname` — base-stripped, `decodeURI`'d, leading slashes
 * collapsed. `context.url.pathname` is a *different* normalisation of the same
 * request, and the two disagree in ways that unguard real pages. Measured
 * against Astro 6.3.1, sending raw request lines to a built Node-adapter app:
 *
 * | request | `url.pathname` | `originPathname` | Astro renders |
 * | --- | --- | --- | --- |
 * | `/docs/private/secret/` (`base: '/docs'`) | `/docs/private/secret/` | `/private/secret/` | the private page |
 * | `/private/orgs/%252e%252e/x/` | `/private/x/` | `/private/orgs/%2e%2e/x/` | the **org** route, `org` = `%2e%2e` |
 *
 * Row one is the serious one: classified from `url.pathname` that request is
 * `public`, the middleware never runs a session check, and the private page is
 * served to anyone. It costs a customer nothing more than setting `base` —
 * ordinary for a docs site deployed under a subpath. Row two is milder but the
 * same shape: `url.pathname` loses a segment (assigning a decoded path back to
 * `URL.pathname` re-runs the parser, which resolves the newly revealed `%2e%2e`
 * dot segment), so an org URL is classified as merely private and the
 * membership check is skipped.
 *
 * `originPathname` matched what the router actually saw in every non-rewrite
 * probe case, under both `astro build` and `astro dev`. It also applies the
 * site's `trailingSlash` setting, which is why every rule below accepts a
 * segment with or without its trailing slash.
 *
 * ### Rewrites are the exception, and this input fails open on them
 *
 * Astro re-enters the **entire user middleware chain** after any rewrite
 * (`core/rewrites/handler.js` → `Rewrites.execute` → `middleware.handle(...)`)
 * and pins `originPathname` to the *pre-rewrite* path for that second pass.
 * This is Astro's automatic behaviour, not a pattern a middleware author opts
 * into or can decline: the rewrite may be issued by a page or by a third-party
 * integration, and the chain re-runs either way. Measured on the same harness,
 * with a public `/brochure` page calling `Astro.rewrite('/private/secret/')`:
 *
 *     [MW] {"url":"/brochure",        "origin":"/brochure/", "cls":"public"}
 *     [MW] {"url":"/private/secret/", "origin":"/brochure/", "cls":"public"}
 *     → HTTP 200, body: PRIVATE-CONTENT
 *
 * On that second pass the guard is handed a public path while the private route
 * renders: the `base` row above with the safe and unsafe inputs swapped, and
 * failing open rather than closed. It is latent in this template today —
 * nothing in `src/`, Starlight, Scalar, the contextual menu, llms-txt or either
 * adapter calls `rewrite()` — but one future rewrite into `/private/**` opens
 * it. Closing it belongs to the middleware, not to this function: it needs the
 * route Astro actually settled on (`context.routePattern`) as well as the path
 * the reader asked for. Neither input alone is sufficient in both directions.
 *
 * ## Why there is no decoding, traversal handling or slash collapsing here
 *
 * Not because it is someone else's problem, but because doing it here would
 * *create* the divergence this file exists to avoid: a guard that normalises
 * its input differently from the router is reading a different URL than the one
 * being served. Astro has already done the work by the time we are called —
 * `new URL()` resolves `.` and `..` (including their `%2e` spellings, and
 * backslash separators) before any pathname exists, and Astro decodes and
 * collapses leading slashes before both route matching and `originPathname`.
 * `tests/auth-guards.test.mjs` pins those platform behaviours so they fail
 * loudly if they ever change, rather than quietly. A fail-closed
 * `startsWith('//')` rule was considered and rejected on the same grounds:
 * `originPathname` has already collapsed those, so it would guard a shape that
 * cannot arrive, at the cost of a rule that is harder to audit.
 *
 * Matching is case-sensitive for the same reason: Astro builds route patterns
 * with `new RegExp(...)` and no `i` flag, so `/PRIVATE/secret/` reaches no
 * route (verified: 404). Guarding it would protect a URL that does not exist.
 *
 * ## Why a strange org slug is returned as-is
 *
 * Whatever comes back as `org` is compared against the session's org list by
 * the middleware, and Astro's `getParams` does not decode, so that value is
 * *byte-identical* to the `params.org` the page will receive. A slug that is
 * odd — percent-encoded, `.`, `..`, containing `%2f` — therefore fails the
 * membership check and 404s, which is the outcome we want.
 *
 * Repairing such a slug would invert that. Falling back to `{ type: 'private' }`
 * when a slug "looks wrong" would let any logged-in reader clear the guard and
 * land on the org route with no org check at all. A malformed org must stay a
 * failed org check, never become a passed private one.
 */

/**
 * @typedef {{ type: 'public' } | { type: 'auth' } | { type: 'private' } | { type: 'org', org: string }} PathClass
 */

/**
 * @param {string} pathname Astro's `context.originPathname` — see above. Passing
 *   `context.url.pathname` instead is a bypass on any site with a `base` set.
 * @returns {PathClass}
 */
export function classifyPath(pathname) {
	if (pathname === '/auth' || pathname.startsWith('/auth/')) return { type: 'auth' };
	const org = pathname.match(/^\/private\/orgs\/([^/]+)(?:\/|$)/);
	if (org) return { type: 'org', org: org[1] };
	if (pathname === '/private' || pathname.startsWith('/private/')) return { type: 'private' };
	return { type: 'public' };
}
