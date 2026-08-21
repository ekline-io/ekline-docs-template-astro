/**
 * The HTML and URL primitives the auth surface shares.
 *
 * Small, but each of these existed in two spellings before it lived here, and
 * every one of them is load-bearing in a way that makes a second spelling a
 * defect rather than a nuisance:
 *
 * - `escapeHtml` guards attacker-reachable pages in both `src/middleware.ts`
 *   and `/auth/callback`. Two copies drift, and only one gets hardened.
 * - `notFound` has to render *identically* for "this org does not exist" and
 *   "you are not in this org", or the difference is an org-existence oracle.
 *   That is a guarantee about bytes, so it cannot survive being written out
 *   three times.
 * - `withBase` is the one that was actually wrong twice: `context.redirect()`
 *   writes `Location` verbatim (astro/dist/core/middleware/index.js:38-44), so
 *   every hardcoded `/private/` and `/` in a redirect target silently dropped
 *   the configured `base`.
 *
 * No `astro:env` import here, deliberately: this stays importable from the
 * route files and from anything that does not want the server-only config.
 */

/** The five characters that can break out of text content or a quoted attribute. */
const HTML_ESCAPES = /** @type {Record<string, string>} */ ({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
});

/**
 * Escape a string for interpolation into HTML text or a quoted attribute.
 *
 * `Record<string, string>` rather than the inferred literal type: TypeScript
 * narrows a literal's keys to exactly those five, which makes indexing with an
 * arbitrary `string` `string | undefined` and stops `String#replace` accepting
 * it. What actually guarantees every lookup hits is the character class below
 * matching nothing the table lacks — a property of reading the two together,
 * which the key type was never proving.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Prefix a site-absolute path with the configured `base`.
 *
 * Astro serves every route under `base`, but `context.redirect()` does not
 * apply it — it sets `Location` to exactly the string it is given. So any
 * literal redirect target has to be run through this or it points off the site
 * on a subpath deployment. (Starlight's sidebar is the exception that makes
 * this easy to forget: it *does* apply `base` to explicit `link` items, via
 * `makeSidebarLink` → `formatPath`, so sidebar links need no help.)
 *
 * `BASE_URL` is `/` when no base is set, and may or may not carry a trailing
 * slash depending on `trailingSlash`, so the join normalises rather than
 * assuming.
 *
 * @param {string} path A site-absolute path, starting with `/`.
 * @returns {string}
 */
export function withBase(path) {
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	return `${base}${path}`;
}

/** The site root, `base` included — where logging out sends the reader. */
export function siteRoot() {
	return withBase('/');
}

/**
 * The bare 404 served for everything the guard refuses.
 *
 * Deliberately not the site's styled 404: this answers org names that do not
 * exist *and* org names the reader may not have, and a signed-in reader asking
 * for a private page that is not there. All three must be byte-identical, or
 * the difference between them is information about what exists.
 *
 * @returns {Response}
 */
export function notFound() {
	return new Response('<!doctype html><title>404</title><h1>404 — Not found</h1>', {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': NO_STORE },
	});
}

/** `private` for the intermediaries that only honour that; `no-store` for the rest. */
export const NO_STORE = 'private, no-store';
