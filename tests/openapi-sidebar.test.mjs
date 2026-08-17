/**
 * Unit tests for the OpenAPI -> Starlight sidebar generator.
 *
 * These run against the module directly rather than the built site, so they
 * cover the paths a customer hits before they have a working spec — a missing
 * file, a malformed document, a spec with no tags. A template's first build
 * must not die on any of them.
 *
 * Run:  node --test tests/openapi-sidebar.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openApiSidebarGroup } from '../src/lib/openapi-sidebar.mjs';

const BASE = '/api/embedded/';

/** Write a throwaway spec and return its path. */
function specFile(contents) {
	const dir = mkdtempSync(join(tmpdir(), 'openapi-sidebar-'));
	const file = join(dir, 'openapi.yaml');
	writeFileSync(file, contents, 'utf-8');
	return file;
}

/** Every link in a (possibly nested) sidebar group. */
function links(group) {
	if (group.link) return [group];
	return (group.items ?? []).flatMap(links);
}

test('builds a group of operations from the template spec', async () => {
	const group = await openApiSidebarGroup({ spec: './public/openapi.yaml', base: BASE });

	assert.equal(group.label, 'API reference');
	const hrefs = links(group).map((l) => l.link);

	assert.ok(hrefs.length >= 10, `expected many operations, got ${hrefs.length}`);
	assert.ok(hrefs.includes(`${BASE}#tag/payments/GET/payments`));
	assert.ok(hrefs.includes(`${BASE}#tag/payments/webhook/POST/paymentsucceeded`));
	assert.ok(hrefs.every((h) => h.startsWith(BASE)), 'every link should target the reference route');
});

test('operations carry an HTTP method badge', async () => {
	const group = await openApiSidebarGroup({ spec: './public/openapi.yaml', base: BASE });
	const listPayments = links(group).find((l) => l.link.endsWith('#tag/payments/GET/payments'));

	assert.deepEqual(listPayments.badge, { text: 'GET', variant: 'note' });
});

test('badges can be turned off', async () => {
	const group = await openApiSidebarGroup({ spec: './public/openapi.yaml', base: BASE, badges: false });
	assert.ok(links(group).every((l) => !l.badge));
});

test('a missing spec degrades to a plain link instead of failing the build', async () => {
	const group = await openApiSidebarGroup({ spec: './does-not-exist.yaml', base: BASE });
	assert.deepEqual(group, { label: 'API reference', link: BASE });
});

test('a malformed spec degrades to a plain link', async () => {
	const group = await openApiSidebarGroup({ spec: specFile(': not : valid : yaml\n\t- ['), base: BASE });
	assert.equal(group.link, BASE, 'expected the fallback link');
});

test('a spec with no operations degrades to a plain link', async () => {
	const group = await openApiSidebarGroup({
		spec: specFile('openapi: 3.1.0\ninfo:\n  title: Empty\n  version: "1"\npaths: {}\n'),
		base: BASE,
	});
	assert.equal(group.link, BASE, 'expected the fallback link');
});

test('untagged operations still produce reachable entries', async () => {
	// Plenty of real documents never declare `tags`. Whatever Scalar does with
	// them, the sidebar must not silently drop the operation or emit a link that
	// scrolls nowhere — at worst it falls back to linking the reference itself.
	const group = await openApiSidebarGroup({
		spec: specFile(
			'openapi: 3.1.0\n' +
				'info:\n  title: Untagged\n  version: "1"\n' +
				'paths:\n  /things:\n    get:\n      summary: List things\n' +
				'      responses:\n        "200":\n          description: OK\n'
		),
		base: BASE,
	});

	const hrefs = links(group).map((l) => l.link);
	assert.ok(hrefs.length >= 1, 'expected at least the reference link');
	assert.ok(hrefs.every((h) => h.startsWith(BASE)));
});
