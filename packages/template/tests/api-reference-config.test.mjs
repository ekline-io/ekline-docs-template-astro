/**
 * Unit tests for the API reference config helpers.
 *
 * These pin the rules that turn one `spec` value into the URL the browser
 * fetches, and the config mistakes that fail a build by name. They run against
 * the module directly, not the built site.
 *
 * Run:  node --test tests/api-reference-config.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	specUrlFor,
	emittedFileFor,
	needsEmit,
	validateReferences,
	emittedReferences,
	enabledReferences,
} from '../src/config/api-reference.mjs';

/** A complete, valid reference with the given fields changed. */
const ref = (overrides = {}) => ({
	id: 'payments',
	enabled: true,
	slug: '',
	layout: 'docs',
	spec: './public/openapi.yaml',
	label: 'API reference',
	title: 'API reference',
	description: 'Example.',
	...overrides,
});

// --- specUrlFor: the four rules, in order -----------------------------------

test('an explicit specUrl wins verbatim and nothing is emitted', () => {
	const reference = ref({ spec: '../api/openapi.yaml', specUrl: '/custom/openapi.yaml' });
	assert.equal(specUrlFor(reference), '/custom/openapi.yaml');
	assert.equal(needsEmit(reference), false);
});

test("a live remote document is fetched from its origin", () => {
	const reference = ref({ spec: 'https://api.example.com/openapi.yaml', serve: 'live' });
	assert.equal(specUrlFor(reference), 'https://api.example.com/openapi.yaml');
	assert.equal(needsEmit(reference), false);
});

test('a document under public/ is served from the site root', () => {
	assert.equal(specUrlFor(ref({ spec: './public/openapi.yaml' })), '/openapi.yaml');
	assert.equal(specUrlFor(ref({ spec: 'public/openapi.yaml' })), '/openapi.yaml');
	assert.equal(specUrlFor(ref({ spec: './public/specs/v2/openapi.json' })), '/specs/v2/openapi.json');
	assert.equal(needsEmit(ref({ spec: './public/openapi.yaml' })), false);
});

test('a document elsewhere on disk is emitted under /api-spec/', () => {
	const reference = ref({ spec: '../api/openapi.yaml' });
	assert.equal(specUrlFor(reference), '/api-spec/payments.yaml');
	assert.equal(needsEmit(reference), true);
});

test('a remote document is snapshotted by default', () => {
	const reference = ref({ spec: 'https://api.example.com/openapi.json' });
	assert.equal(specUrlFor(reference), '/api-spec/payments.json');
	assert.equal(needsEmit(reference), true);

	// Saying it explicitly changes nothing.
	assert.equal(specUrlFor(ref({ ...reference, serve: 'snapshot' })), '/api-spec/payments.json');
});

test('a public/ path is matched as a path, not a substring', () => {
	// `./not-public/openapi.yaml` and `../public/openapi.yaml` are not this
	// project's public directory and must be emitted, not served from the root.
	assert.equal(specUrlFor(ref({ spec: './not-public/openapi.yaml' })), '/api-spec/payments.yaml');
	assert.equal(specUrlFor(ref({ spec: '../public/openapi.yaml' })), '/api-spec/payments.yaml');
});

// --- publicUrlFor (via specUrlFor/needsEmit): reject an unrequestable remainder ---

test('an empty segment in the public/ remainder falls through to rule 4', () => {
	// `./public//openapi.yaml` would otherwise derive `//openapi.yaml`, which a
	// browser resolves as protocol-relative — a cross-origin request to a host
	// named "openapi.yaml" — not a request for this site's own file.
	const reference = ref({ spec: './public//openapi.yaml' });
	assert.equal(specUrlFor(reference), '/api-spec/payments.yaml');
	assert.equal(needsEmit(reference), true);
});

test('a .. segment in the public/ remainder falls through to rule 4', () => {
	// `public/../secret.yaml` would otherwise derive `/../secret.yaml`, which
	// normalises to `/secret.yaml` — outside `public/` and served by nothing.
	const reference = ref({ spec: 'public/../secret.yaml' });
	assert.equal(specUrlFor(reference), '/api-spec/payments.yaml');
	assert.equal(needsEmit(reference), true);
});

// --- specUrlFor: base prefixing (Finding 1) ---------------------------------

