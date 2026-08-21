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
 * (The sitemap test at the end needs a build; `npm test` provides one.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	personas,
	findPersona,
	isDemoFlagEnabled,
	isDemoRedirectUri,
} from '../src/lib/demo-login.mjs';
import { staticDir } from './helpers/static-dir.mjs';

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
	for (const id of ['initech', 'ACME', ' acme', '', undefined, null, 7, ['acme']]) {
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

test('a same-origin absolute redirect_uri is accepted', () => {
	assert.equal(isDemoRedirectUri('http://localhost:4321/auth/callback', ORIGIN), true);
	// The base path rides in the path, not the origin, so a subpath deployment
	// passes the same check.
	assert.equal(isDemoRedirectUri('http://localhost:4321/docs/auth/callback', ORIGIN), true);
});

test('anything not same-origin is refused', () => {
	for (const value of [
		'https://evil.example/auth/callback', // wrong host
		'http://localhost:9999/auth/callback', // wrong port
		'https://localhost:4321/auth/callback', // wrong scheme, so wrong origin
		'//evil.example/auth/callback', // protocol-relative: not absolute, URL() throws
		'/auth/callback', // relative: URL() throws
		'javascript:alert(1)', // no origin to match
		'not a url',
		'',
		undefined,
		null,
		7,
	]) {
		assert.equal(isDemoRedirectUri(value, ORIGIN), false, String(value));
	}
});

// ---------------------------------------------------------------------------
// Build output (needs `npm run build` first; `npm test` runs one)
// ---------------------------------------------------------------------------

test('the sitemap does not reference /demo-login', () => {
	// `/demo-login` is a *static* pathname with `prerender = false` — exactly
	// the shape `@astrojs/sitemap` advertises unless filtered, because it never
	// consults `isPrerendered` (measured; see wiki/private-docs.md). The filter
	// lives in `astro.config.mjs`; this pins it.
	const STATIC = staticDir(ROOT);
	const files = readdirSync(STATIC).filter((file) => /^sitemap.*\.xml$/.test(file));
	assert.ok(files.length > 0, 'no sitemap files found');
	for (const file of files) {
		const xml = readFileSync(join(STATIC, file), 'utf8');
		assert.ok(!xml.includes('demo-login'), `${file} advertises /demo-login`);
	}
});
