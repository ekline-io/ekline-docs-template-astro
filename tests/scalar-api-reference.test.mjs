/**
 * Smoke tests for the Scalar API references.
 *
 * These guard one failure mode that is otherwise silent: Scalar fetches each
 * OpenAPI document by URL in the browser, so renaming or moving one still
 * produces a clean `npm run build`. Nothing fails until a visitor loads the
 * route and Scalar 404s on the document — by which point the site is deployed.
 *
 * Asserting that each document is emitted, and that its route's markup points
 * at the path it is emitted to, catches that at build time instead.
 *
 * Driven from `src/config/api-reference.mjs` rather than a hardcoded list, so
 * adding, removing or re-routing a reference cannot leave these tests behind.
 *
 * Run after `npm run build`:  `node --test tests/scalar-api-reference.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
	enabledReferences,
	listsOperationsInSidebar,
	routeFor,
} from '../src/config/api-reference.mjs';
import { staticDir } from './helpers/static-dir.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = staticDir(join(__dirname, '..'));

/** Absolute path of the HTML a reference builds to. */
const htmlFor = (reference) =>
	join(STATIC_DIR, routeFor(reference).replace(/^\/|\/$/g, ''), 'index.html');

/** Absolute path of the document a reference is served from. */
const specFor = (reference) => join(STATIC_DIR, reference.specUrl.replace(/^\//, ''));

test('more than one reference is configured', () => {
	// The template ships two so both layouts are visible on real content. If you
	// deleted one, drop this assertion with it.
	assert.ok(enabledReferences.length >= 1, 'no API references are enabled');
});

test("every reference's OpenAPI document is emitted as a static asset", () => {
	for (const reference of enabledReferences) {
		const spec = specFor(reference);
		assert.ok(existsSync(spec), `${reference.id}: ${reference.specUrl} missing from the build output`);

		const content = readFileSync(spec, 'utf-8');
		assert.match(content, /^openapi:\s*3\./m, `${reference.id}: not an OpenAPI 3.x document`);
		assert.match(content, /^paths:/m, `${reference.id}: document declares no paths`);
	}
});

test('every reference route is built', () => {
	for (const reference of enabledReferences) {
		assert.ok(existsSync(htmlFor(reference)), `${reference.id}: ${routeFor(reference)} not built`);
	}
});

test('every reference points at its own document', () => {
	// The failure this catches is a reference rendering someone else's API —
	// easy to introduce when copying an entry in the config, and invisible until
	// someone reads the page.
	for (const reference of enabledReferences) {
		const html = readFileSync(htmlFor(reference), 'utf-8');
		assert.ok(
			html.includes(reference.specUrl),
			`${reference.id}: ${routeFor(reference)} does not reference ${reference.specUrl} — ` +
				`it would 404 on its document at runtime`
		);
	}
});

test('every reference mounts in client mode', () => {
	// `renderMode="client"` is what makes a reference survive a view-transition
	// navigation; the static mode's bootstrap script only runs on a hard load.
	// The client path is what emits this container.
	for (const reference of enabledReferences) {
		const html = readFileSync(htmlFor(reference), 'utf-8');
		assert.match(
			html,
			/data-scalar-client/,
			`${reference.id}: not rendered with renderMode="client"`
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
	'/api/#tag/payments/GET/payments',
	// Path template — braces are preserved, not encoded or slugified.
	'/api/#tag/payments/POST/payments/{payment_id}/capture',
	// Webhook — the dot in `payment.succeeded` is dropped, not turned into a dash.
	'/api/#tag/payments/webhook/POST/paymentsucceeded',
	// Tag slug is lowercased from the tag name in the document.
	'/api/#tag/disputes/POST/disputes/{dispute_id}/evidence',
];

test('the sidebar lists operations generated from the OpenAPI document', () => {
	const html = readFileSync(join(STATIC_DIR, 'api/index.html'), 'utf-8');
	const links = html.match(/href="\/api\/#[^"]+"/g) ?? [];

	assert.ok(
		links.length >= 10,
		`expected the generated sidebar to link every operation, found ${links.length}`
	);
});

test('generated sidebar anchors match the hashes Scalar assigns', () => {
	const html = readFileSync(join(STATIC_DIR, 'api/index.html'), 'utf-8');

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
	const html = readFileSync(join(STATIC_DIR, 'api/index.html'), 'utf-8');
	assert.match(html, /sl-badge[^"]*"[^>]*>GET</, 'no GET badge in the sidebar');
	assert.match(html, /sl-badge[^"]*"[^>]*>POST</, 'no POST badge in the sidebar');
});

test('the operation list is reachable from ordinary docs pages', () => {
	// The sidebar is global, so a reader on a prose page can jump straight to an
	// endpoint instead of finding the reference first and searching inside it.
	const html = readFileSync(join(STATIC_DIR, 'get-started/quickstart/index.html'), 'utf-8');
	const links = html.match(/href="\/api\/#[^"]+"/g) ?? [];
	assert.ok(links.length >= 10, `expected operations in the global sidebar, found ${links.length}`);
});

test('a full-width reference gets a plain sidebar link, not an operation list', () => {
	// Scalar's own sidebar lists the operations on a `full` route, so repeating
	// them in Starlight's would be two navigation trees for one document.
	const html = readFileSync(join(STATIC_DIR, 'get-started/quickstart/index.html'), 'utf-8');

	for (const reference of enabledReferences.filter((r) => !listsOperationsInSidebar(r))) {
		assert.ok(
			html.includes(`href="${routeFor(reference)}"`),
			`${reference.id}: no sidebar link to ${routeFor(reference)}`
		);
		const anchors =
			html.match(new RegExp(`href="${routeFor(reference)}#[^"]+"`, 'g')) ?? [];
		assert.equal(
			anchors.length,
			0,
			`${reference.id}: full-width reference should not list operations in the sidebar`
		);
	}
});

test("Scalar's link out to its hosted client is disabled", () => {
	// The "Open API Client" link in the request modal opens scalar.com in a new
	// tab, with `utm_source` / `utm_medium` / `utm_campaign` on the URL. It is an
	// attribution link into Scalar's product, not a feature of the customer's
	// docs; see the comment in `src/components/ScalarApiReference.astro`.
	const unescapeQuotes = (s) => s.replace(/&#34;|&quot;/g, '"');

	for (const reference of enabledReferences) {
		const html = unescapeQuotes(readFileSync(htmlFor(reference), 'utf-8'));
		assert.ok(
			html.includes('"hideClientButton":true'),
			`${reference.id}: the link to Scalar's hosted client is not hidden`
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

	for (const reference of enabledReferences) {
		const html = unescapeQuotes(readFileSync(htmlFor(reference), 'utf-8'));
		assert.ok(
			html.includes('"agent":{"disabled":true}'),
			`${reference.id}: the Scalar agent is not disabled`
		);
	}
});
