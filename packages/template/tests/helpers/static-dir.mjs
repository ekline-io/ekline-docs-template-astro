/**
 * Resolves the directory a build's static files actually landed in.
 *
 * Astro moves that directory depending on the adapter: a plain static build
 * fills `dist/`, and the Node adapter splits its output into `dist/client/`
 * (the static files) and `dist/server/` (the request handler). The Vercel
 * adapter does that same split — this template's private-docs pages render on
 * demand, so it needs one — and then additionally copies `dist/client/`'s
 * contents into `.vercel/output/static/`, alongside the routing config it
 * writes to `.vercel/output/config.json`. So a Vercel build leaves
 * `dist/client/` populated too, not replaced; the suites here read the build
 * off disk, so hardcoding one of those ties them to a single deployment
 * target — and the template picks its adapter at build time from the
 * environment.
 *
 * Probing for `index.html` rather than for the directory itself is what makes
 * the answer trustworthy. `dist/` exists under the Node adapter too, as the
 * parent of `client/` and `server/`, and a `dist/` left behind by an earlier
 * static build survives a Vercel-adapter build, which writes somewhere else
 * entirely. A bare directory check would happily return either.
 *
 * The candidate order fixes the case it can — `dist/` last, so a leftover
 * static build never shadows an adapter build. Astro rewrites `dist/client/`
 * from scratch on every build regardless of adapter (verified: a stray file
 * planted there does not survive the next build), so a single build never
 * leaves it stale relative to the `.vercel/output/static/` copy that same
 * build makes from it. What the order can't fix is a site that stops producing
 * `dist/client/` altogether — for example after removing the logged-in
 * experience and its Node-adapter pages (see `wiki/private-docs.md`), where an
 * off-Vercel build then writes a flat `dist/` instead, the same shape a purely
 * static site builds into. A `.vercel/output/static/` left over from before
 * that change would shadow the fresh flat `dist/`, since it is checked first.
 * Deleting old output before switching adapters — or before removing the
 * logged-in experience — avoids it.
 *
 * Throwing beats falling back to a guess. The alternative is every assertion in
 * the suite failing on a missing file, which reads as a broken site rather than
 * as a missing build.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const CANDIDATES = ['dist/client', '.vercel/output/static', 'dist'];

export function staticDir(projectRoot) {
	for (const candidate of CANDIDATES) {
		const dir = join(projectRoot, candidate);
		if (existsSync(join(dir, 'index.html'))) return dir;
	}
	throw new Error(
		`No static build output found under ${projectRoot} ` +
			`(checked: ${CANDIDATES.join(', ')}). Run \`npm run build\` first — ` +
			`or, if it did run, check that it emits an \`index.html\` at the root ` +
			`(a \`base\` path moves it).`
	);
}

/** Starlight's sidebar landmark. Matched on the attribute, not the class list, which carries a build hash. */
const STARLIGHT_SIDEBAR = /<nav\b[^>]*\baria-label="Main"/;

/**
 * The element `ScalarApiReference.astro` mounts a reference into — not its CSS or script mentions.
 * Accepts the attribute bare, with a value (`data-ek-scalar=""`) or before `/>`: a spelling this
 * missed would silently hand the tests the reference page again.
 */
const SCALAR_MOUNT = /<[a-z][^>]*\sdata-ek-scalar(?=[\s>=/])/i;

/**
 * The first built page, by sorted path, that renders Starlight's sidebar and
 * is not itself an API reference. Returns its absolute path.
 *
 * For tests about the global sidebar, which need a page that has one without
 * naming a page this template ships: a site that replaced the example content
 * has no `get-started/quickstart/`. Not every page qualifies, so this reads the
 * markup rather than trusting a path — the home page is a splash page with no
 * sidebar, and a `full`-layout reference hands the page to Scalar.
 *
 * Reference pages are excluded even when they keep the sidebar. A `docs`-layout
 * reference sorts first in this template (`api/index.html`), and a test that
 * means "an ordinary docs page" would silently check the reference instead.
 */
export function firstProsePageWithSidebar(dir) {
	const pages = readdirSync(dir, { recursive: true })
		.filter((rel) => rel.endsWith('.html'))
		.map((rel) => rel.split(sep).join('/'))
		.sort();

	for (const rel of pages) {
		const path = join(dir, ...rel.split('/'));
		const html = readFileSync(path, 'utf-8');
		if (STARLIGHT_SIDEBAR.test(html) && !SCALAR_MOUNT.test(html)) return path;
	}

	throw new Error(
		`No page under ${dir} renders Starlight's sidebar outside an API reference ` +
			`(looked for <nav aria-label="Main"> without a data-ek-scalar mount, ` +
			`across ${pages.length} .html files).`
	);
}
