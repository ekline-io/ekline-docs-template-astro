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
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	ACCEPT_MARKDOWN,
	acceptsMarkdown,
	escapeRegex,
	negotiationRoutes,
	withMarkdownNegotiation,
	discoverTwins,
	applyToBuildOutput,
} from '../src/lib/vercel-markdown-negotiation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(__dirname, 'fixtures/vercel-config.json'), 'utf-8'));

const TWINS = { root: true, slugs: ['concepts/glossary', 'get-started/quickstart', 'reference/errors'] };

const isRewrite = (r) => r.dest === '/$1.md' || r.dest === '/index.md';
const isVary = (r) => r.continue === true && r.headers?.Vary === 'Accept';

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

test('negotiationRoutes: four routes for root + slugs, in the documented order', () => {
	const routes = negotiationRoutes(TWINS);
	assert.equal(routes.length, 4);
	// 1–2: Vary, with continue, so the HTML response carries it too.
	assert.ok(isVary(routes[0]) && !routes[0].has, 'route 0 is the slug Vary route');
	assert.ok(isVary(routes[1]) && routes[1].src === '^/$', 'route 1 is the root Vary route');
	// 3–4: the rewrites, header-conditional.
	assert.equal(routes[2].dest, '/$1.md');
	assert.equal(routes[3].dest, '/index.md');
	assert.equal(routes[3].src, '^/$');
	for (const r of routes.slice(2)) {
		assert.deepEqual(r.has, [{ type: 'header', key: 'accept', value: ACCEPT_MARKDOWN }]);
		assert.equal(r.headers.Vary, 'Accept');
		assert.equal(r.continue, undefined, 'a rewrite ends routing');
	}
});

test('negotiationRoutes: the slug alternation is exact, escaped, and slash-tolerant', () => {
	// root: false, so only the two slug routes come back.
	const [vary, rewrite] = negotiationRoutes({ root: false, slugs: ['a/b', 'v1.2', 'c'] });
	assert.equal(rewrite.src, '^/(a/b|v1\\.2|c)/?$');
	assert.equal(vary.src, rewrite.src);
	const re = new RegExp(rewrite.src);
	assert.ok(re.test('/a/b/') && re.test('/a/b'), 'with and without the trailing slash');
	assert.ok(!re.test('/a/b/c/') && !re.test('/a') && !re.test('/v1x2/'), 'nothing outside the set');
	assert.equal('/a/b/'.replace(re, '/$1.md'), '/a/b.md', '$1 captures the slug');
});

test('negotiationRoutes: root-only and slugs-only produce two routes; neither produces none', () => {
	assert.equal(negotiationRoutes({ root: true, slugs: [] }).length, 2);
	assert.equal(negotiationRoutes({ root: false, slugs: ['x'] }).length, 2);
	assert.deepEqual(negotiationRoutes({ root: false, slugs: [] }), []);
});

test('negotiationRoutes: constant route count whatever the page count', () => {
	const many = Array.from({ length: 1000 }, (_, i) => `section-${i % 10}/page-${i}`);
	assert.equal(negotiationRoutes({ root: true, slugs: many }).length, 4);
});

test('withMarkdownNegotiation: routes land immediately before the filesystem handle', () => {
	const out = withMarkdownNegotiation(FIXTURE, TWINS);
	const fs = out.routes.findIndex((r) => r.handle === 'filesystem');
	assert.ok(fs >= 4, 'filesystem handle is after our four routes');
	const ours = out.routes.slice(fs - 4, fs);
	assert.equal(ours.filter(isVary).length, 2);
	assert.equal(ours.filter(isRewrite).length, 2);
});

test('withMarkdownNegotiation: every adapter route survives, in order', () => {
	const out = withMarkdownNegotiation(FIXTURE, TWINS);
	const theirs = out.routes.filter((r) => !isVary(r) && !isRewrite(r));
	assert.deepEqual(theirs, FIXTURE.routes);
});

test('withMarkdownNegotiation: does not mutate its input', () => {
	const before = JSON.stringify(FIXTURE);
	withMarkdownNegotiation(FIXTURE, TWINS);
	assert.equal(JSON.stringify(FIXTURE), before);
});

test('withMarkdownNegotiation: everything but routes is carried through untouched', () => {
	const out = withMarkdownNegotiation(FIXTURE, TWINS);
	const { routes: _a, ...restIn } = FIXTURE;
	const { routes: _b, ...restOut } = out;
	assert.deepEqual(restOut, restIn);
});

test('withMarkdownNegotiation: refuses a config with no filesystem handle', () => {
	assert.throws(
		() => withMarkdownNegotiation({ version: 3, routes: [{ src: '/.*', dest: '/x' }] }, TWINS),
		/filesystem/
	);
});

