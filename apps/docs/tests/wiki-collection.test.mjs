/**
 * Regression test for the Internals section: `packages/template/wiki/*.md`
 * rendered in place — no copy, no sync script — as public pages under
 * `/internals/`. See `src/loaders/wiki.mjs` for the loader that makes this
 * possible and why it reads outside this project's root on purpose.
 *
 * Reads the wiki directory off disk rather than hardcoding filenames, so a
 * new file dropped into `packages/template/wiki/` is covered automatically:
 *   - every wiki file produces a page under `/internals/<id>/`
 *   - that page's `<title>` starts with the file's own H1 text
 *   - the file's H1 renders as exactly one `<h1>` on the page — not zero
 *     (title lost) and not two (the loader failed to strip the source
 *     heading, so Starlight's own title heading and the source H1 both render)
 *   - the page's body contains prose lifted straight from the source file,
 *     proving this is the real file's content and not a stale copy
 *
 * Run after `npm run build`: `node --test tests/wiki-collection.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { staticDir } from './helpers/static-dir.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
// `packages/template/wiki/`, the same directory `src/loaders/wiki.mjs`
// reads from outside this project's root — see that file for why.
const WIKI_DIR = join(APP_ROOT, '..', '..', 'packages', 'template', 'wiki');
const STATIC_DIR = staticDir(APP_ROOT);

function wikiFiles() {
	if (!existsSync(WIKI_DIR)) return [];
	return readdirSync(WIKI_DIR).filter((name) => name.endsWith('.md'));
}

/** Mirrors the loader's own "first `# ` heading at the top of the file" rule. */
function leadingH1(raw) {
	const trimmed = raw.replace(/^\s+/, '');
	const match = trimmed.match(/^#[ \t]+([^\r\n]+)\r?\n?/);
	return match ? match[1].trim() : null;
}

function extractTitleTag(html) {
	const match = html.match(/<title>([^<]*)<\/title>/i);
	return match ? match[1] : null;
}

/**
 * A prose line with no Markdown syntax in it, so it survives rendering
 * byte-for-byte modulo smartypants (normalized separately, see
 * `normalizeTypography`). Skips fenced code blocks — Shiki syntax
 * highlighting splits a code line into many `<span>` tags, so a plain
 * substring search across it would fail even for a faithfully rendered line.
 */
function plainProseLine(raw) {
	const lines = raw.split('\n').slice(1); // skip the H1 line itself
	let inFence = false;
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line.startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (line.length > 40 && !/[`*_[\]()#]/.test(line)) return line;
	}
	return null;
}

/**
 * Astro's Markdown pipeline applies smartypants by default (straight `'`
 * becomes `’`, etc.), so source text and rendered HTML text can differ by
 * exactly that transform even when the content is otherwise identical.
 * Canonicalize both sides to straight punctuation before comparing.
 */
function normalizeTypography(text) {
	return text
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/–/g, '-')
		.replace(/—/g, '--')
		.replace(/…/g, '...');
}

const files = wikiFiles();

test('packages/template/wiki has files to render (sanity check on the path above)', () => {
	assert.ok(files.length > 0, `expected *.md files in ${WIKI_DIR}`);
});

for (const file of files) {
	const id = file.replace(/\.md$/, '');
	const raw = readFileSync(join(WIKI_DIR, file), 'utf-8');
	const expectedTitle = leadingH1(raw);
	const pagePath = join(STATIC_DIR, 'internals', id, 'index.html');

	test(`${file} produces a built page at /internals/${id}/`, () => {
		assert.ok(existsSync(pagePath), `expected build output at ${pagePath}`);
	});

	test(`/internals/${id}/'s <title> matches ${file}'s H1`, () => {
		assert.ok(existsSync(pagePath), `no page built for ${file} — see previous test`);
		assert.ok(expectedTitle, `${file} has no leading "# " heading to compare against`);
		const html = readFileSync(pagePath, 'utf-8');
		const titleTag = extractTitleTag(html);
		assert.ok(titleTag, `${pagePath} has no <title> tag`);
		assert.ok(
			titleTag.startsWith(expectedTitle),
			`expected <title> to start with "${expectedTitle}", got "${titleTag}"`
		);
	});

	test(`/internals/${id}/ renders the H1 exactly once`, () => {
		assert.ok(existsSync(pagePath), `no page built for ${file} — see previous test`);
		const html = readFileSync(pagePath, 'utf-8');
		const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
		assert.equal(
			h1Count,
			1,
			`expected exactly one <h1> on ${pagePath} (title rendered once by ` +
				`Starlight, not again from an unstripped source heading), found ${h1Count}`
		);
	});

	test(`/internals/${id}/ contains prose from ${file}, not stale/copied content`, () => {
		assert.ok(existsSync(pagePath), `no page built for ${file} — see previous test`);
		const html = readFileSync(pagePath, 'utf-8');
		const sample = plainProseLine(raw);
		assert.ok(sample, `${file} has no plain-prose line (no Markdown syntax) to check`);
		assert.ok(
			normalizeTypography(html).includes(normalizeTypography(sample)),
			`expected rendered page to contain "${sample.slice(0, 60)}…" from the source file`
		);
	});
}

// ---------------------------------------------------------------------------
// Relative links
// ---------------------------------------------------------------------------

test('relative links in wiki files are rewritten to the repository', () => {
	// The wiki lives beside the code it describes and links to it relatively,
	// which GitHub resolves and a page at /internals/ cannot. Unrewritten, each
	// one ships as a 404 on a public page. Asserted on the built HTML, so this
	// covers the whole pipeline rather than the helper in isolation.
	const pages = readdirSync(join(STATIC_DIR, 'internals'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(STATIC_DIR, 'internals', entry.name, 'index.html'));
	assert.ok(pages.length > 0, 'no internals pages were built');

	// The whole document, not a slice of it. An earlier version of this test
	// sliced out `<article>` — Starlight emits no such element, so `indexOf`
	// returned -1, the slice was nonsense and the assertion passed with the
	// rewrite disabled. A correctly rewritten page carries no `../` or `./`
	// href anywhere (Starlight's own links are all site-absolute), so scanning
	// everything is both simpler and stricter.
	for (const page of pages) {
		const html = readFileSync(page, 'utf8');
		const relative = [...html.matchAll(/href="(\.\.?\/[^"]*)"/g)].map((m) => m[1]);
		assert.deepEqual(relative, [], `${page} still carries relative links`);
	}
});

test('the rewrite points at the file it named, not just somewhere', () => {
	// A rewrite producing a valid-looking but wrong URL would pass the test
	// above. wiki/api-reference.md links ../src/config/api-reference.mjs; from
	// wiki/, `..` is the template root, so that is where it must land.
	const html = readFileSync(join(STATIC_DIR, 'internals', 'api-reference', 'index.html'), 'utf8');
	assert.match(
		html,
		/github\.com\/ekline-io\/ekline-docs-template-astro\/blob\/main\/packages\/template\/src\/config\/api-reference\.mjs/,
		'the ../src/config/api-reference.mjs link did not resolve to the template root'
	);
});
