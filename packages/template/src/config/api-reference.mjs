/**
 * API references — the one file to edit.
 *
 * Each entry below becomes a route rendering one OpenAPI document with Scalar.
 * The routes, the sidebar, and the search index are all derived from this list,
 * so there is no second place to keep in sync.
 *
 * ## Where your document lives
 *
 * `spec` says where the document is, and it is the only field about the
 * document you must set. It takes a path relative to this project, or an
 * `http(s)://` URL. Everything else — the URL the reader's browser loads,
 * whether the build serves a copy — is derived from it by `specUrlFor()`:
 *
 * | `spec`                            | The browser loads                         |
 * | --------------------------------- | ----------------------------------------- |
 * | `./public/openapi.yaml`           | `/openapi.yaml` — `public/` is the root   |
 * | `../api/openapi.yaml`             | `/api-spec/<id>.yaml`, served by the build |
 * | `https://…/openapi.yaml`          | see `serve` below                         |
 *
 * A remote document is fetched at build time to generate the sidebar and the
 * search index, so it gets exactly the sidebar a bundled one does. `serve`
 * chooses how it reaches the reader's browser:
 *
 *   'snapshot' — (default) the build fetches it once and serves the copy from
 *                this site. No CORS requirement on the API host, and the
 *                reference cannot render blank because that host was down.
 *                The copy updates when you rebuild.
 *   'live'     — the reader's browser fetches the URL directly, so the
 *                reference always shows the current document. The host must
 *                allow cross-origin requests from this site.
 *
 * Either way the machine running the build must be able to reach the URL.
 *
 * `specUrl` is optional and rarely needed: set it and the browser loads that
 * value verbatim, with nothing derived and nothing served for you.
 *
 * ## The two layouts
 *
 * **`docs`** keeps the full Starlight page — same header, same sidebar, same
 * navigation as the rest of the documentation. Every operation is listed in
 * that sidebar, generated from the document, so the API and the prose share one
 * navigation tree. This is the right default for most sites.
 *
 * **`full`** hands the whole width to Scalar: Starlight's sidebar steps aside
 * and Scalar's own operation navigation takes over. Better for large documents
 * — Scalar's sidebar is virtualised, so it stays quick where a fully expanded
 * Starlight tree would not.
 *
 * ## Why two entries ship
 *
 * So you can see both layouts running on real content before choosing. They are
 * two different example APIs rather than one document shown twice, because a
 * control for flipping between layouts is not something a docs site should ship
 * to its readers.
 *
 * **Delete the one you do not want.** Remove its entry here and its file from
 * `public/`, and the route, its sidebar entries and its search entries all go
 * with it. Keeping both is also fine — plenty of products document more than
 * one API, and that is exactly what this list is for.
 *
 * To change a layout rather than remove it, set `layout` to `'docs'` or
 * `'full'`. Nothing else needs to change.
 */
import { isRemoteSpec } from '../lib/openapi-sidebar.mjs';

export { isRemoteSpec };

/** @typedef {'docs' | 'full'} ApiLayout */
/** @typedef {'snapshot' | 'live'} ServeMode */

export const apiReferences = [
	{
		id: 'payments',
		enabled: true,

		/**
		 * Path segment under `/api/`, or `''` for `/api/` itself.
		 *
		 * A slug rather than a full path because the route file lives at
		 * `src/pages/api/[...reference].astro` — everything it builds is under
		 * `/api/` whatever this says. Taking a slug makes that a fact of the API
		 * instead of a rule to remember, and `routeFor()` derives the one URL that
		 * the page, the sidebar and the search index all use.
		 */
		slug: '',

		/** @type {ApiLayout} */
		layout: 'docs',

		/**
		 * Where the document is: a path, or an `http(s)://` URL. See the header
		 * comment for what each kind does. Replace this file with your own to
		 * get started — nothing else needs to change.
		 */
		spec: './public/openapi.yaml',

		/** Sidebar group label, page `<title>`, and H1. */
		label: 'API reference',
		title: 'API reference',
		description:
			'Interactive reference for the Example Payments API, rendered with Scalar.',
	},
	{
		id: 'admin',
		enabled: true,
		slug: 'admin',
		/** @type {ApiLayout} */
		layout: 'full',
		spec: './public/openapi-admin.yaml',
		label: 'Admin API',
		title: 'Admin API',
		description:
			'Interactive reference for the Example Admin API, rendered full-width with Scalar.',
	},
];

/** References that are actually built, in declaration order. */
export const enabledReferences = apiReferences.filter((reference) => reference.enabled);

/**
 * The URL a reference is served at — the single source for the page, its
 * sidebar entries and its search anchors, so those three cannot disagree.
 */
