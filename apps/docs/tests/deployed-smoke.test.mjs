/**
 * Smoke test against a deployed site. The only layer that can see Vercel's
 * router and CDN, which is where markdown negotiation lives and where it once
 * broke for three months without a test noticing.
 *
 * Opt-in: set `DOCS_SMOKE_URL` to a preview or production URL. Skipped, not
 * failed, when unset, so `npm test` stays hermetic.
 *
 *   DOCS_SMOKE_URL=https://<deployment>.vercel.app node --test tests/deployed-smoke.test.mjs
 *
 * If your deployment is behind Vercel's Deployment Protection, anonymous
 * requests never reach the site — they get redirected to a sign-in page
 * instead, and every assertion below fails on that redirect rather than on
 * anything this feature does. Set `DOCS_SMOKE_BYPASS` to a Protection Bypass
 * for Automation secret for the project to get past it.
 *
 * `PAGES` names URLs that exist on this site; if you rename or remove one,
 * update it here. The two `vary*` pages must not be fetched by any other test
 * in this file, so the Vary gate sees the CDN in a known order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.DOCS_SMOKE_URL?.replace(/\/+$/, '');
const skip = BASE ? false : 'DOCS_SMOKE_URL not set';
const BYPASS = process.env.DOCS_SMOKE_BYPASS;

const PAGES = {
	page: '/search-and-ai/',
	varyA: '/branding/',
	varyB: '/site-basics/',
	noTwin: '/internals/private-docs/', // wiki collection — HTML, no .md; must fall back to HTML, never 404
};

const MARKDOWN = 'text/markdown';
const AGENT = 'text/markdown, text/plain;q=0.9, */*;q=0.8';
const CHROME =
	'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
const CURL = '*/*';

/** A response that never reached the site — Deployment Protection intercepted it. */
function isProtected(r) {
	return r.status >= 300 && r.status < 400 && /vercel\.com\/sso-api/.test(r.location);
}

async function get(path, accept) {
	const headers = { accept };
	if (BYPASS) {
		headers['x-vercel-protection-bypass'] = BYPASS;
		headers['x-vercel-set-bypass-cookie'] = 'false';
	}
	const res = await fetch(BASE + path, { headers, redirect: 'manual' });
	const r = {
		status: res.status,
		type: res.headers.get('content-type') ?? '',
		vary: res.headers.get('vary') ?? '',
		cache: res.headers.get('x-vercel-cache') ?? '-',
		location: res.headers.get('location') ?? '',
		body: await res.text(),
	};
	if (isProtected(r)) {
		throw new Error(
			`${path}: blocked by Vercel Deployment Protection (redirected to ${r.location}). ` +
				'Set DOCS_SMOKE_BYPASS to a Protection Bypass for Automation secret for this project, ' +
				'or disable protection for this deployment.'
		);
	}
	return r;
}
const isMarkdown = (r) => r.type.startsWith('text/markdown');
const isHtml = (r) => r.type.startsWith('text/html');
const describe = (r) => `${r.status} ${r.type} (x-vercel-cache: ${r.cache})`;

test('1. root with Accept: text/markdown → the markdown twin', { skip }, async () => {
	const r = await get('/', MARKDOWN);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isMarkdown(r), describe(r));
	assert.ok(r.body.startsWith('# '), `body starts: ${r.body.slice(0, 40)}`);
});

test('2. a page with Accept: text/markdown → its twin', { skip }, async () => {
	const r = await get(PAGES.page, MARKDOWN);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isMarkdown(r), describe(r));
	assert.ok(r.body.startsWith('# '), `body starts: ${r.body.slice(0, 40)}`);
	const twin = await get(PAGES.page.replace(/\/$/, '') + '.md', CURL);
	assert.equal(r.body, twin.body, 'negotiated body must equal the page’s own .md twin, not some other page’s');
});

test('3. the realistic agent Accept header → markdown', { skip }, async () => {
	const r = await get(PAGES.page, AGENT);
	assert.ok(isMarkdown(r), describe(r));
});

test('4. Chrome’s Accept → HTML, unchanged', { skip }, async () => {
	const r = await get(PAGES.page, CHROME);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isHtml(r), describe(r));
});

test('5. curl’s */* → HTML, unchanged', { skip }, async () => {
	const r = await get(PAGES.page, CURL);
	assert.ok(isHtml(r), describe(r));
});

test('6. a page with no twin + Accept: text/markdown → HTML, not 404', { skip }, async () => {
	const r = await get(PAGES.noTwin, MARKDOWN);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isHtml(r), describe(r));
});

test('7. negotiable responses carry Vary: Accept', { skip }, async () => {
	for (const [path, accept] of [['/', MARKDOWN], [PAGES.page, MARKDOWN], [PAGES.page, CHROME], [PAGES.page, CURL]]) {
		const r = await get(path, accept);
		assert.match(r.vary, /\bAccept\b/i, `${path} with ${accept.slice(0, 20)}…: Vary was "${r.vary}"`);
	}
});

test('8. THE VARY GATE: same URL, both orders, bodies never cross — including cache HITs', { skip }, async (t) => {
	// A cached HTML body served to a Markdown request, or the reverse, is the
	// failure mode of the rewrite design. Two pages no other test touches, in
	// opposite orders, so the CDN is warmed both ways.
	const runs = [
		[PAGES.varyA, [CHROME, MARKDOWN, CHROME, MARKDOWN]],
		[PAGES.varyB, [MARKDOWN, CHROME, MARKDOWN, CHROME]],
	];
	for (const [path, sequence] of runs) {
		// Fetched once, direct — the ground truth a negotiated Markdown response
		// must match. Without this, a Vary-gate pass would not notice every
		// negotiated page resolving to the same (wrong) twin.
		const twin = await get(path.replace(/\/$/, '') + '.md', CURL);
		for (const accept of sequence) {
			const r = await get(path, accept);
			const wantMarkdown = accept === MARKDOWN;
			t.diagnostic(`${path} ${wantMarkdown ? 'MD ' : 'HTML'} → ${describe(r)}`);
			assert.equal(r.status, 200, `${path}: ${describe(r)}`);
			assert.ok(wantMarkdown ? isMarkdown(r) : isHtml(r), `${path} asked for ${wantMarkdown ? 'markdown' : 'HTML'}, got ${describe(r)}`);
			if (wantMarkdown) {
				assert.equal(r.body, twin.body, `${path}: markdown body did not match its own .md twin`);
			}
		}
	}
});

test('9. the .md twin itself still serves — the existing contract', { skip }, async () => {
	const r = await get(PAGES.page.replace(/\/$/, '') + '.md', CURL);
	assert.equal(r.status, 200, describe(r));
	assert.ok(isMarkdown(r), describe(r));
});
