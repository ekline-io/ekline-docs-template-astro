/**
 * API references — the one file to edit.
 *
 * Each entry below becomes a route rendering one OpenAPI document with Scalar.
 * The routes, the sidebar, and the search index are all derived from this list,
 * so there is no second place to keep in sync.
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

/** @typedef {'docs' | 'full'} ApiLayout */

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

		/** The document on disk, read at build time to generate the sidebar. */
		spec: './public/openapi.yaml',
		/**
		 * The same document as the browser fetches it. Scalar loads it
		 * client-side, so this must resolve on the deployed site. Anything under
		 * `public/` is served from the site root, which is why these two point at
		 * one file by different names.
		 */
		specUrl: '/openapi.yaml',

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
		specUrl: '/openapi-admin.yaml',
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

// Two references on one route is a config mistake with a confusing symptom:
// both build to the same path, the sidebar grows two entries pointing at one
// page, and whichever document loses is silently unreachable. Easy to introduce
// by copying an entry and forgetting to change the slug, so say so at build
// time rather than leaving it to be noticed in review.
{
	const seen = new Set();
	for (const reference of enabledReferences) {
		const route = routeFor(reference);
		if (seen.has(route)) {
			throw new Error(
				`[api-reference] Two references are configured at "${route}" ` +
					`("${reference.id}" is the second). Give each one a distinct \`slug\`.`
			);
		}
		seen.add(route);
	}
}

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
