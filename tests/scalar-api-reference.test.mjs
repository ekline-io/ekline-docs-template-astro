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

/**
 * Anchors the generated sidebar to the exact hashes Scalar assigns.
 *
 * `src/lib/openapi-sidebar.mjs` builds the sidebar with Scalar's own navigation
 * builder, so both sides normally move together. This pins the result anyway:
 * these four values were read out of a live browser, off the reference's own
 * sidebar, and they cover the cases where the rules are least obvious —
 * punctuation stripped from a webhook name rather than hyphenated, and path
 * templates keeping their braces.
 *
 * If a Scalar upgrade changes the scheme, every sidebar link would otherwise
 * still render and simply stop scrolling anywhere. This turns that silent
 * breakage into a failed build.
 */
const KNOWN_ANCHORS = [
	// Plain collection endpoint.
	'/api/embedded/#tag/payments/GET/payments',
	// Path template — braces are preserved, not encoded or slugified.
	'/api/embedded/#tag/payments/POST/payments/{payment_id}/capture',
	// Webhook — the dot in `payment.succeeded` is dropped, not turned into a dash.
	'/api/embedded/#tag/payments/webhook/POST/paymentsucceeded',
	// Tag slug is lowercased from the tag name in the document.
	'/api/embedded/#tag/disputes/POST/disputes/{dispute_id}/evidence',
];

test('the sidebar lists operations generated from the OpenAPI document', () => {
	const html = readFileSync(join(DIST, 'api/embedded/index.html'), 'utf-8');
	const links = html.match(/href="\/api\/embedded\/#[^"]+"/g) ?? [];

	assert.ok(
		links.length >= 10,
		`expected the generated sidebar to link every operation, found ${links.length}`
	);
});

test('generated sidebar anchors match the hashes Scalar assigns', () => {
	const html = readFileSync(join(DIST, 'api/embedded/index.html'), 'utf-8');

	for (const anchor of KNOWN_ANCHORS) {
		assert.ok(
			html.includes(`href="${anchor}"`),
			`sidebar is missing "${anchor}".\n` +
				`  Scalar's ID scheme may have changed — re-derive it from the rendered ` +
				`sidebar and update src/lib/openapi-sidebar.mjs, or these links will ` +
				`render but scroll nowhere.`
		);
	}
});

test('operation links carry their HTTP method as a badge', () => {
	const html = readFileSync(join(DIST, 'api/embedded/index.html'), 'utf-8');
	assert.match(html, /sl-badge[^"]*"[^>]*>GET</, 'no GET badge in the sidebar');
	assert.match(html, /sl-badge[^"]*"[^>]*>POST</, 'no POST badge in the sidebar');
});

test('the operation list is reachable from ordinary docs pages', () => {
	// The sidebar is global, so a reader on a prose page can jump straight to an
	// endpoint instead of finding the reference first and searching inside it.
	const html = readFileSync(join(DIST, 'get-started/quickstart/index.html'), 'utf-8');
	const links = html.match(/href="\/api\/embedded\/#[^"]+"/g) ?? [];
	assert.ok(links.length >= 10, `expected operations in the global sidebar, found ${links.length}`);
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
