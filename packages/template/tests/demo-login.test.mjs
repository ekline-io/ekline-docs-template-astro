/**
 * Unit tests for the demo login's pure logic.
 *
 * `/demo-login` mints real handoff tokens when enabled, so what these tests
 * pin down is the refusals: an unknown persona id must never reach a JWT, a
 * cross-origin `redirect_uri` must never become a redirect target (it would be
 * an open redirector handing a signed token to an arbitrary site), and the
 * flag must not answer to creative spellings.
 *
 * Run:  node --test tests/demo-login.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	personas,
	findPersona,
	isDemoFlagEnabled,
	parseDemoRedirectUri,
} from '../src/lib/demo-login.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

test('every persona id resolves to itself', () => {
	for (const persona of personas) {
		assert.equal(findPersona(persona.id), persona);
	}
});

test('unknown, empty and non-string ids resolve to null', () => {
	for (const id of [
		'initech',
		'ACME',
		' acme',
		'',
		undefined,
		null,
		7,
		['acme'],
		// Not live bugs today — `findPersona` walks the array with `.find`, not
		// a property lookup — but a future refactor to an object keyed by id is
		// an easy one to reach for, and that is exactly where these two turn
		// into prototype pollution / arbitrary-method access. Pinning the
		// refusal now stops that refactor from shipping quietly.
		'__proto__',
		'constructor',
	]) {
		assert.equal(findPersona(id), null, String(id));
	}
});

test('persona orgs name real folders under src/content/org-docs/', () => {
	// The demo signs `orgs` claims; the guard compares them byte-verbatim to
	// folder names (wiki/private-docs.md). A persona pointing at a folder that
	// does not exist demos an empty section and looks like a broken feature.
	const folders = readdirSync(join(ROOT, 'src/content/org-docs'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	for (const persona of personas) {
		for (const org of persona.orgs) {
			assert.ok(folders.includes(org), `persona "${persona.id}" names missing org "${org}"`);
		}
	}
});

test('at least one persona demonstrates each side of org isolation', () => {
	// The demo's job is showing that Acme cannot read Globex. That needs two
	// personas in different single orgs, plus one in none.
	assert.ok(personas.some((p) => p.orgs.length === 1 && p.orgs[0] === 'acme'));
	assert.ok(personas.some((p) => p.orgs.length === 1 && p.orgs[0] === 'globex'));
	assert.ok(personas.some((p) => p.orgs.length === 0));
});

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

test('the flag answers only to its two documented spellings', () => {
	assert.equal(isDemoFlagEnabled('1'), true);
	assert.equal(isDemoFlagEnabled('true'), true);
	for (const value of ['', '0', 'false', 'TRUE', 'True', 'yes', 'on', ' 1', undefined, null, 1, true]) {
		assert.equal(isDemoFlagEnabled(value), false, String(value));
	}
});

// ---------------------------------------------------------------------------
// redirect_uri
// ---------------------------------------------------------------------------

const ORIGIN = 'http://localhost:4321';
const CALLBACK = '/auth/callback';

test('parses the site\'s own callback URL', () => {
	assert.equal(
		parseDemoRedirectUri('http://localhost:4321/auth/callback', ORIGIN, CALLBACK)?.href,
		'http://localhost:4321/auth/callback'
	);
	// Trailing slash tolerated on both sides: whether one is emitted depends on
	// `build.format` / `trailingSlash`, and neither side is authoritative.
	assert.equal(
		parseDemoRedirectUri('http://localhost:4321/auth/callback/', ORIGIN, CALLBACK)?.href,
		'http://localhost:4321/auth/callback/'
	);
	// A subpath deployment: `withBase` hands in the base-prefixed path, and the
	// middleware builds the same one, so the two agree.
	assert.equal(
		parseDemoRedirectUri(
			'http://localhost:4321/docs/auth/callback',
			ORIGIN,
			'/docs/auth/callback'
		)?.href,
		'http://localhost:4321/docs/auth/callback'
	);
});

test('refuses a same-origin URL that is not the callback', () => {
	// Same origin is necessary but not sufficient. The signed token is appended
	// as a query parameter, so any other destination lands a live handoff token
	// in that page's URL — where analytics recording the full URL would ship it
	// onward. The flow only ever redirects to one path, so only that path is
	// accepted.
	for (const value of [
		'http://localhost:4321/', // the site root
		'http://localhost:4321/guides/example/', // a public docs page
		'http://localhost:4321/demo-login', // this route, back at itself
		'http://localhost:4321/auth/logout', // a sibling auth route
		'http://localhost:4321/auth/callback/extra', // deeper than the callback
		'http://localhost:4321/docs/auth/callback', // right shape, wrong base
	]) {
		assert.equal(parseDemoRedirectUri(value, ORIGIN, CALLBACK), null, value);
	}
	// Percent-encoding is not a way past it: `URL` decodes the path once, and
	// the comparison happens after that.
	assert.equal(
		parseDemoRedirectUri('http://localhost:4321/auth%2Fcallback', ORIGIN, CALLBACK),
		null
	);
});

test('refuses anything not same-origin', () => {
	for (const value of [
		'https://evil.example/auth/callback', // wrong host
		'http://localhost:9999/auth/callback', // wrong port
		'https://localhost:4321/auth/callback', // wrong scheme, so wrong origin
		'//evil.example/auth/callback', // protocol-relative: not absolute, URL() throws
		'/auth/callback', // relative: URL() throws
		// Non-http(s), so the scheme check refuses it before origin is compared.
		// (Its origin is the opaque "null", which would also fail — but that is no
		// longer the branch it takes.)
		'javascript:alert(1)',
		'not a url',
		'',
		undefined,
		null,
		7,
	]) {
		assert.equal(parseDemoRedirectUri(value, ORIGIN, CALLBACK), null, String(value));
	}
});

test('redirect_uri: adversarial cases from URL parsing quirks', () => {
	// Measured on Node v22 — each comment states the actual behaviour, not an
	// assumption about it.

	// Userinfo does not participate in `origin` at all, so it rides along
	// unchanged and the URL is accepted.
	assert.equal(
		parseDemoRedirectUri('http://user:pass@localhost:4321/auth/callback', ORIGIN, CALLBACK)?.href,
		'http://user:pass@localhost:4321/auth/callback'
	);

	// Looks like a same-origin bypass smuggling "evil.example" into the host —
	// it is not. With no `:` before the `@`, "evil.example" parses as a bare
	// username and the host is still `localhost:4321`, so this is accepted too.
	// Worth pinning precisely because it looks like it should be refused.
	assert.equal(
		parseDemoRedirectUri('http://evil.example@localhost:4321/auth/callback', ORIGIN, CALLBACK)?.href,
		'http://evil.example@localhost:4321/auth/callback'
	);

	// `http` is a "special scheme" per the WHATWG URL spec, so backslashes are
	// treated as path separators exactly like forward slashes — this parses to
	// the same URL as the forward-slash spelling and is accepted.
	assert.equal(
		parseDemoRedirectUri('http:\\\\localhost:4321\\auth\\callback', ORIGIN, CALLBACK)?.href,
		'http://localhost:4321/auth/callback'
	);

	// Looks like a subdomain-suffix attack (`localhost:4321.evil.example`
	// reading as host `localhost`, port `4321.evil.example`). It never gets
	// that far: a port must be all digits, so `URL()` itself throws Invalid
	// URL and this is refused by the catch branch — not by an origin
	// mismatch, which is the outcome one might expect from the shape of the
	// attack, but the refusal lands either way.
	assert.equal(parseDemoRedirectUri('http://localhost:4321.evil.example/', ORIGIN, CALLBACK), null);

	// Pins the scheme check as a defense in its own right, not just a side
	// effect of the origin comparison: `URL#origin` alone says this is
	// same-origin (`new URL('blob:http://localhost:4321/x').origin ===
	// 'http://localhost:4321'`), but `blob:` is not a scheme a browser can be
	// redirected to, and the scheme check refuses it before origin is ever
	// compared.
	assert.equal(parseDemoRedirectUri('blob:http://localhost:4321/x', ORIGIN, CALLBACK), null);
});
