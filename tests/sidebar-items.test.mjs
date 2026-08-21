/**
 * Unit tests for the private and per-org sidebar item builders.
 *
 * These functions decide which links land in which reader's sidebar, so a
 * mistake here is not a broken page — it is one customer's page titles showing
 * up in another customer's navigation. Most of this file is therefore the
 * adversarial set rather than the happy path: prefix collisions, odd org slugs
 * arriving from the SSO token, and ordering that has to come out the same on
 * every machine.
 *
 * The ids used as fixtures are the real ones, not a guess at the rule. They
 * were read out of Astro's content data store (`node_modules/.astro/data-store.json`,
 * devalue-encoded) after `astro sync`, with the nested rows produced by
 * temporarily adding those files and syncing again:
 *
 *     src/content/private-docs/index.mdx                 -> "index"
 *     src/content/private-docs/example-private-guide.mdx -> "example-private-guide"
 *     src/content/private-docs/guides/index.mdx          -> "guides"
 *     src/content/org-docs/acme/index.mdx                -> "acme"
 *     src/content/org-docs/acme/setup.mdx                -> "acme/setup"
 *     src/content/org-docs/acme/deep/index.mdx           -> "acme/deep"
 *     src/content/org-docs/acme-labs/index.mdx           -> "acme-labs"
 *     src/content/org-docs/acme-labs/secret.mdx          -> "acme-labs/secret"
 *
 * Run:  node --test tests/sidebar-items.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	entriesToItems,
	orgGroup,
	privateLinkFor,
	orgLinkFor,
} from '../src/lib/sidebar-items.mjs';

/**
 * Minimal shape of an `astro:content` entry, as the real code consumes it.
 *
 * Ids follow the derivation measured above: a collection-root `index.mdx` keeps
 * the id `index`, while a nested one collapses to its parent directory, so
 * `org-docs/acme/index.mdx` is `acme` and no id ever ends in `/index`.
 */
const entry = (id, title, sidebar = {}) => ({ id, data: { title, sidebar } });

const labelsOf = (entries, linkFor) => entriesToItems(entries, linkFor).map((item) => item.label);

// ---------------------------------------------------------------------------
// Ordering and labelling
// ---------------------------------------------------------------------------

test('entriesToItems sorts by order then id, honours sidebar.label, skips hidden', () => {
	const entries = [
		entry('example-private-guide', 'Example private guide', { order: 1, label: 'Example guide' }),
		entry('index', 'Private documentation'),
		entry('secret-draft', 'Draft', { hidden: true }),
	];
	assert.deepEqual(entriesToItems(entries, privateLinkFor), [
		{ label: 'Example guide', link: '/private/example-private-guide/' },
		{ label: 'Private documentation', link: '/private/' },
	]);
});

test('entries without an order sort by id, after ordered ones', () => {
	const entries = [entry('zeta', 'Zeta'), entry('alpha', 'Alpha'), entry('beta', 'Beta', { order: 5 })];
	assert.deepEqual(labelsOf(entries, privateLinkFor), ['Beta', 'Alpha', 'Zeta']);
});

test('a zero or negative order still sorts ahead of the unordered', () => {
	// `order` arrives already validated by Starlight's docsSchema, which types it
	// `z.number().optional()`. Measured against the installed zod: a string, NaN,
	// Infinity and -Infinity are all *rejected at build time*, so the only
	// surprising values that can reach this comparator are ordinary finite
	// numbers. Zero and negatives are the two worth pinning — `0` is falsy, and
	// the "no order" sentinel is `Infinity`, which no real order can now equal.
	const entries = [entry('c', 'C'), entry('a', 'A', { order: 0 }), entry('b', 'B', { order: -10 })];
	assert.deepEqual(labelsOf(entries, privateLinkFor), ['B', 'A', 'C']);
});