export function routeFor(reference) {
	const slug = (reference.slug ?? '').replace(/^\/+|\/+$/g, '');
	return slug ? `/api/${slug}/` : '/api/';
}

/** The `serve` mode in effect, with the default applied. */
function serveModeFor(reference) {
	return /** @type {ServeMode} */ (reference.serve ?? 'snapshot');
}

/**
 * Where under the site root a `public/` path is served, or `null` when the
 * path is not under this project's `public/` — including when it is, but not
 * in a way a browser could actually request.
 *
 * Anchored, so `./not-public/x` and `../public/x` — a sibling project's
 * directory — do not match. Written for POSIX separators, which is how this
 * file is written on every platform.
 *
 * The captured remainder is also rejected if any segment is empty or `..`:
 * `./public//openapi.yaml` would otherwise derive `//openapi.yaml`, which a
 * browser resolves as a *protocol-relative* URL — a cross-origin request to a
 * host named `openapi.yaml` — and `public/../secret.yaml` would derive
 * `/../secret.yaml`, which normalises to `/secret.yaml`, outside `public/`
 * and not served by anything. Both read fine at build time (`readFile`
 * doesn't care), so without this check the build stays green and the
 * reference renders blank. Returning `null` here sends the reference through
 * rule 4 instead, which always works.
 */
function publicUrlFor(spec) {
	const match = /^(?:\.\/)?public\/(.+)$/.exec(String(spec));
	if (!match) return null;
	const segments = match[1].split('/');
	if (segments.some((segment) => segment === '' || segment === '..')) return null;
	return `/${match[1]}`;
}

/**
 * The file the build emits for a reference it serves itself: `<id>.<ext>`.
 *
 * The extension follows the source so the "Download OpenAPI Document" link
 * hands readers a sensibly named file; Scalar sniffs the content, so it is
 * cosmetic. Query strings on a URL are ignored when deciding.
 */
export function emittedFileFor(reference) {
	const source = String(reference.spec);
	// `isRemoteSpec` only checks the scheme, so `https://` and `https://[bad`
	// both reach here and `new URL` throws `TypeError: Invalid URL` on them —
	// an unattributed stack trace from inside this module, naming neither the
	// reference nor the field. The extension is cosmetic, so fall back to
	// reading it off the raw string; `validateReferences` reports the malformed
	// URL properly, by name.
	let path = source;
	if (isRemoteSpec(source)) {
		try {
			path = new URL(source).pathname;
		} catch {
			path = source;
		}
	}
	const extension = /\.json$/i.test(path) ? 'json' : 'yaml';
	return `${reference.id}.${extension}`;
}

/**
 * Must the build serve this document itself?
 *
 * True for the cases nothing else serves: a file outside `public/`, or a remote
 * document being snapshotted. False when the customer set `specUrl` (they are
 * serving it), when Astro serves it from `public/`, or when the browser goes
 * to the origin (`serve: 'live'`).
 */
export function needsEmit(reference) {
	if (reference.specUrl) return false;
	if (isRemoteSpec(reference.spec)) return serveModeFor(reference) === 'snapshot';
	return publicUrlFor(reference.spec) === null;
}

/**
 * The URL the reader's browser fetches the document from.
 *
 * Derived from `spec` so the two can never disagree — the failure this design
 * replaces was two hand-maintained fields for one document, where a remote
 * URL silently lost the sidebar and a file outside `public/` rendered blank.
 * Rules, first match wins: an explicit `specUrl`; a live remote URL; a
 * `public/` file at the site root; otherwise the file the build emits.
 *
 * Rules 3 and 4 are site-root-relative paths, so on a site built with a
 * `base` they need that `base` prefixed on or the browser requests the
 * unprefixed path and 404s — the same bug class `withBase()` in
 * `src/lib/auth/http.mjs` exists to prevent for redirects. Rules 1 and 2 are
 * left alone: an explicit `specUrl` is the customer's own string to get
 * right, and a remote URL is already absolute.
 *
 * `base` defaults to `import.meta.env.BASE_URL`, read lazily inside the
 * function rather than at module scope — `astro.config.mjs` imports this
 * module for `enabledReferences` and friends, and `import.meta.env` is not
 * necessarily populated at that point in the config loader. Reading it here,
 * only when a caller actually asks for a URL, keeps that import working. It
 * is also `undefined` outright under `node --test` (no Vite substitution), so
 * the optional chaining and fallback let the test suite call this with no
 * options and get the pre-`base` behaviour, or pass one explicitly to assert
 * the prefixed behaviour. `BASE_URL` may or may not carry a trailing slash
 * depending on `trailingSlash`, so this strips one the way `withBase()` does
 * rather than assuming either form.
 *
 * @param {object} [options]
 * @param {string} [options.base]
 */
