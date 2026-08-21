/**
 * The design's core guarantee, as executable checks: private content is never
 * part of the static build. Every example page under `src/content/private-docs/`
 * and `src/content/org-docs/` carries the sentinel phrase below; if it shows
 * up anywhere in the static output — HTML, Pagefind fragments, llms*.txt,
 * sitemap, .md twins — a route or plugin started prerendering private content.
 *
 * Content collections and routes are not the only way in. `public/` is copied
 * to the static output verbatim, and the static handler runs before the
 * middleware, so a file placed there is served to anyone regardless of what
 * the guard says. The `/private/` test below is what covers that.
 *
 * Why a sentinel rather than checking each surface's own exclusion rules: the
 * claim being defended is structural, not a list of opt-outs. Private content
 * lives outside the `docs` collection and renders only from routes marked
 * `prerender = false`, so llms.txt and the `.md` twin routes (both of which
 * read `getCollection('docs')` by name) cannot reach it, and Pagefind and the
 * sitemap only see what the static build emitted. One byte-level search over
 * the whole static directory tests that claim end to end, and keeps testing it
 * when a new build-time surface is added that nobody thought to exclude.
 *
 * Run after `npm run build`:  `node --test tests/private-leaks.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { staticDir } from './helpers/static-dir.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

// Deliberately the *static* directory, not all of `dist/`. The sentinel IS
// present in `dist/server/chunks/` — that bundle is what renders private pages
// at request time, and it is never served as a static asset. A test that
// walked the whole of `dist/` would fail on correct behaviour, and the obvious
// "fix" for that failure would be to stop testing the surface that matters.
//
// Resolved through the helper rather than hardcoded: the adapter decides where
// static output lands (`dist/client` under Node, `.vercel/output/static` under
// Vercel), and the template picks its adapter from the environment at build
// time.
const STATIC = staticDir(ROOT);

const SENTINEL = 'EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK';

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
		item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]
	);
}

const rel = (file) => relative(ROOT, file);

test('the sentinel exists in the private source content (guards the guard)', () => {
	// Every other test in this file searches for a string. Delete that string
	// from the example pages and they all pass while proving nothing — so this
	// runs first and covers *every* private example page, not a sample. If a
	// customer replaces the shipped examples with their own content, this test
	// fails loudly, which is the correct signal: the leak tests below no longer
	// have anything to detect and need a sentinel in the new content.
	const sources = [
		'src/content/private-docs/index.mdx',
		'src/content/private-docs/example-private-guide.mdx',
		'src/content/org-docs/acme/index.mdx',
		'src/content/org-docs/globex/index.mdx',
	];
	for (const source of sources) {
		assert.ok(
			readFileSync(join(ROOT, source), 'utf8').includes(SENTINEL),
			`${source} lost its sentinel — the leak tests below prove nothing without it`
		);
	}
});

test('no private content anywhere in the static output', () => {
	// Search bytes, and inflate first where the bytes are compressed.
	//
	// Pagefind's index and fragments are not merely binary — they are gzip.
	// All 18 compressed files under `pagefind/` begin with the magic `1f8b`,
	// so a plain `Buffer.includes` can never match inside them no matter what
	// they contain. That would make this test blind to the single surface
	// most likely to carry indexed private prose, while still reporting
	// green: the worst possible outcome for the one test that proves the
	// security model. (Verified by construction: a gzip of a string
	// containing the sentinel answers `false` to `Buffer.includes` and `true`
	// once inflated. An inflated fragment is the page's prose in the clear.)
	const needle = Buffer.from(SENTINEL);
	const files = walk(STATIC);

	// Guards against the vacuous pass: an empty or half-written build would
	// otherwise satisfy every assertion below without searching anything.
	assert.ok(files.length > 0, `no files under ${rel(STATIC)} — did \`npm run build\` run?`);

	const leaked = files.filter((file) => {
		const raw = readFileSync(file);
		if (raw.includes(needle)) return true;
		if (raw[0] !== 0x1f || raw[1] !== 0x8b) return false;
		try {
			return gunzipSync(raw).includes(needle);
		} catch {
			// Not actually gzip despite the magic bytes; the raw check above
			// already covered it.
			return false;
		}
	});
	assert.deepEqual(
		leaked.map(rel),
		[],
		`private content leaked into: ${leaked.map(rel).join(', ')}`
	);
});

test('the gzip branch above is actually exercised', () => {
	// Without this, a Pagefind change that stopped emitting gzip would make
	// the inflate path dead code and nobody would notice.
	const compressed = walk(STATIC).filter((file) => {
		const raw = readFileSync(file);
		return raw.length > 1 && raw[0] === 0x1f && raw[1] === 0x8b;
	});
	assert.ok(
		compressed.length > 0,
		'no gzip files found in the static output — the leak test never inflates anything'
	);
});

test('nothing is published under /private/ — no prerendered page, no public/ asset', () => {
	// Two different mistakes land files here, and the second is both more
	// likely and impossible to fix in the guard.
	//
	// 1. A route under `src/pages/private/` that forgot
	//    `export const prerender = false` gets prerendered and emits HTML.
	//
	// 2. Anything under `public/private/` is copied into the static output
	//    verbatim. Astro's static handler runs BEFORE the middleware, so
	//    nothing in `src/middleware.ts` can prevent this — not a bug in the
	//    guard, a hole beside it, by construction. Measured with SSO fully
	//    configured: an anonymous request for a file dropped at
	//    `public/private/` answered `200` with `cache-control: public`, while
	//    `/private/` itself correctly answered `302` with `no-store`.
	//
	// `public/` is exactly where a customer puts the PDF, diagram or `.json`
	// that belongs with their private docs, and `public/private/` is the
	// obvious place to keep it "with" them — which publishes it to the world,
	// CDN-cacheable, at a URL that looks protected.
	//
	// This test is the only thing that notices. The sentinel search above
	// cannot help, because a customer's private roadmap PDF does not contain
	// our sentinel — measured too: with a sentinel-free file at
	// `/private/orgs/roadmap.pdf` and nothing else wrong, this was the sole
	// failing test in the file.
	//
	// Hence a check on the whole directory rather than on named paths: it
	// covers nested cases like `public/private/orgs/**` and any file type,
	// whatever the bytes inside say.
	const dir = join(STATIC, 'private');
	const published = existsSync(dir) ? walk(dir).map(rel) : [];
	assert.deepEqual(
		published,
		[],
		`served at /private/** to anyone, no session required:\n  ${published.join('\n  ')}`
	);
	// A `private/` directory with no files in it serves nothing, but nothing
	// should be creating one either — asserted separately so the file list
	// above cannot pass by being empty.
	assert.ok(!existsSync(dir), 'static output contains an empty private/ directory');
});

test('the sitemap does not reference /private/ or /demo-login', () => {
	// `@astrojs/sitemap` never consults `isPrerendered` — its only filters are
	// `r.type !== 'page'` and `if (r.pathname)`, and `pathname` is undefined
	// for `[dynamic]` and `[...spread]` routes. So the private routes stay out
	// of the sitemap because of their *shape*, not because they are on-demand,
	// and a non-dynamic on-demand page under `src/pages/private/` would be
	// advertised to crawlers. `astro.config.mjs` passes a `filter` so that the
	// absence is deliberate; this asserts the absence either way.
	//
	// `/demo-login` is exactly that non-dynamic on-demand shape: a *static*
	// pathname with `prerender = false`, unlike the `/private/**` routes above
	// which are dynamic/spread and so excluded by shape alone. Without the
	// same filter entry, `@astrojs/sitemap` would advertise it to crawlers.
	// (This assertion is vacuous until a later task adds the `/demo-login`
	// route and its filter entry — there is nothing to advertise yet.)
	const files = walk(STATIC).filter((file) => /sitemap.*\.xml$/.test(file));
	assert.ok(files.length > 0, 'no sitemap files found');
	for (const file of files) {
		const xml = readFileSync(file, 'utf8');
		assert.ok(!xml.includes('/private/'), `${rel(file)} references /private/`);
		assert.ok(!xml.includes('demo-login'), `${rel(file)} references /demo-login`);
	}
});

test('llms.txt variants do not mention private content', () => {
	// Two distinct failures. The sentinel means private *prose* was compiled
	// into the file; a `/private/` link means an entry was listed without its
	// body. Both mean private content reached the `docs` collection, which is
	// the only thing `starlight-llms-txt` reads.
	const files = walk(STATIC).filter((file) => /llms.*\.txt$/.test(file));
	assert.ok(files.length > 0, 'no llms*.txt files found');
	for (const file of files) {
		const body = readFileSync(file, 'utf8');
		assert.ok(!body.includes(SENTINEL), `${rel(file)} contains private content`);
		assert.ok(!body.includes('/private/'), `${rel(file)} links to /private/`);
	}
});

test('no org name reaches the public build', () => {
	// The rule the signed-in sidebar entry has to obey.
	//
	// `data-auth-only` entries ship in the HTML of every public page and are
	// merely hidden by CSS, which is fine for a fixed path like `/private/`.
	// It would NOT be fine for org sections: their labels are customer names,
	// and a prerendered page is served to every anonymous visitor, so listing
	// them would hand Acme the fact that Globex is a customer. That is the same
	// disclosure the 404-not-403 rule exists to prevent, reintroduced through
	// the navigation.
	//
	// Titles rather than slugs, deliberately: the slug `acme` is a plausible
	// substring of unrelated content (an OpenAPI example, a sample domain),
	// which would make this test fail for reasons that are not leaks.
	const orgTitles = ['Acme docs', 'Globex docs'];
	const files = walk(STATIC);
	assert.ok(files.length > 0, 'no static output to search');

	for (const title of orgTitles) {
		const needle = Buffer.from(title);
		const leaked = files.filter((file) => {
			const raw = readFileSync(file);
			if (raw.includes(needle)) return true;
			if (raw[0] !== 0x1f || raw[1] !== 0x8b) return false;
			try {
				return gunzipSync(raw).includes(needle);
			} catch {
				return false;
			}
		});
		assert.deepEqual(
			leaked.map((file) => relative(ROOT, file)),
			[],
			`the org name "${title}" is public in: ${leaked.join(', ')}`
		);
	}
});

test('an unconfigured build offers no way to sign in', () => {
	// The default state every fork starts in, and the one this file can check
	// without a browser: `npm test` builds with no `DOCS_*` variables set, so
	// the guard fails closed and `/private/**` answers a bare 404. A Log in
	// button or a "Private docs" nav entry in that build would be a dead link
	// on every page — the affordance has to be derived from configuration, not
	// rendered unconditionally.
	//
	// `tests/visual/auth.spec.mjs` covers the other direction, against a build
	// that IS configured (see `.env.test`). Together they pin both states; on
	// its own either one passes against a control that never changes.
	const offenders = walk(STATIC).filter((file) => {
		if (!file.endsWith('.html')) return false;
		const html = readFileSync(file, 'utf8');
		return html.includes('class="auth-in') || html.includes('data-auth-only');
	});

	assert.deepEqual(
		offenders.map(rel),
		[],
		'sign-in affordances rendered on a build with no DOCS_* configured'
	);
});
