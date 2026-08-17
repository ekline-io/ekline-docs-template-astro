/**
 * Smoke tests for the Scalar API reference.
 *
 * These guard one failure mode that is otherwise silent: Scalar fetches the
 * OpenAPI document by URL in the browser, so renaming or moving
 * `public/openapi.yaml` still produces a clean `npm run build`. Nothing fails
 * until a visitor loads `/api/` and Scalar 404s on the document — by which
 * point the site is deployed.
 *
 * Asserting that the spec is emitted, and that each route's markup actually
 * points at the path it is emitted to, catches that at build time instead.
 *
 * Run after `npm run build`:  `node --test tests/scalar-api-reference.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

/** Path the reference is configured to fetch, relative to the site root. */
const SPEC_PATH = 'openapi.yaml';

/** Both candidate layouts. See `wiki/api-reference.md`. */
const ROUTES = ['api/index.html', 'api/embedded/index.html'];

test('build output exists (did `npm run build` run?)', () => {
	assert.ok(existsSync(DIST), 'dist/ does not exist');
});

test('the OpenAPI document is emitted as a static asset', () => {
	const spec = join(DIST, SPEC_PATH);
	assert.ok(existsSync(spec), `dist/${SPEC_PATH} missing`);

	const content = readFileSync(spec, 'utf-8');
	assert.match(content, /^openapi:\s*3\./m, 'not an OpenAPI 3.x document');
	assert.match(content, /^paths:/m, 'document declares no paths');
});

test('every API reference route is built', () => {
	for (const route of ROUTES) {
		assert.ok(existsSync(join(DIST, route)), `dist/${route} missing`);
	}
});

test('every API reference route points at the emitted document', () => {
	for (const route of ROUTES) {
		const html = readFileSync(join(DIST, route), 'utf-8');
		assert.ok(
			html.includes(`/${SPEC_PATH}`),
			`dist/${route} does not reference /${SPEC_PATH} — the reference would ` +
				`404 on its document at runtime`
		);
	}
});

test('the reference mounts in client mode', () => {
	// `renderMode="client"` is what makes the reference survive a view-transition
	// navigation; the static mode's bootstrap script only runs on a hard load.
	// The client path is what emits this container.
	for (const route of ROUTES) {
		const html = readFileSync(join(DIST, route), 'utf-8');
		assert.match(
			html,
			/data-scalar-client/,
			`dist/${route} was not rendered with renderMode="client"`
		);
	}
});

test("Scalar's spec-uploading AI assistant is disabled", () => {
	// Opening it uploads the customer's OpenAPI document to Scalar's servers and
	// asks the reader to accept Scalar's terms. A template must not default to
	// that; see the comment in `src/components/ScalarApiReference.astro`.
	//
	// The config rides in an HTML attribute, so its quotes are entity-encoded.
	// Normalise rather than matching one particular encoding — which form the
	// escaper picks (`&#34;` vs `&quot;`) is an Astro implementation detail.
	const unescapeQuotes = (s) => s.replace(/&#34;|&quot;/g, '"');

	for (const route of ROUTES) {
		const html = unescapeQuotes(readFileSync(join(DIST, route), 'utf-8'));
		assert.ok(
			html.includes('"agent":{"disabled":true}'),
			`dist/${route} does not disable the Scalar agent`
		);
	}
});
