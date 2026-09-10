/**
 * Unit tests for the endpoint that serves OpenAPI documents kept outside
 * `public/` — a file elsewhere on disk, or a remote document being
 * snapshotted. Astro calls `getStaticPaths` then `GET` once per path at build
 * time; these tests call them the same way.
 *
 * Run:  node --test tests/api-spec-endpoint.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

import { GET, getStaticPaths } from '../src/pages/api-spec/[file].js';

const YAML = 'openapi: 3.1.0\ninfo:\n  title: Outside public\n  version: "1"\npaths: {}\n';
const JSON_DOC = '{"openapi":"3.1.0","info":{"title":"Outside public","version":"1"},"paths":{}}';

/** Write a throwaway document outside `public/` and return its path. */
function specFile(name, contents) {
	const dir = mkdtempSync(join(tmpdir(), 'api-spec-endpoint-'));
	const file = join(dir, name);
	writeFileSync(file, contents, 'utf-8');
	return file;
}

const ref = (overrides = {}) => ({
	id: 'external',
	enabled: true,
	slug: 'external',
	layout: 'docs',
	label: 'External',
	title: 'External',
	description: 'Example.',
	...overrides,
});

/** A URL on a loopback port that has no listener, so connecting is refused at once. */
async function closedUrl() {
	const server = createServer(() => {});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	await new Promise((resolve) => server.close(resolve));
	return `http://127.0.0.1:${port}/openapi.yaml`;
}

test('the shipped config emits nothing', () => {
	// Both shipped references live in public/, which Astro serves itself.
	assert.deepEqual(getStaticPaths(), []);
});

test('a YAML document outside public/ is served verbatim as YAML', async () => {
	const reference = ref({ spec: specFile('openapi.yaml', YAML) });
	const response = await GET({ props: { reference }, params: { file: 'external.yaml' } });

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('Content-Type'), 'application/yaml');
	assert.equal(await response.text(), YAML, 'the raw bytes, not a normalized copy');
});

test('a JSON document is served as JSON', async () => {
	const reference = ref({ spec: specFile('openapi.json', JSON_DOC) });
	const response = await GET({ props: { reference }, params: { file: 'external.json' } });

	assert.equal(response.headers.get('Content-Type'), 'application/json');
	assert.equal(await response.text(), JSON_DOC);
});

test('a missing file fails the build and names what would have gone blank', async () => {
	const reference = ref({ spec: '/definitely/not/here/openapi.yaml' });
	await assert.rejects(
		GET({ props: { reference }, params: { file: 'external.yaml' } }),
		/Could not read "\/definitely\/not\/here\/openapi\.yaml" for reference "external".*Nothing to serve at \/api-spec\/external\.yaml; the reference would render blank/s
	);
});

test('an unreachable snapshot URL fails the build and names what would have gone blank', async () => {
	const url = await closedUrl();
	const reference = ref({ spec: url });
	await assert.rejects(
		GET({ props: { reference }, params: { file: 'external.yaml' } }),
		new RegExp(
			`Could not fetch "${url.replace(/[.\\/]/g, '\\$&')}" for reference "external".*` +
				`Nothing to serve at /api-spec/external\\.yaml; the reference would render blank`,
			's'
		)
	);
});
