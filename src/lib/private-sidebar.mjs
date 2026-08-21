/**
 * The sidebar for logged-in pages: the public navigation, plus the private
 * group, plus one group per org in the reader's session.
 *
 * The public part is passed through in the same shape `astro.config.mjs`
 * declares it — `<StarlightPage>`'s `sidebar` prop takes
 * `StarlightUserConfig['sidebar']` and is validated by Starlight's own
 * `SidebarItemSchema`, so `slug` shorthand and `autogenerate` are expanded by
 * Starlight itself (`utils/starlight-page.ts` → `getSidebarFromConfig`). Only
 * the private and org groups are built by hand, because those collections are
 * invisible to `autogenerate`.
 *
 * That division is also a hard constraint, not a preference. Starlight resolves
 * a `slug` item through `linkFromInternalSidebarLinkItem`, which throws an
 * `AstroError` when the slug names no page in the `docs` collection. On a
 * prerendered page that is a build failure; here it would be a request-time
 * 500 on a private page. Private and org entries therefore ship as
 * `{ label, link }` — which is exactly what `src/lib/sidebar-items.mjs` emits —
 * and must never be "tidied up" into `slug` shorthand.
 *
 * API references appear as plain links (not per-operation groups): expanding
 * them means running Scalar's navigation builder against the spec file at
 * request time, and the spec on disk is not guaranteed to exist inside a
 * serverless bundle. A single link per reference is correct and cheap.
 */
import { getCollection } from 'astro:content';
import { docsSidebarGroups, changelogEntry } from '../config/sidebar.mjs';
import { enabledReferences, routeFor } from '../config/api-reference.mjs';
import { entriesToItems, privateLinkFor, orgGroup } from './sidebar-items.mjs';

/** @param {App.Locals['session']} session */
export async function buildPrivateSidebar(session) {
	const privateEntries = await getCollection('privateDocs');
	const orgEntries = await getCollection('orgDocs');
	return [
		...docsSidebarGroups,
		...enabledReferences.map((reference) => ({
			label: reference.label,
			link: routeFor(reference),
		})),
		changelogEntry,
		{ label: 'Private docs', items: entriesToItems(privateEntries, privateLinkFor) },
		// `orgGroup` returns `null` for an org with no content (and for a slug
		// containing a slash — see `sidebar-items.mjs`). Those have to be dropped
		// before Starlight sees them: `SidebarItemSchema` rejects `null` and the
		// failure would be a 500 on the page, not a missing group.
		...(session?.orgs ?? [])
			.map((org) => orgGroup(org, orgEntries))
			.filter((group) => group !== null),
		// Deliberately no `loginLink`: it exists to send public-page readers into
		// the SSO round trip. On a private page the reader is already signed in,
		// and "Log out" takes its place.
		{ label: 'Log out', link: '/auth/logout' },
	];
}
