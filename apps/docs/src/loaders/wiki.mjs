/**
 * Loads `packages/template/wiki/*.md` as a Starlight-schema content
 * collection — the site's Internals section — reading the files from
 * OUTSIDE this project's root, on purpose.
 *
 * `packages/template/wiki/` is maintainer-facing documentation
 * (private-docs.md, api-reference.md, theming.md) that must keep living
 * beside the template code it describes: it is what stops a future
 * maintainer reopening the org-isolation security holes closed by PR #8.
 * Copying those files into `apps/docs` — even via a sync script — would let
 * the copy drift from the source, silently, which is the exact failure this
 * design avoids. `WIKI_DIR` below resolves outside the project root
 * deliberately: do not "fix" this into a copy step.
 *
 * The wiki files open directly with an H1 (`# Private and per-org docs`) and
 * carry no frontmatter — their in-repo readability is for the maintainer
 * editing template internals, and prepending a YAML title block to satisfy
 * Starlight's `docsSchema()` (which requires `title`) would degrade exactly
 * that readability for a constraint that only exists once the file leaves
 * the repo. So this loader, not the files, derives `title` from the first
 * `# ` heading and strips that line from the body before rendering — if it
 * didn't strip it, Starlight would render `title` as the page's own `<h1>`
 * and then render the same heading again from the body.
 *
 * Why this can't be "wrap `glob()` and post-process": by the time `glob()`
 * (from `astro/loaders`) hands an entry to the collection schema, it has
 * already parsed frontmatter *and* rendered the Markdown body to HTML — the
 * source H1 would already be baked into the rendered output, and the schema
 * would already have rejected the missing `title` besides. There is no hook
 * in `glob()`'s public API to intervene between "read frontmatter" and
 * "render body". So this loader reimplements that pipeline directly, using
 * the same public `LoaderContext` primitives `glob()` itself uses
 * (`parseData`, `renderMarkdown`, `store.set` — see
 * https://docs.astro.build/en/reference/content-loader-reference/), with one
 * extra step in between: derive+strip the title before rendering.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

// Resolved relative to *this file*, which is stable regardless of Astro's
// `config.root` (it will always equal `apps/docs/`, but this doesn't need to
// assume that). From `apps/docs/src/loaders/`, four levels up is the repo
// root; from there, `packages/template/wiki/` — the same directory the plan
// describes as "`../../packages/template/wiki` relative to the app root"
// (`apps/docs/`), just resolved from the loader module's own location
// instead of from `config.root`. Both `wikiLoader()` below and
// `listWikiEntries()` (used synchronously by `src/config/sidebar.mjs`, which
// has no `LoaderContext` and thus no `config.root` to resolve against) share
// this single constant so the two can't drift apart.
const WIKI_DIR = fileURLToPath(new URL('../../../../packages/template/wiki/', import.meta.url));

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
// `[^\r\n]+`, not the lazy `.+?` this looked like at first: with everything
// after the capture group optional, a lazy quantifier is satisfied by a
// single character (its minimal match), so "# Theming" captured "T" — this
// was measured, not hypothesized. `[^\r\n]+` is greedy and can only stop at
// the line end, so it always captures the whole heading.
const LEADING_H1 = /^#[ \t]+([^\r\n]+)\r?\n?/;

/** Splits a leading `---\n...\n---` YAML block, if any, from the rest of the file. */
function splitFrontmatter(raw) {
	const match = raw.match(FRONTMATTER);
	if (!match) return { data: {}, body: raw };
	const parsed = parseYaml(match[1]);
	const data = parsed && typeof parsed === 'object' ? parsed : {};
	return { data, body: raw.slice(match[0].length) };
}

/**
 * Derives `title` from the first `# ` heading at the top of `body` and
 * strips that line (plus any leading blank lines before it).
 *
 * Throws if `body` has no leading H1. A wiki file needs either a frontmatter
 * `title` or an opening H1 to get a page title from; silently falling back
 * to something else (the filename, "Untitled") would hide a real authoring
 * mistake behind a wrong-looking page instead of failing the build loudly —
 * the same "loud failure over silent one" choice
 * `src/pages/private/[...slug].astro` makes for its own edge cases.
 */
function deriveTitleAndStrip(body, filePath) {
	const trimmed = body.replace(/^\s+/, '');
	const match = trimmed.match(LEADING_H1);
	if (!match) {
		throw new Error(
			`wiki loader: "${filePath}" has no frontmatter "title" and does not open ` +
				`with a "# Heading" line, so no page title can be derived from it. Add ` +
				`one or the other.`
		);
	}
	return { title: match[1].trim(), body: trimmed.slice(match[0].length) };
}

