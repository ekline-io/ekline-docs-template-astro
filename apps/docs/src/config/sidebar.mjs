import { listWikiEntries } from '../loaders/wiki.mjs';

/**
 * The sidebar, as data.
 *
 * Get started is the first real content group (Task 3) — Configure, API
 * references, The logged-in experience and Reference land in Tasks 4-7 and
 * slot in above Internals, which stays last. A Starlight sidebar entry that
 * names a `slug` fails the build if that slug isn't in the `docs`
 * collection, so each entry below points at a page that actually exists
 * under `src/content/docs/`.
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
		label: 'Internals',
		items: listWikiEntries().map(({ id, title }) => ({
			label: title,
			link: `/internals/${id}/`,
		})),
	},
];

export const changelogEntry = { label: 'Changelog', slug: 'changelog' };

