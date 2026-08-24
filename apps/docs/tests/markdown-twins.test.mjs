/**
 * Smoke tests for the Markdown-twin discoverability story:
 *
 *   1. Every real docs page emits a `<link rel="alternate" type="text/markdown">`.
 *   2. Every alternate href resolves to a real `.md` file in the build output.
 *   3. Custom routes with no Markdown source — the Internals section under
 *      `/internals/**`, rendered from the `wiki` collection, not `docs` (see
 *      `src/loaders/wiki.mjs` and `src/content.config.ts`) — do NOT emit the
 *      alternate link.
 *   4. Every `.md` file has well-formed content (non-empty, leading `#`).
 *   5. Those same Internals routes have no `.md` sibling in the output.
 *
 * On (3) and (5): `@ekline/starlight-contextual-menu`'s `injectMarkdownRoutes`
 * only generates `.md` twins for entries in the `docs` collection
 * (`MarkdownAlternate.astro` checks `entry.collection === 'docs'` against
 * `getCollection('docs')`), and `/internals/**` pages come from `wiki`
 * instead — deliberately: see `src/content.config.ts`'s comment on why that
 * collection is kept separate. Advertising a twin that route can't serve
 * would point crawlers at a 404. This mirrors how `packages/template`'s own
 * `markdown-twins.test.mjs` treats its Scalar API-reference routes.
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

const isInternalsPage = (htmlPath) =>
	relative(STATIC_DIR, htmlPath).split(sep)[0] === 'internals';

test('build output exists (did `npm run build` run?)', () => {
	// `staticDir()` already established that the directory exists, so the
	// question here is whether it has anything in it.
	assert.ok(htmlFiles.length > 0, 'no .html files emitted');
	assert.ok(mdFiles.length > 0, 'no .md files emitted');
});

test('real docs pages emit <link rel="alternate" type="text/markdown">', () => {
	// Starlight's built-in 404 fallback isn't a `docs` collection entry (this
	// site currently has no custom 404 page — see `astro.config.mjs`), so it
	// has no Markdown source and is excluded here for the same reason
	// `/internals/**` is.
	const expected = htmlFiles.filter((f) => !isInternalsPage(f) && !f.endsWith('404.html'));
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

test('Internals pages do NOT emit the alternate link', () => {
	const offenders = htmlFiles
		.filter(isInternalsPage)
		.filter((f) => extractAlternateHref(readFileSync(f, 'utf-8')))
		.map((f) => relative(STATIC_DIR, f));
	assert.equal(
		offenders.length,
		0,
		`Internals pages have an alternate link (would 404):\n  ${offenders.join('\n  ')}`
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

test('Internals routes have NO .md sibling in the build output', () => {
	const offending = mdFiles
		.map((p) => relative(STATIC_DIR, p))
		.filter((p) => p.startsWith('internals' + sep) || p === 'internals.md');
	assert.equal(
		offending.length,
		0,
		`Internals entries unexpectedly produced .md files:\n  ${offending.join('\n  ')}`
	);
});

test('home page (/index.md) exists as .md', () => {
	// No custom 404 page exists yet (see `astro.config.mjs`), so there is no
	// `404.md` to assert on — Starlight's built-in fallback isn't a `docs`
	// collection entry and gets no Markdown twin. Revisit once one exists.
	assert.ok(existsSync(join(STATIC_DIR, 'index.md')), 'index.md missing');
});

// TODO(Tasks 3-7): once real pages replace the temporary `index.mdx`
// placeholder, restore a "sample of expected /<slug>.md files exist" test
// against the real page set — this template had one for its example content,
// removed here because that content doesn't exist yet.
