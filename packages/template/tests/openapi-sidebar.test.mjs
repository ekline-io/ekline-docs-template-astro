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
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mock } from 'node:test';

import { openApiSidebarGroup, loadSource } from '../src/lib/openapi-sidebar.mjs';

const BASE = '/api/';

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

/**
 * Serve one handler on a random loopback port. Returns the URL a spec would
 * be configured with and a `close()` that also drops open sockets, so a
 * handler that deliberately never responds cannot keep the process alive.
 */
function serve(handler) {
	const server = createServer(handler);
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			resolve({
				url: `http://127.0.0.1:${port}/openapi.yaml`,
				close: () =>
					new Promise((done) => {
						server.closeAllConnections();
						server.close(() => done());
					}),
			});
		});
	});
}

test('a remote document produces the same sidebar as the same document on disk', async () => {
	// The sidebar is built from whatever bytes arrive; where they came from must
	// not change a single entry or anchor.
	const body = readFileSync('./public/openapi.yaml', 'utf-8');
	const remote = await serve((_, res) => {
		res.setHeader('Content-Type', 'application/yaml');
		res.end(body);
	});
	try {
		const fromDisk = await openApiSidebarGroup({ spec: './public/openapi.yaml', base: BASE });
		const fromUrl = await openApiSidebarGroup({ spec: remote.url, base: BASE });
		assert.deepEqual(fromUrl, fromDisk);
	} finally {
		await remote.close();
	}
});

test('an unreachable URL degrades to a plain link and says the build machine must reach it', async () => {
	// Open then close a server so the port is known to have no listener:
	// the connection is refused immediately instead of waiting on a timeout.
	const remote = await serve(() => {});
	await remote.close();

	const warned = mock.method(console, 'warn', () => {});
	try {
		const group = await openApiSidebarGroup({ spec: remote.url, base: BASE });
		assert.deepEqual(group, { label: 'API reference', link: BASE });

		const messages = warned.mock.calls.map((call) => String(call.arguments[0]));
		assert.ok(
			messages.some((m) => m.includes(remote.url) && m.includes('must be able to reach this URL')),
			`expected a warning naming the URL, got:\n${messages.join('\n')}`
		);
	} finally {
		warned.mock.restore();
	}
});

test('a server error degrades to a plain link', async () => {
	const remote = await serve((_, res) => {
		res.statusCode = 500;
		res.end('nope');
	});
	try {
		const group = await openApiSidebarGroup({ spec: remote.url, base: BASE });
		assert.deepEqual(group, { label: 'API reference', link: BASE });
	} finally {
		await remote.close();
	}
});

test('a fetch that never completes times out instead of hanging the build', async () => {
	const remote = await serve(() => {
		/* never respond */
	});
	try {
		await assert.rejects(loadSource(remote.url, { timeoutMs: 200 }), /timed out after 200ms/);
	} finally {
		await remote.close();
	}
});
