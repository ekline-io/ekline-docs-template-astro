/**
 * The public sidebar, as data.
 *
 * Lives here rather than inline in `astro.config.mjs` because two consumers
 * need it: the Starlight config (public, static pages) and
 * `src/lib/private-sidebar.mjs`, which rebuilds the same navigation — plus
 * the private groups — for logged-in pages. One definition, no drift.
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
 */
export const loginLink = { label: 'Private docs', link: '/private/' };
