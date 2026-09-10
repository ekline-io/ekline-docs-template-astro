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
 * Content negotiation (`Accept: text/markdown` -> `.md`) is provided on Vercel
 * by the template's `src/lib/vercel-markdown-negotiation.mjs`, which this
 * site imports, and which writes routes into the adapter's
 * `.vercel/output/config.json`. When this suite runs against that output
 * (`VERCEL=1 npm run build`), the last tests below check the routing config
 * against the files on disk — in particular that no `/internals/**` route,
 * which has no twin, is in it. On a plain build they are skipped.
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

// ---------------------------------------------------------------------------
// Vercel-adapter builds only: the routing config must agree with the disk.
// ---------------------------------------------------------------------------

// What tells a Vercel build apart is the routing config, not where the static
// files landed. The adapter *copies* its output into `.vercel/output/static/`
// rather than moving it, so a Vercel build leaves `dist/client/` in place as
// well and `staticDir()` — which prefers `dist/client` — resolves there on both
// kinds of build. The config is the thing only a Vercel build produces, and it
// is what these tests read anyway.
const VERCEL_CONFIG = join(__dirname, '..', '.vercel', 'output', 'config.json');
const IS_VERCEL_OUTPUT = existsSync(VERCEL_CONFIG);
const unlessVercel = IS_VERCEL_OUTPUT
	? false
	: 'Node-adapter build; run `VERCEL=1 npm run build` to check the Vercel routing config';

const readVercelConfig = () => JSON.parse(readFileSync(VERCEL_CONFIG, 'utf-8'));
const isRewrite = (r) => r.dest === '/$1.md' || r.dest === '/index.md';
const isVary = (r) => r.continue === true && r.headers?.Vary === 'Accept';

/** The slugs a twin definition yields from disk: `<slug>.md` beside `<slug>/index.html`. */
function twinSlugsOnDisk() {
	return mdFiles
		.map((p) => relative(STATIC_DIR, p).split(sep).join('/'))
		.filter((rel) => rel !== 'index.md')
		.map((rel) => rel.slice(0, -'.md'.length))
		.filter((slug) => existsSync(join(STATIC_DIR, ...slug.split('/'), 'index.html')))
		.sort();
}

test('Vercel config.json: the four negotiation routes sit just before the filesystem handle', { skip: unlessVercel }, () => {
	const { routes } = readVercelConfig();
	const fs = routes.findIndex((r) => r.handle === 'filesystem');
	assert.ok(fs >= 4, 'a filesystem handle exists after our routes');
	const ours = routes.slice(fs - 4, fs);
	assert.equal(ours.filter(isVary).length, 2, 'two Vary routes');
	assert.equal(ours.filter(isRewrite).length, 2, 'two rewrite routes');
	assert.equal(routes.filter((r) => isVary(r) || isRewrite(r)).length, 4, 'and no others anywhere');
});

test('Vercel config.json: the alternation is exactly the twins on disk, and none is under api/ or private/', { skip: unlessVercel }, () => {
	const rewrite = readVercelConfig().routes.find((r) => r.dest === '/$1.md');
	const m = rewrite.src.match(/^\^\/\((.*)\)\/\?\$$/);
	assert.ok(m, `rewrite src has the expected shape, got: ${rewrite.src.slice(0, 80)}…`);
	const inRoute = m[1].split('|').map((s) => s.replace(/\\(.)/g, '$1')).sort();
	assert.deepEqual(inRoute, twinSlugsOnDisk());
	const offenders = inRoute.filter((s) => s.startsWith('internals/'));
	assert.deepEqual(offenders, []);
});

test('Vercel config.json: every slug in the alternation resolves to a .md and an index.html', { skip: unlessVercel }, () => {
	const rewrite = readVercelConfig().routes.find((r) => r.dest === '/$1.md');
	const slugs = rewrite.src.match(/^\^\/\((.*)\)\/\?\$$/)[1].split('|').map((s) => s.replace(/\\(.)/g, '$1'));
	const broken = slugs.filter(
		(slug) => !existsSync(join(STATIC_DIR, `${slug}.md`)) || !existsSync(join(STATIC_DIR, ...slug.split('/'), 'index.html'))
	);
	assert.deepEqual(broken, []);
});