/**
 * Reads and normalizes one wiki file: `{ raw, data, body }`, where `data`
 * always has a `title` and `body` never repeats it as a heading.
 *
 * If the file already has frontmatter with a `title`, it's left completely
 * alone (this is the "a wiki file already has frontmatter" case: whatever
 * the author put there wins, nothing is derived or stripped). Otherwise the
 * H1 is derived and stripped, and merged on top of any other frontmatter
 * fields that *were* present.
 */
function parseWikiFile(filePath) {
	const raw = readFileSync(filePath, 'utf-8');
	const { data, body } = splitFrontmatter(raw);
	if (typeof data.title === 'string' && data.title.length > 0) {
		return { raw, data, body };
	}
	const derived = deriveTitleAndStrip(body, filePath);
	return { raw, data: { ...data, title: derived.title }, body: derived.body };
}

/** Filenames (no extension) of every `*.md` file directly under `WIKI_DIR`. */
function listWikiIds() {
	return readdirSync(WIKI_DIR)
		.filter((name) => name.endsWith('.md'))
		.map((name) => name.replace(/\.md$/, ''))
		.sort();
}

/**
 * `{ id, title }` for every wiki file — synchronous, so
 * `src/config/sidebar.mjs` can build the Internals nav group at
 * `astro.config.mjs` load time, well before any content-collection loader
 * runs.
 */
export function listWikiEntries() {
	return listWikiIds().map((id) => {
		const { data } = parseWikiFile(`${WIKI_DIR}${id}.md`);
		return { id, title: data.title };
	});
}

/**
 * The `wiki` content-collection loader. See the module docstring for why
 * this exists instead of `glob()`.
 */
/**
 * The URL a wiki file's relative links should point at once published.
 *
 * These files live beside the code they describe, so they link to it the way
 * a reader in the repository expects — `[src/content.config.ts](../src/content.config.ts)`.
 * GitHub resolves that correctly in its file view. Rendered at `/internals/*`
 * on the docs site it resolves to nothing, and ships as a 404 on a public
 * page.
 *
 * Rewriting them here rather than editing the wiki keeps both readers right:
 * the in-repo link stays relative and working, and the published one points at
 * the file on GitHub, which is where a reader of the docs site would want to
 * end up anyway — they do not have the repository checked out.
 *
 * Only `./` and `../` links are touched. Absolute URLs, anchors, and
 * site-relative links are left alone.
 */
const REPO_BLOB = 'https://github.com/ekline-io/ekline-docs-template-astro/blob/main/packages/template';

/**
 * @param {string} markdown Raw wiki markdown, before rendering.
 * @returns {string} The same markdown with relative links made absolute.
 */
export function rewriteRelativeLinks(markdown) {
	// `wiki/` is one level below the template root, so `../x` means `<template>/x`
	// and `./x` (or a bare sibling) means `<template>/wiki/x`.
	return markdown.replace(/\]\((\.\.?\/[^)\s]+)\)/g, (_match, href) => {
		const target = href.startsWith('../')
			? href.slice(3)
			: `wiki/${href.replace(/^\.\//, '')}`;
		return `](${REPO_BLOB}/${target})`;
	});
}

export function wikiLoader() {
	return {
		name: 'wiki-loader',
		load: async ({ config, store, parseData, renderMarkdown, generateDigest, logger }) => {
			let ids;
			try {
				ids = listWikiIds();
			} catch (err) {
				logger.error(`wiki loader: could not read "${WIKI_DIR}": ${err.message}`);
				return;
			}
			store.clear();
			for (const id of ids) {
				const filePath = `${WIKI_DIR}${id}.md`;
				const fileUrl = new URL(`${id}.md`, `file://${WIKI_DIR}`);
				const { raw, data, body } = parseWikiFile(filePath);
				const parsedData = await parseData({ id, data, filePath });
				const rendered = await renderMarkdown(rewriteRelativeLinks(body), { fileURL: fileUrl });
				store.set({
					id,
					data: parsedData,
					body,
					// Relative to the *Astro* project root, matching what `glob()`
					// itself stores — this legitimately climbs back out of it,
					// which is the whole point.
					filePath: relative(fileURLToPath(config.root), filePath),
					digest: generateDigest(raw),
					rendered,
				});
			}
		},
	};
}
