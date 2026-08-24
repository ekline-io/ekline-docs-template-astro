import { listWikiEntries } from '../loaders/wiki.mjs';

/**
 * The sidebar, as data.
 *
 * Only the Internals group is wired so far (Task 2) — the rest stays empty
 * until Tasks 3-7 land real pages under `src/content/docs/`. A Starlight
 * sidebar entry that names a `slug` fails the build if that slug isn't in
 * the `docs` collection, which is exactly why this array was empty before:
 * the only page there was the temporary `index.mdx` placeholder.
 *
 * Internals is different: it comes from the `wiki` collection, not `docs`
 * (see `src/loaders/wiki.mjs`), so its entries can never use `{ slug }` —
 * that only resolves against `docs`. `{ link }` entries instead, built from
 * the same `listWikiEntries()` the loader uses, so a new wiki file picks up
 * a sidebar entry automatically instead of needing one hand-added here.
 */
export const docsSidebarGroups = [
	{
		label: 'Internals',
		items: listWikiEntries().map(({ id, title }) => ({
			label: title,
			link: `/internals/${id}/`,
		})),
	},
];

export const changelogEntry = { label: 'Changelog', slug: 'changelog' };

