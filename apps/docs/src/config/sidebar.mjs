import { listWikiEntries } from '../loaders/wiki.mjs';

/**
 * The sidebar, as data.
 *
 * IA order, top to bottom: Get started, Configure, API reference, The
 * logged-in experience, Reference, Internals (Internals always stays last).
 * A Starlight sidebar entry that names a `slug` fails the build if that slug
 * isn't in the `docs` collection, so each entry below points at a page that
 * actually exists under `src/content/docs/`.
 *
 * Internals is different: it comes from the `wiki` collection, not `docs`
 * (see `src/loaders/wiki.mjs`), so its entries can never use `{ slug }` —
 * that only resolves against `docs`. `{ link }` entries instead, built from
 * the same `listWikiEntries()` the loader uses, so a new wiki file picks up
 * a sidebar entry automatically instead of needing one hand-added here.
 */
export const docsSidebarGroups = [
	{
		label: 'Get started',
		items: [
			{ label: 'Quickstart', slug: 'quickstart' },
			{ label: 'Deploy', slug: 'deploy' },
		],
	},
	{
		label: 'Configure',
		items: [
			{ label: 'Site basics', slug: 'site-basics' },
			{ label: 'Branding and theming', slug: 'branding' },
			{ label: 'Navigation and the sidebar', slug: 'navigation' },
			{ label: 'Writing content', slug: 'writing-content' },
			{ label: 'Search and AI', slug: 'search-and-ai' },
		],
	},
	{
		label: 'API reference',
		items: [
			{ label: 'API reference', slug: 'api-reference' },
			{ label: 'Customizing the API reference', slug: 'api-reference-appearance' },
		],
	},
	{
		label: 'The logged-in experience',
		items: [
			{ label: 'How it works', slug: 'how-it-works' },
			{ label: 'Setting it up', slug: 'sso-setup' },
			{ label: 'Trying it without SSO', slug: 'demo-login' },
			{ label: 'Writing private and per-org content', slug: 'private-content' },
		],
	},
	{
		label: 'Reference',
		items: [
			{ label: 'Environment variables', slug: 'environment-variables' },
			{ label: 'Commands', slug: 'commands' },
			{ label: "Removing what you don't need", slug: 'removing-features' },
		],
	},
	{
		label: 'Internals',
		items: listWikiEntries().map(({ id, title }) => ({
			label: title,
			link: `/internals/${id}/`,
		})),
	},
];

// Not part of `docsSidebarGroups` and not wired into `astro.config.mjs`'s
// `sidebar` yet, so the "points at a page that exists" guarantee above does
// not cover it: there is no `changelog` page under `src/content/docs/` today.
// Add that page before wiring this in, or the build fails the same way an
// entry inside `docsSidebarGroups` would.
export const changelogEntry = { label: 'Changelog', slug: 'changelog' };