test('rule 3 (a public/ path) is prefixed with a configured base', () => {
	const reference = ref({ spec: './public/openapi.yaml' });
	assert.equal(specUrlFor(reference, { base: '/docs' }), '/docs/openapi.yaml');
	// `BASE_URL` may or may not carry a trailing slash depending on
	// `trailingSlash` — both spellings must derive the same URL.
	assert.equal(specUrlFor(reference, { base: '/docs/' }), '/docs/openapi.yaml');
});

test('rule 4 (the emitted endpoint) is prefixed with a configured base', () => {
	const reference = ref({ spec: '../api/openapi.yaml' });
	assert.equal(specUrlFor(reference, { base: '/docs' }), '/docs/api-spec/payments.yaml');
	assert.equal(specUrlFor(reference, { base: '/docs/' }), '/docs/api-spec/payments.yaml');
});

test('rule 1 (an explicit specUrl) ignores a configured base', () => {
	// The customer wrote this string themselves; it is used verbatim regardless
	// of where the site is deployed.
	const reference = ref({ spec: '../api/openapi.yaml', specUrl: '/custom/openapi.yaml' });
	assert.equal(specUrlFor(reference, { base: '/docs' }), '/custom/openapi.yaml');
});

test('rule 2 (a live remote URL) ignores a configured base', () => {
	// Already absolute — prefixing it would produce a URL that does not exist.
	const reference = ref({ spec: 'https://api.example.com/openapi.yaml', serve: 'live' });
	assert.equal(specUrlFor(reference, { base: '/docs' }), 'https://api.example.com/openapi.yaml');
});

test('the default base (no option passed) behaves exactly as before', () => {
	// `import.meta.env` is undefined under `node --test`, so the default
	// argument resolves to '/' and every call site in the existing suite keeps
	// its pre-`base` answer with no changes required there.
	assert.equal(specUrlFor(ref({ spec: './public/openapi.yaml' })), '/openapi.yaml');
	assert.equal(specUrlFor(ref({ spec: '../api/openapi.yaml' })), '/api-spec/payments.yaml');
});

// --- emittedFileFor: the extension ------------------------------------------

test('the emitted file takes its extension from the source', () => {
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi.json' })), 'payments.json');
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi.yaml' })), 'payments.yaml');
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi.yml' })), 'payments.yaml');
	assert.equal(emittedFileFor(ref({ spec: '../api/openapi' })), 'payments.yaml');
});

test('a URL with a query string still gets the right extension', () => {
	assert.equal(
		emittedFileFor(ref({ spec: 'https://api.example.com/openapi.json?version=2' })),
		'payments.json'
	);
});

// --- validateReferences: mistakes that fail the build by name ---------------

test("serve: 'live' on a file is a config error", () => {
	assert.throws(
		() => validateReferences([ref({ serve: 'live' })]),
		/"payments" sets serve: 'live' but its spec is a file, not a URL/
	);
});

test('an unknown serve value is a config error', () => {
	assert.throws(
		() => validateReferences([ref({ spec: 'https://api.example.com/openapi.yaml', serve: 'cached' })]),
		/"payments" sets serve: 'cached'.*'snapshot'.*'live'/s
	);
});

test('two references sharing an id is a config error', () => {
	assert.throws(
		() => validateReferences([ref({ slug: 'a' }), ref({ slug: 'b' })]),
		/Two references share the id "payments"/
	);
});

test('two references sharing a route is a config error', () => {
	assert.throws(
		() => validateReferences([ref({ id: 'a' }), ref({ id: 'b' })]),
		/Two references are configured at "\/api\/"/
	);
});

test('disabled references are not validated', () => {
	assert.doesNotThrow(() => validateReferences([ref({ serve: 'live', enabled: false })]));
});

test('a valid list passes', () => {
	assert.doesNotThrow(() =>
		validateReferences([
			ref(),
			ref({ id: 'admin', slug: 'admin', spec: 'https://api.example.com/admin.yaml', serve: 'live' }),
		])
	);
});

// --- the shipped config -----------------------------------------------------

test('the shipped references live in public/ and emit nothing', () => {
	assert.ok(enabledReferences.length >= 1);
	assert.deepEqual(emittedReferences, []);
	for (const reference of enabledReferences) {
		assert.ok(specUrlFor(reference).startsWith('/'), `${reference.id}: expected a site-root URL`);
		assert.ok(!('specUrl' in reference), `${reference.id}: shipped entries no longer set specUrl`);
	}
});
