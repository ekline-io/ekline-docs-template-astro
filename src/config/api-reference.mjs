/**
 * API reference configuration — the one file to edit.
 *
 * The reference is rendered by Scalar and ships in two views. Everything about
 * them is declared here: which ones exist, which is canonical, what they are
 * called, and where the OpenAPI document comes from. The routes, the sidebar,
 * and the switcher a reader sees are all derived from this object, so there is
 * no second place to keep in sync.
 *
 * ## The two views
 *
 * **`docs`** keeps the full Starlight page — same header, same sidebar, same
 * navigation as the rest of the documentation. Every operation appears in that
 * sidebar (generated from your document), so the API and the prose share one
 * navigation tree. Best for most sites.
 *
 * **`full`** hands the whole width to Scalar: Starlight's sidebar steps aside
 * and Scalar's own operation navigation takes over. Better for very large
 * documents — Scalar's sidebar is virtualised, so it stays quick where a fully
 * expanded Starlight tree would not.
 *
 * ## Common edits
 *
 * - Point at your own document: change `spec` and `specUrl` together.
 * - Ship only one view: set the other's `enabled` to `false`. The route stops
 *   being built and the switcher disappears on its own.
 * - Change which view `/api/` serves: move `default: true`.
 */

/** @typedef {'docs' | 'full'} ApiViewId */

export const apiReference = {
	/**
	 * The OpenAPI document, as a path on disk. Read at build time to generate
	 * the sidebar's operation list.
	 */
	spec: './public/openapi.yaml',

	/**
	 * The same document, as the URL the browser fetches it from. Scalar loads it
	 * client-side, so this must resolve on the deployed site.
	 *
	 * Anything under `public/` is served from the site root, which is why these
	 * two point at the same file by different names. Swap in a fully-qualified
	 * URL to render a document you host elsewhere.
	 */
	specUrl: '/openapi.yaml',

	/**
	 * The views to build. Order here is the order they appear in the switcher.
	 *
	 * Exactly one view must be `default: true` — it is served at `/api/`, and
	 * every generated sidebar link points into it. Others are served at
	 * `/api/<slug>/`.
	 */
	views: [
		{
			id: /** @type {ApiViewId} */ ('docs'),
			enabled: true,
			default: true,
			slug: undefined,
			/** Shown in the switcher. */
			label: 'Docs view',
			/** The page's `<title>` and H1. */
			title: 'API reference',
			description:
				'Interactive reference for the Example Payments API, rendered with Scalar.',
		},
		{
			id: /** @type {ApiViewId} */ ('full'),
			enabled: true,
			default: false,
			slug: 'full',
			label: 'Full width',
			title: 'API reference',
			description: 'The full-width API reference, with Scalar’s own navigation.',
		},
	],

	/**
	 * Show readers a control for switching between the views.
	 *
	 * Ignored unless more than one view is enabled — a switcher with a single
	 * option is just clutter.
	 */
	showViewSwitcher: true,

	/** Label for the sidebar group holding the generated operation list. */
	sidebarLabel: 'API reference',

	/** Show each operation's HTTP method beside its sidebar link. */
	sidebarBadges: true,
};

/** Views that are actually built, in declaration order. */
export const enabledViews = apiReference.views.filter((view) => view.enabled);

/**
 * The view served at `/api/`, or `undefined` when every view is disabled.
 *
 * Falls back to the first enabled view if nothing is marked default, so a
 * mis-edit degrades to a working site rather than a build with no reference.
 */
export const defaultView =
	enabledViews.find((view) => view.default) ?? enabledViews[0];

// Two views claiming `default: true` is a config mistake with confusing
// symptoms — `find` silently picks the first, so the other never gets the route
// it declares and, if it was the intended default, never gets indexed either.
// Cheaper to say so at build time than to debug a missing page later.
if (enabledViews.filter((view) => view.default).length > 1) {
	console.warn(
		'[api-reference] More than one view is marked `default: true`; using ' +
			`"${defaultView?.id}". Exactly one view should be the default.`
	);
}

/**
 * Route a view is served at, e.g. `/api/` or `/api/full/`.
 *
 * Non-default views fall back to their `id` when no `slug` is set, so two views
 * can never collide on `/api/` and silently overwrite each other.
 *
 * Throws when handed nothing, rather than returning `/api/` for a view that was
 * never built: with every view disabled, `defaultView` is `undefined`, and
 * `undefined === defaultView` would quietly hand back a route that
 * `getStaticPaths` does not generate — a sidebar full of links to a 404.
 * Callers should check `enabledViews.length` first.
 */
export function routeFor(view) {
	if (!view) {
		throw new Error(
			'[api-reference] routeFor() needs a view. Every view is disabled — ' +
				'check `enabledViews.length` before asking for a route.'
		);
	}
	if (view === defaultView) return '/api/';
	return `/api/${view.slug ?? view.id}/`;
}
