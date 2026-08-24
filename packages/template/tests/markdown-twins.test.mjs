/**
 * Smoke tests for the Markdown-twin discoverability story:
 *
 *   1. Every real docs page emits a `<link rel="alternate" type="text/markdown">`.
 *   2. Every alternate href resolves to a real `.md` file in the build output.
 *   3. Custom routes with no Markdown source (the Scalar API reference under
 *      `/api/**`) do NOT emit the alternate link.
 *   4. Every `.md` file has well-formed content (non-empty, leading `#`).
 *   5. Those same API reference routes have no `.md` sibling in the output.
 *
 * On (3) and (5): the `/api/**` routes are `.astro` pages that render an
 * OpenAPI document in the browser via Scalar. There is no Markdown behind them
 * to serve, so advertising a twin would point crawlers at a 404.
 *
 * Run after `npm run build`:  `node --test tests/markdown-twins.test.mjs`
 *
 * Content negotiation (`Accept: text/markdown` -> `.md`) is gone: it lived in
 * `vercel.json` rewrites that the Vercel adapter's generated routing config
 * makes inert — measured on the deployed site, see "Resolved: `vercel.json`
 * rewrites" in wiki/private-docs.md. The `.md` twins themselves are unaffected
 * and are what everything links to, which is what this file checks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

import { staticDir } from './helpers/static-dir.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = staticDir(join(__dirname, '..'));

function* walk(dir, predicate) {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(p, predicate);
		else if (predicate(entry.name, p)) yield p;
	}
}

function urlToStaticPath(href) {
	// /index.md           -> <static dir>/index.md
	// /foo/bar.md         -> <static dir>/foo/bar.md
	return join(STATIC_DIR, href.replace(/^\//, ''));
}

function extractAlternateHref(html) {
	const m = html.match(
		/<link[^>]+rel="alternate"[^>]+type="text\/markdown"[^>]*href="([^"]+)"/i
	);
	return m ? m[1] : null;
}

const htmlFiles = [...walk(STATIC_DIR, (name) => name.endsWith('.html'))];
const mdFiles = [...walk(STATIC_DIR, (name) => name.endsWith('.md'))];

const isOpenApiPage = (htmlPath) =>
	relative(STATIC_DIR, htmlPath).split(sep)[0] === 'api';

test('build output exists (did `npm run build` run?)', () => {
	// `staticDir()` already established that the directory exists, so the
	// question here is whether it has anything in it.
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
		if (!extractAlternateHref(html)) missing.push(relative(STATIC_DIR, f));
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
		.map((f) => relative(STATIC_DIR, f));
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
		if (!existsSync(urlToStaticPath(href)))
			broken.push(`${relative(STATIC_DIR, f)} -> ${href}`);
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
			wrongShape.push(`${relative(STATIC_DIR, f)} -> ${href}`);
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
			malformed.push(`${relative(STATIC_DIR, md)}: ${content.slice(0, 40)}…`);
		}
	}
	assert.equal(
		malformed.length,
		0,
		`malformed .md files:\n  ${malformed.join('\n  ')}`
	);
});

test('OpenAPI routes have NO .md sibling in the build output', () => {
	const offending = mdFiles
		.map((p) => relative(STATIC_DIR, p))
		.filter((p) => p.startsWith('api' + sep) || p.startsWith('api.md'));
	assert.equal(
		offending.length,
		0,
		`OpenAPI virtual entries unexpectedly produced .md files:\n  ${offending.join('\n  ')}`
	);
});

test('home page (/index.md) and 404 page (/404.md) both exist as .md', () => {
	assert.ok(existsSync(join(STATIC_DIR, 'index.md')), 'index.md missing');
	assert.ok(existsSync(join(STATIC_DIR, '404.md')), '404.md missing');
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
			existsSync(join(STATIC_DIR, rel)),
			`expected ${rel} in the build output`
		);
	}
});
