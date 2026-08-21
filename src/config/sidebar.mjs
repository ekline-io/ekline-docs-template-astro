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
export const privateDocsLink = {
	label: 'Private docs',
	link: '/private/',
	// Hidden by CSS until `<html>` carries `data-signed-in` — see
	// `src/components/AuthControl.astro` and `src/styles/global.css`. It is in
	// the markup for everyone because the page is prerendered once and served to
	// everyone; the attribute is what differs per reader.
	//
	// That is safe to ship publicly: `/private/` is a fixed path that reveals
	// nothing, and following it just starts the SSO round trip. What must NOT be
	// done here is listing org sections the same way — those names are customer
	// names, and static HTML would hand every one of them to every visitor.
	// `data-astro-prefetch="false"` is load-bearing, not tidiness. Starlight
	// sets `prefetchAll`, so hovering this link would issue a real GET for
	// `/private/` with the reader's cookies — which the guard answers with the
	// full SSO round trip, ending in a session the reader never asked for.
	attrs: { 'data-auth-only': 'true', 'data-astro-prefetch': 'false' },
};

/**
 * Whether this deployment offers signing in at all.
 *
 * Set `false` on any deployment without private docs configured — a demo, a
 * staging site, a fork that has not set the `DOCS_*` variables. It drops both
 * the header's Log in / Log out control and the sidebar's "Private docs" entry,
 * so readers are not offered a sign-in that cannot work. The routes and the
 * guard are untouched; nothing becomes reachable either way.
 *
 * It cannot be derived. The sidebar and header are built at build time; the SSO
 * settings are read through `astro:env/server` at request time, deliberately,
 * so one build can serve a configured environment and an unconfigured one.
 * Astro also does not load `.env` into `process.env` early enough for a
 * build-time check to see local configuration, so deriving it would hide the
 * control during local development — the one place sign-in is easiest to try.
 * A flag you set is honest about being a decision rather than a detection.
 */
export const showAuthControls = true;
