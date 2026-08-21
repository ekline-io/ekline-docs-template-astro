/**
 * The sidebar, as data.
 *
 * This file is *sidebar config*, not *shared* sidebar config, and the
 * distinction matters when adding to it. `docsSidebarGroups` and
 * `changelogEntry` do have two consumers — the Starlight config in
 * `astro.config.mjs` (public, static pages) and `src/lib/private-sidebar.mjs`,
 * which rebuilds the same navigation plus the private groups for logged-in
 * pages, so one definition means no drift. `loginLink` has exactly one: a
 * logged-in reader gets "Log out" in its place. It belongs here anyway,
 * because this is where the sidebar is described.
 */
export const docsSidebarGroups = [
	{
		label: 'Get started',
		items: [
			{ label: 'Introduction', slug: 'get-started/introduction' },
			{ label: 'Quickstart', slug: 'get-started/quickstart' },
			{ label: 'Authentication', slug: 'get-started/authentication' },
		],
	},
	{
		label: 'Guides',
		items: [
			{ label: 'Example guide', slug: 'guides/example' },
			{ label: 'Send your first request', slug: 'guides/send-your-first-request' },
		],
	},
	{
		label: 'Concepts',
		items: [
			{ label: 'How it works', slug: 'concepts/how-it-works' },
			{ label: 'Glossary', slug: 'concepts/glossary' },
		],
	},
	{
		label: 'Reference',
		items: [{ autogenerate: { directory: 'reference' } }],
	},
];

export const changelogEntry = { label: 'Changelog', slug: 'changelog' };

/**
 * The one login affordance on public pages. Static HTML is identical for
 * every visitor, so this cannot be session-aware — it is a plain link that
 * starts the SSO round trip when the reader is not logged in.
 *
 * The **label** is yours to change ("Customer portal", "Partner docs"). The
 * **path** is not: `/private/` is wired into the middleware's guard, and
 * pointing this somewhere else would send readers to an unguarded URL.
 *
 * Being last in the sidebar, this entry is also why `changelog.mdx` sets
 * `next: false` — otherwise Starlight's pagination offers a sign-in gate as
 * the next thing to read. Move this entry and revisit that.
 */
export const loginLink = { label: 'Private docs', link: '/private/' };