export function specUrlFor(reference, { base = import.meta.env?.BASE_URL ?? '/' } = {}) {
	if (reference.specUrl) return reference.specUrl;
	if (isRemoteSpec(reference.spec) && serveModeFor(reference) === 'live') return reference.spec;
	const prefix = base.replace(/\/$/, '');
	const path = publicUrlFor(reference.spec) ?? `/api-spec/${emittedFileFor(reference)}`;
	return `${prefix}${path}`;
}

/**
 * Enabled references the build serves itself. The endpoint at
 * `src/pages/api-spec/[file].js` emits exactly these, and the tests read the
 * same list, so the two cannot disagree about what is in the build output.
 */
export const emittedReferences = enabledReferences.filter(needsEmit);

/**
 * Config mistakes with confusing symptoms, caught at build time by name.
 *
 * Each of these builds green and misbehaves quietly: two references on one
 * route leave one silently unreachable; two sharing an `id` collide on the
 * emitted file; `serve: 'live'` on a file would send the browser to a path it
 * cannot fetch. All are easy to introduce by copying an entry and changing one
 * field too few, so they are reported here rather than left to review.
 *
 * Exported so the tests can hand it bad lists; the module calls it on its own
 * list below.
 */
export function validateReferences(references) {
	const enabled = references.filter((reference) => reference.enabled);
	const routes = new Set();
	const ids = new Set();

	for (const reference of enabled) {
		// `id` names the file the build emits — `/api-spec/<id>.<ext>` — so a
		// slash in it silently nests that file one level down from the route the
		// page asks for, and `.` or `..` derives a path that resolves somewhere
		// else entirely. Both build green and 404 at runtime.
		if (!/^[A-Za-z0-9._-]+$/.test(String(reference.id)) || /^\.+$/.test(String(reference.id))) {
			throw new Error(
				`[api-reference] "${reference.id}" is not a usable \`id\`. It names the file this ` +
					`site serves the document from, so use letters, digits, dots, dashes or ` +
					`underscores — no slashes, and not "." or "..".`
			);
		}

		if (ids.has(reference.id)) {
			throw new Error(
				`[api-reference] Two references share the id "${reference.id}". ` +
					`Give each one a distinct \`id\`.`
			);
		}
		ids.add(reference.id);

		const route = routeFor(reference);
		if (routes.has(route)) {
			throw new Error(
				`[api-reference] Two references are configured at "${route}" ` +
					`("${reference.id}" is the second). Give each one a distinct \`slug\`.`
			);
		}
		routes.add(route);

		const serve = reference.serve;
		if (serve !== undefined && serve !== 'snapshot' && serve !== 'live') {
			throw new Error(
				`[api-reference] "${reference.id}" sets serve: '${serve}', which is not a mode. ` +
					`Use 'snapshot' (serve a copy the build fetched) or 'live' (the browser fetches the URL).`
			);
		}
		if (serve !== undefined && !isRemoteSpec(reference.spec)) {
			// Both modes, not just 'live'. `serve` decides how a *remote* document
			// reaches the browser, so on a file it does nothing — and accepting
			// 'snapshot' here while rejecting 'live' teaches the opposite, leaving
			// a customer who set it believing the build is snapshotting something.
			throw new Error(
				`[api-reference] "${reference.id}" sets serve: '${serve}' but its spec is a file, ` +
					`not a URL — serve only decides how a remote document reaches the browser. ` +
					`Remove serve, or point spec at the URL the browser should fetch.`
			);
		}

		if (isRemoteSpec(reference.spec)) {
			// Caught here so a malformed URL is reported by reference and field
			// rather than as a `TypeError: Invalid URL` from wherever it is first
			// parsed. `isRemoteSpec` only tests the scheme, so `https://` reaches
			// this point looking remote.
			try {
				new URL(reference.spec);
			} catch {
				throw new Error(
					`[api-reference] "${reference.id}" has a spec that starts like a URL but cannot ` +
						`be parsed as one: "${reference.spec}".`
				);
			}
		}
	}
}

validateReferences(apiReferences);

/**
 * Show each operation as its own sidebar link.
 *
 * Only for the `docs` layout: it is the one that keeps Starlight's sidebar on
 * screen, so without this there would be a single entry for the whole reference
 * and finding an endpoint would mean scrolling. Under `full`, Scalar's own
 * sidebar already lists every operation and a second copy in Starlight's would
 * be two navigation trees for one document.
 */
export function listsOperationsInSidebar(reference) {
	return reference.layout === 'docs';
}
