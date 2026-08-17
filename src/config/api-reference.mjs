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

		/** Route the reference is served at. Must start and end with a slash. */
		route: '/api/',

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
		route: '/api/admin/',
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
