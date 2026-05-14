/**
 * Smoke tests for the Markdown-twin discoverability story:
 *
 *   1. Every real docs page emits a `<link rel="alternate" type="text/markdown">`.
 *   2. Every alternate href resolves to a real `.md` file in `dist/`.
 *   3. Auto-generated / virtual pages (e.g. starlight-openapi `/api/**`) do
 *      NOT emit the alternate link.
 *   4. Every `.md` file has well-formed content (non-empty, leading `#`).
 *   5. The OpenAPI virtual pages do NOT have a `.md` sibling in `dist/`.
 *
 * Run after `npm run build`:  `node --test tests/markdown-twins.test.mjs`
 *
 * Content negotiation (`Accept: text/markdown` -> `.md`) is configured in
 * `vercel.json` and runs only at the Vercel edge — not exercised here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

function* walk(dir, predicate) {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(p, predicate);
		else if (predicate(entry.name, p)) yield p;
	}
}

function urlForHtml(htmlPath) {
	// dist/index.html       -> /
	// dist/foo/index.html   -> /foo/
	// dist/404.html         -> /404/  (Astro emits 404 at file level)
	const rel = relative(DIST, htmlPath).split(sep).join('/');
	if (rel === 'index.html') return '/';
	if (rel.endsWith('/index.html'))
		return '/' + rel.slice(0, -'index.html'.length);
	return '/' + rel.replace(/\.html$/, '/');
}

function urlToDistPath(href) {
	// /index.md           -> dist/index.md
	// /foo/bar.md         -> dist/foo/bar.md
	return join(DIST, href.replace(/^\//, ''));
}

function extractAlternateHref(html) {
	const m = html.match(
		/<link[^>]+rel="alternate"[^>]+type="text\/markdown"[^>]*href="([^"]+)"/i
	);
	return m ? m[1] : null;
}

const htmlFiles = [...walk(DIST, (name) => name.endsWith('.html'))];
const mdFiles = [...walk(DIST, (name) => name.endsWith('.md'))];

const isOpenApiPage = (htmlPath) =>
	relative(DIST, htmlPath).split(sep)[0] === 'api';

test('build output exists (did `npm run build` run?)', () => {
	assert.ok(existsSync(DIST), 'dist/ does not exist');
	assert.ok(htmlFiles.length > 0, 'no .html files emitted');
	assert.ok(mdFiles.length > 0, 'no .md files emitted');
});

test('real docs pages emit <link rel="alternate" type="text/markdown">', () => {
	const expected = htmlFiles.filter(
		(f) => !isOpenApiPage(f) && !f.endsWith('404.html')
	);
	const missing = [];
	for (const f of expected) {
		const html = readFileSync(f, 'utf-8');
		if (!extractAlternateHref(html)) missing.push(relative(DIST, f));
	}
	assert.equal(
		missing.length,
		0,
		`pages missing alternate link:\n  ${missing.join('\n  ')}`
	);
});

test('OpenAPI virtual pages do NOT emit the alternate link', () => {
	const offenders = htmlFiles
		.filter(isOpenApiPage)
		.filter((f) => extractAlternateHref(readFileSync(f, 'utf-8')))
		.map((f) => relative(DIST, f));
	assert.equal(
		offenders.length,
		0,
		`OpenAPI pages have an alternate link (would 404):\n  ${offenders.join('\n  ')}`
	);
});

test('every alternate href resolves to a real .md file', () => {
	const broken = [];
	for (const f of htmlFiles) {
		const href = extractAlternateHref(readFileSync(f, 'utf-8'));
		if (!href) continue;
		if (!existsSync(urlToDistPath(href)))
			broken.push(`${relative(DIST, f)} -> ${href}`);
	}
	assert.equal(
		broken.length,
		0,
		`alternate links pointing to non-existent files:\n  ${broken.join('\n  ')}`
	);
});

test('alternate href follows the `<url>.md` convention (no /index.md tail)', () => {
	const wrongShape = [];
	for (const f of htmlFiles) {
		const href = extractAlternateHref(readFileSync(f, 'utf-8'));
		if (!href) continue;
		// Allowed: '/index.md' (root) or any '/foo/bar.md'.
		// Not allowed: '/foo/bar/index.md' (the old upstream pattern).
		if (
			href !== '/index.md' &&
			/\/index\.md$/.test(href)
		) {
			wrongShape.push(`${relative(DIST, f)} -> ${href}`);
		}
	}
	assert.equal(
		wrongShape.length,
		0,
		`alternate links using the legacy /index.md tail:\n  ${wrongShape.join('\n  ')}`
	);
});

test('every emitted .md file is non-empty and starts with `# `', () => {
	const malformed = [];
	for (const md of mdFiles) {
		const content = readFileSync(md, 'utf-8');
		if (content.length < 4 || !content.startsWith('# ')) {
			malformed.push(`${relative(DIST, md)}: ${content.slice(0, 40)}…`);
		}
	}
	assert.equal(
		malformed.length,
		0,
		`malformed .md files:\n  ${malformed.join('\n  ')}`
	);
});

test('OpenAPI virtual pages have NO .md sibling in dist/', () => {
	const offending = mdFiles
		.map((p) => relative(DIST, p))
		.filter((p) => p.startsWith('api' + sep) || p.startsWith('api.md'));
	assert.equal(
		offending.length,
		0,
		`OpenAPI virtual entries unexpectedly produced .md files:\n  ${offending.join('\n  ')}`
	);
});

test('home page (/index.md) and 404 page (/404.md) both exist as .md', () => {
	assert.ok(existsSync(join(DIST, 'index.md')), 'dist/index.md missing');
	assert.ok(existsSync(join(DIST, '404.md')), 'dist/404.md missing');
});

test('sample of expected /<slug>.md files exist (canonical convention)', () => {
	const canonical = [
		'concepts/glossary.md',
		'get-started/quickstart.md',
		'reference/errors.md',
		'changelog.md',
	];
	for (const rel of canonical) {
		assert.ok(
			existsSync(join(DIST, rel)),
			`expected dist/${rel} to exist`
		);
	}
});
