/**
 * Unit tests for `src/lib/vercel-markdown-negotiation.mjs` — the pure parts.
 *
 * No build, no network, no Vercel. The transform is tested against
 * `tests/fixtures/vercel-config.json`, a real `config.json` captured from a
 * `VERCEL=1 astro build`, so these assertions hold for the shape the adapter
 * actually writes. What they cannot see is whether Vercel's router evaluates
 * the routes the way its documentation says; `tests/deployed-smoke.test.mjs`
 * covers that against a real deployment.
 *
 * Run: `node --test tests/markdown-negotiation.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ACCEPT_MARKDOWN,
	acceptsMarkdown,
	escapeRegex,
} from '../src/lib/vercel-markdown-negotiation.mjs';

// Real headers. Chrome/Firefox/Safari defaults as of 2026; `*/*` is curl's.
const CHROME =
	'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
const FIREFOX = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
const SAFARI = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const CURL = '*/*';

test('acceptsMarkdown: matches text/markdown as a media-type token', () => {
	for (const accept of [
		'text/markdown',
		'text/markdown;q=0.9',
		'text/markdown, text/plain;q=0.9, */*;q=0.8', // the realistic agent header
		'text/plain, text/markdown',
		'text/plain,text/markdown', // no space after the comma
		'application/json, text/markdown;q=0.5, */*;q=0.1',
	]) {
		assert.ok(acceptsMarkdown(accept), `should match: ${accept}`);
	}
});

test('acceptsMarkdown: rejects browsers, curl, empty, and near-misses', () => {
	for (const accept of [CHROME, FIREFOX, SAFARI, CURL, '', undefined, null, 'text/markdownx', 'application/markdown', 'text/x-markdown']) {
		assert.ok(!acceptsMarkdown(accept), `should NOT match: ${String(accept)}`);
	}
});

test('ACCEPT_MARKDOWN gives the same answers unanchored as anchored', () => {
	// Vercel documents `has.value` as a regex but not whether it is anchored to
	// the whole header. The pattern is written so it does not matter; this
	// test is what makes that a fact rather than a hope.
	const unanchored = new RegExp(ACCEPT_MARKDOWN);
	const anchored = new RegExp(`^(?:${ACCEPT_MARKDOWN})$`);
	for (const accept of ['text/markdown', 'text/markdown, */*', 'text/plain, text/markdown', CHROME, CURL, 'text/markdownx']) {
		assert.equal(unanchored.test(accept), anchored.test(accept), `disagree on: ${accept}`);
	}
});

test('escapeRegex: metacharacters in a slug become literals', () => {
	assert.equal(escapeRegex('reference/errors'), 'reference/errors');
	assert.equal(escapeRegex('v1.2/api'), 'v1\\.2/api');
	assert.equal(escapeRegex('a+b (c)'), 'a\\+b \\(c\\)');
	assert.equal(new RegExp(`^${escapeRegex('v1.2')}$`).test('v1x2'), false, 'the dot must not be a wildcard');
});