test('entries sharing an order come out by id, whatever order they arrive in', () => {
	// The tie-break is a total order — collection ids are unique, because Astro
	// keys the data store by id — so the result depends on neither the input
	// order nor Array#sort stability. Sorting by id rather than by title also
	// matches how Starlight sorts the public sidebar
	// (`utils/navigation.ts:sortDirEntries` compares ids with an Intl.Collator).
	const forwards = [
		entry('a', 'A', { order: 2 }),
		entry('b', 'B', { order: 2 }),
		entry('c', 'C', { order: 2 }),
	];
	assert.deepEqual(labelsOf(forwards, privateLinkFor), ['A', 'B', 'C']);
	assert.deepEqual(labelsOf([...forwards].reverse(), privateLinkFor), ['A', 'B', 'C']);
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

test('privateLinkFor maps the collection-root index to the section root', () => {
	assert.equal(privateLinkFor(entry('index', 'X')), '/private/');
	assert.equal(privateLinkFor(entry('guide', 'X')), '/private/guide/');
	// Astro already collapsed `guides/index.mdx` to `guides`.
	assert.equal(privateLinkFor(entry('guides', 'X')), '/private/guides/');
});

test('orgLinkFor maps the org landing page to the org root', () => {
	assert.equal(orgLinkFor('acme')(entry('acme', 'Acme docs')), '/private/orgs/acme/');
	assert.equal(orgLinkFor('acme')(entry('acme/workflow', 'W')), '/private/orgs/acme/workflow/');
	assert.equal(orgLinkFor('acme')(entry('acme/deep', 'W')), '/private/orgs/acme/deep/');
});

// ---------------------------------------------------------------------------
// Org grouping
// ---------------------------------------------------------------------------

test('orgGroup includes the landing page and is labelled by it', () => {
	const orgEntries = [
		entry('acme', 'Acme docs'),
		entry('acme/workflow', 'Custom workflow'),
		entry('globex', 'Globex docs'),
	];
	assert.deepEqual(orgGroup('acme', orgEntries), {
		label: 'Acme docs',
		items: [
			{ label: 'Acme docs', link: '/private/orgs/acme/' },
			{ label: 'Custom workflow', link: '/private/orgs/acme/workflow/' },
		],
	});
});

test('orgGroup falls back to the slug when the org has no landing page', () => {
	assert.deepEqual(orgGroup('acme', [entry('acme/workflow', 'Custom workflow')]), {
		label: 'acme',
		items: [{ label: 'Custom workflow', link: '/private/orgs/acme/workflow/' }],
	});
});

test('orgGroup returns null when the org has no content', () => {
	assert.equal(orgGroup('nonexistent', []), null);
	assert.equal(orgGroup('acme', [entry('globex', 'Globex docs')]), null);
});

test('orgGroup does not match an org whose slug is a prefix of another', () => {
	// The bug this guards: `acme-labs`.startsWith('acme') is true, so a naive
	// prefix test would put one customer's pages in another's sidebar. Both
	// directories are real shapes — `org-docs/acme-labs/secret.mdx` really does
	// produce the id `acme-labs/secret`.
	const entries = [
		entry('acme-labs', 'Acme Labs'),
		entry('acme-labs/secret', 'Labs secret'),
		entry('acme', 'Acme'),
	];
	assert.deepEqual(orgGroup('acme', entries), {
		label: 'Acme',
		items: [{ label: 'Acme', link: '/private/orgs/acme/' }],
	});
});

test('orgGroup can be called repeatedly against one shared entry list', () => {
	// src/lib/private-sidebar.mjs (Task 9) loops the reader's orgs over a single
	// `getCollection('orgDocs')` result, so building one org's group must leave
	// the list untouched for the next one. `.filter()` before `.sort()` is what
	// makes that true; sorting first would reorder the caller's array in place.
	const entries = [
		entry('globex', 'Globex docs'),
		entry('acme', 'Acme docs'),
		entry('acme/setup', 'Setup'),
	];
	const arrivedAs = entries.map((e) => e.id);

	assert.deepEqual(orgGroup('acme', entries), {
		label: 'Acme docs',
		items: [
			{ label: 'Acme docs', link: '/private/orgs/acme/' },
			{ label: 'Setup', link: '/private/orgs/acme/setup/' },
		],
	});
	assert.deepEqual(orgGroup('globex', entries), {
		label: 'Globex docs',
		items: [{ label: 'Globex docs', link: '/private/orgs/globex/' }],
	});
	assert.deepEqual(entries.map((e) => e.id), arrivedAs);
});

// ---------------------------------------------------------------------------
// Org slugs that did not come from a directory name
// ---------------------------------------------------------------------------

test('an org slug containing a slash matches nothing', () => {
	// The org slug is whatever the SSO token's `orgs` claim said, byte-verbatim
	// (src/lib/auth/guards.mjs explains why it is never repaired), so a
	// misconfigured IdP can hand us `acme/deep`. A slash is the one character
	// that lets such a value cross a real path boundary: `acme/deep` is a
	// legitimate id — `org-docs/acme/deep/index.mdx` — belonging to Acme.
	// Without this rule the reader would see Acme's page title in their own
	// sidebar. Following the link 404s, since the middleware matches
	// `/private/orgs/([^/]+)` and would demand membership of `acme`, not
	// `acme/deep` — but the title has already leaked by then.
	//
	// Nothing is lost by refusing: because that same regex captures a single
	// segment, no org whose slug contains a slash can ever be granted, so no
	// content is reachable as that org and the honest item count is zero.
	const entries = [entry('acme', 'Acme docs'), entry('acme/deep', 'Deep dive')];
	assert.equal(orgGroup('acme/deep', entries), null);
	assert.equal(orgGroup('acme/', entries), null);
});

test('regex metacharacters in an org slug are matched literally', () => {
	// Matching is `startsWith`/`slice`, never a RegExp, so `a.b` cannot match
	// `axb` and a percent-encoded slug cannot match the segments it encodes.
	// The token side is where such slugs are reachable; the content side can
	// never produce them, because Astro runs every path segment through
	// github-slugger, which strips these characters (measured: "a.b" -> "ab",
	// "a+b" -> "ab", "a*b" -> "ab", "acme%2fglobex" -> "acme2fglobex", and both
	// "/" and "\" -> ""). That asymmetry is why only the no-match direction is
	// asserted here: a content id that is literally `a.b` cannot exist, so
	// asserting it matched would be testing an input no build can produce.
	assert.equal(orgGroup('a.b', [entry('axb', 'X'), entry('axb/page', 'Y')]), null);
	assert.equal(orgGroup('acme%2f..%2fglobex', [entry('acme', 'A'), entry('globex', 'G')]), null);
});
