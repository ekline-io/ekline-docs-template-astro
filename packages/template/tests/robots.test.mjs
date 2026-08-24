/**
 * `robots.txt` is generated, not shipped, so what it says depends on config —
 * exactly the kind of thing that goes wrong silently.
 *
 * Two properties, each with a real failure behind it:
 *
 *   1. The `Disallow` path carries the configured `base`. A literal
 *      `/private/` matches nothing on a site built with `base: '/docs'`, where
 *      the guarded routes answer at `/docs/private/` — so crawlers walk the
 *      sign-in link and collect an SSO redirect per page. Measured on a real
 *      build before this was fixed.
 *   2. It never advertises a sitemap on the shipped `example.com` placeholder.
 *      A customer who has not set `site` would otherwise point crawlers at a
 *      domain they do not own — the misconfiguration that put
 *      `https://example.com` canonicals on a live deployment once.
 *
 * These call `robotsBody` — the same function the route calls — rather than
 * re-implementing it. That split exists precisely so this file cannot pass
 * while the route is broken.
 *
 * Run: node --test tests/robots.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { robotsBody } from '../src/lib/robots.mjs';
import { staticDir } from './helpers/static-dir.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('the built robots.txt disallows the guarded prefix', () => {
	// The real artifact, from the real build, with this template's own config.
	const body = readFileSync(join(staticDir(ROOT), 'robots.txt'), 'utf8');
	assert.match(body, /^User-agent: \*$/m);
	assert.match(body, /^Disallow: \/private\/$/m, 'the guarded prefix is not disallowed');
});

test('the Disallow path carries a configured base', () => {
	// The failure this exists for: on `base: '/docs'` the guarded routes answer
	// at /docs/private/, so a literal /private/ matches nothing on that host.
	// `withBase('/private/')` is what the route passes; this is that value.
	const body = robotsBody({
		privatePath: '/docs/private/',
		site: new URL('https://docs.example.org'),
	});
	assert.match(body, /^Disallow: \/docs\/private\/$/m);
	assert.doesNotMatch(body, /^Disallow: \/private\/$/m, 'emitted the base-less path too');
});

test('no sitemap is advertised while site is still the placeholder', () => {
	const placeholder = robotsBody({
		privatePath: '/private/',
		site: new URL('https://example.com'),
	});
	assert.doesNotMatch(placeholder, /Sitemap:/, 'advertised a sitemap on example.com');

	// And nothing at all is worse than nothing: an unset `site` must not throw.
	const unset = robotsBody({ privatePath: '/private/', site: undefined });
	assert.doesNotMatch(unset, /Sitemap:/);
	assert.match(unset, /^Disallow: \/private\/$/m);
});

test('a real site gets a root-level sitemap URL', () => {
	// `@astrojs/sitemap` writes its index at the origin root regardless of
	// `base` (measured), so root-level is correct — this pins that the two agree.
	const body = robotsBody({
		privatePath: '/docs/private/',
		site: new URL('https://docs.example.org'),
	});
	assert.match(body, /^Sitemap: https:\/\/docs\.example\.org\/sitemap-index\.xml$/m);
});

test('the route passes a base-aware path, not a literal one', () => {
	// `robotsBody` is pure and takes the path as an argument, so every test
	// above passes whatever the route actually supplies. The bug this file
	// exists for lived in the *call site*: a hardcoded `/private/` that matches
	// nothing on a `base: '/docs'` deployment.
	//
	// Asserting on source rather than behaviour, deliberately. The alternative
	// is a second full build with a base configured, which costs more than this
	// pins. If you rewrite the route, keep it passing a value derived from
	// `withBase` — that is the whole property.
	const route = readFileSync(join(ROOT, 'src/pages/robots.txt.ts'), 'utf8');
	assert.match(
		route,
		/privatePath:\s*withBase\(/,
		'the route no longer derives the disallowed path from withBase — a base deployment would disallow nothing'
	);
});