test('withMarkdownNegotiation: refuses to apply twice', () => {
	const once = withMarkdownNegotiation(FIXTURE, TWINS);
	assert.throws(() => withMarkdownNegotiation(once, TWINS), /already/);
});

/** Builds a fake static dir. `files` are POSIX paths relative to the root. */
function fakeStaticDir(files) {
	const dir = mkdtempSync(join(tmpdir(), 'twins-'));
	for (const f of files) {
		mkdirSync(join(dir, dirname(f)), { recursive: true });
		writeFileSync(join(dir, f), f.endsWith('.md') ? '# x\n' : '<!doctype html>');
	}
	return dir;
}

test('discoverTwins: a .md beside <slug>/index.html is a twin; index.md beside index.html is the root', (t) => {
	const dir = fakeStaticDir([
		'index.html',
		'index.md',
		'reference/errors/index.html',
		'reference/errors.md',
		'get-started/quickstart/index.html',
		'get-started/quickstart.md',
	]);
	t.after(() => rmSync(dir, { recursive: true }));
	assert.deepEqual(discoverTwins(dir), { root: true, slugs: ['get-started/quickstart', 'reference/errors'] });
});

test('discoverTwins: a .md with no HTML sibling is not a twin, and HTML with no .md is not either', (t) => {
	const dir = fakeStaticDir([
		'index.html',
		'README.md', // from public/ — no /README/ page
		'404.html',
		'404.md', // beside 404.html, not 404/index.html — the 404 page has no route of its own
		'api/index.html', // Scalar — HTML, no twin
		'guides/example/index.html',
		'guides/example.md',
	]);
	t.after(() => rmSync(dir, { recursive: true }));
	assert.deepEqual(discoverTwins(dir), { root: false, slugs: ['guides/example'] });
});

test('discoverTwins: empty output is no twins, not an error', (t) => {
	const dir = fakeStaticDir(['index.html']);
	t.after(() => rmSync(dir, { recursive: true }));
	assert.deepEqual(discoverTwins(dir), { root: false, slugs: [] });
});

/** A fake project root with a Vercel-shaped build output. */
function fakeProject({ withConfig = true, files = ['index.html', 'index.md', 'guides/example/index.html', 'guides/example.md'] } = {}) {
	const root = mkdtempSync(join(tmpdir(), 'project-'));
	const out = join(root, '.vercel', 'output');
	for (const f of files) {
		mkdirSync(join(out, 'static', dirname(f)), { recursive: true });
		writeFileSync(join(out, 'static', f), f.endsWith('.md') ? '# x\n' : '<!doctype html>');
	}
	if (withConfig) writeFileSync(join(out, 'config.json'), JSON.stringify(FIXTURE));
	return root;
}

/** Runs `fn` with `process.env.VERCEL` set to `value` (or deleted), then restores it. */
function withVercelEnv(value, fn) {
	const had = Object.hasOwn(process.env, 'VERCEL');
	const prev = process.env.VERCEL;
	if (value === undefined) delete process.env.VERCEL;
	else process.env.VERCEL = value;
	try {
		return fn();
	} finally {
		if (had) process.env.VERCEL = prev;
		else delete process.env.VERCEL;
	}
}

test('applyToBuildOutput: patches config.json in place and reports what it did', (t) => {
	const root = fakeProject();
	t.after(() => rmSync(root, { recursive: true }));
	const result = withVercelEnv('1', () => applyToBuildOutput({ projectRoot: root }));
	assert.deepEqual(result, { configPath: join(root, '.vercel/output/config.json'), root: true, slugs: ['guides/example'] });
	const written = JSON.parse(readFileSync(result.configPath, 'utf-8'));
	assert.equal(written.routes.filter(isRewrite).length, 2);
	assert.ok(written.routes.find((r) => r.dest === '/$1.md').src.includes('guides/example'));
});

test('applyToBuildOutput: off Vercel, with no config.json, does nothing and says so', (t) => {
	const root = fakeProject({ withConfig: false });
	t.after(() => rmSync(root, { recursive: true }));
	assert.equal(withVercelEnv(undefined, () => applyToBuildOutput({ projectRoot: root })), null);
	assert.ok(!existsSync(join(root, '.vercel/output/config.json')), 'nothing was created');
});

test('applyToBuildOutput: on Vercel, with no config.json, throws rather than shipping without the feature', (t) => {
	const root = fakeProject({ withConfig: false });
	t.after(() => rmSync(root, { recursive: true }));
	assert.throws(() => withVercelEnv('1', () => applyToBuildOutput({ projectRoot: root })), /config\.json.*not found|ordering/i);
});
