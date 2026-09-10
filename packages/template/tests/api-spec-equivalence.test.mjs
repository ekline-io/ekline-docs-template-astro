/**
 * The three places a document can live must be indistinguishable to a reader.
 *
 * `spec` accepts a file in `public/`, a file anywhere else on disk, or a URL —
 * and a URL is served two ways (`snapshot`, `live`). All four are read at build
 * time by the same loader, so the generated operation sidebar and the search
 * index they feed must come out identical. That equality is the whole promise
 * of the feature; the tests in the other suites each cover one source alone and
 * would all still pass if the sources quietly diverged.
 *
 * The one thing that may differ is `specUrlFor()` — where the browser fetches
 * the document from — and that is asserted too, so this test fails if a future
 * change makes the sources differ in any *other* way.
 *
 * Run:  node --test tests/api-spec-equivalence.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openApiSidebarGroup, openApiOperations } from '../src/lib/openapi-sidebar.mjs';
import { specUrlFor, needsEmit } from '../src/config/api-reference.mjs';

const BASE = '/api/';
const BUNDLED = './public/openapi.yaml';

/** The exact bytes every source below serves, so any difference is the code's. */
const DOCUMENT = readFileSync(BUNDLED, 'utf-8');

let server;
let remoteUrl;
let liveUrl;
let diskCopy;

before(async () => {
	// One copy of the shipped document on disk outside `public/`...
	diskCopy = join(mkdtempSync(join(tmpdir(), 'api-spec-equivalence-')), 'openapi.yaml');
	writeFileSync(diskCopy, DOCUMENT, 'utf-8');

	// ...and one served over HTTP, standing in for a customer's API host.
	server = createServer((_, res) => {
		res.setHeader('Content-Type', 'application/yaml');
		res.end(DOCUMENT);
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	// Two distinct paths on the same server, not one URL reused: the loader
	// memoises a fetched document by its URL string, so a snapshotted and a
	// live reference pointing at the *same* URL would share that cache entry
	// — the "live" configuration would pass by reading the snapshot's already-
	// fetched result rather than genuinely fetching for itself. Different
	// URLs serving identical bytes force each configuration through its own
	// fetch, which is the thing "live" is actually supposed to prove.
	remoteUrl = `http://127.0.0.1:${server.address().port}/openapi.yaml`;
	liveUrl = `http://127.0.0.1:${server.address().port}/live/openapi.yaml`;
});

after(async () => {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
});

/**
 * The four configurations, each a complete reference entry.
 *
 * They deliberately share one `id`: the emitted filename is keyed by `id`, so
 * this also pins that two sources of the same document would be served at the
 * same path — the sources differ in where the document comes from, nothing else.
 */
function sources() {
	const common = {
		id: 'payments',
		enabled: true,
		slug: '',
		layout: 'docs',
		label: 'API reference',
		title: 'API reference',
		description: 'Example.',
	};
	return [
		{ name: 'bundled in public/', reference: { ...common, spec: BUNDLED } },
		{ name: 'a file outside public/', reference: { ...common, spec: diskCopy } },
		{
			name: 'a remote URL, snapshotted',
			reference: { ...common, spec: remoteUrl, serve: 'snapshot' },
		},
		{ name: 'a remote URL, live', reference: { ...common, spec: liveUrl, serve: 'live' } },
	];
}

test('every source produces the same left navigation', async (t) => {
	const [baseline, ...rest] = sources();
	const expected = await openApiSidebarGroup({ spec: baseline.reference.spec, base: BASE });

	// Guard the baseline itself: comparing four empty fallbacks would pass while
	// proving nothing. The shipped document has tags and many operations.
	assert.ok(expected.items?.length > 1, 'baseline sidebar should be a group of tags, not a fallback link');

	// A subtest per source, not a shared loop: `assert.deepEqual` throws on the
	// first mismatch, so one shared loop would report only the first source that
	// diverged and hide the rest. This test's whole job is to say *which*
	// sources diverged, so each one gets its own subtest and its own chance to
	// fail — one failing subtest never stops the others from running.
	for (const { name, reference } of rest) {
		await t.test(name, async () => {
			const actual = await openApiSidebarGroup({ spec: reference.spec, base: BASE });
			assert.deepEqual(actual, expected, `${name}: sidebar differs from the bundled document's`);
		});
	}
});

test('every source produces the same search entries', async (t) => {
	// `ApiSearchIndex.astro` renders one heading per entry here, and each id is
	// the anchor Scalar assigns — so identical operations means identical search
	// results landing on identical anchors.
	const [baseline, ...rest] = sources();
	const expected = await openApiOperations({ spec: baseline.reference.spec });

	assert.ok(expected.length >= 10, `baseline should index many operations, got ${expected.length}`);

	// See the comment above: a subtest per source so a mismatch in one doesn't
	// prevent the others from being checked and reported.
	for (const { name, reference } of rest) {
		await t.test(name, async () => {
			const actual = await openApiOperations({ spec: reference.spec });
			assert.deepEqual(actual, expected, `${name}: search entries differ from the bundled document's`);
		});
	}
});

test('every sidebar link resolves to an indexed search anchor', async () => {
	// The sidebar and the search index are generated separately. If they ever
	// disagree, a reader clicks a sidebar entry that search cannot find, or
	// finds a result with no sidebar row — invisible until someone reports it.
	for (const { name, reference } of sources()) {
		const group = await openApiSidebarGroup({ spec: reference.spec, base: BASE });
		const operations = await openApiOperations({ spec: reference.spec });
		const anchors = new Set(operations.map((operation) => operation.anchor));

		const linked = (entry) =>
			entry.link ? [entry] : (entry.items ?? []).flatMap(linked);
		const operationLinks = linked(group)
			.map((entry) => entry.link)
			.filter((link) => link.includes('#'));

		assert.ok(operationLinks.length > 0, `${name}: expected operation links`);
		for (const link of operationLinks) {
			const anchor = decodeURIComponent(link.slice(link.indexOf('#') + 1));
			assert.ok(anchors.has(anchor), `${name}: sidebar links #${anchor}, which search does not index`);
		}
	}
});

test('the only thing that differs between sources is where the browser fetches from', async () => {
	const byName = Object.fromEntries(sources().map((source) => [source.name, source.reference]));

	assert.equal(specUrlFor(byName['bundled in public/']), '/openapi.yaml');
	assert.equal(specUrlFor(byName['a file outside public/']), '/api-spec/payments.yaml');
	assert.equal(specUrlFor(byName['a remote URL, snapshotted']), '/api-spec/payments.yaml');
	assert.equal(specUrlFor(byName['a remote URL, live']), liveUrl);

	// And which of them the build has to serve a copy of.
	assert.equal(needsEmit(byName['bundled in public/']), false);
	assert.equal(needsEmit(byName['a file outside public/']), true);
	assert.equal(needsEmit(byName['a remote URL, snapshotted']), true);
	assert.equal(needsEmit(byName['a remote URL, live']), false);
});
