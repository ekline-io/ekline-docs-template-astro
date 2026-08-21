/**
 * Unit tests for the auth path guard.
 *
 * `classifyPath` is the rule that decides which URLs are protected, so a
 * mistake here does not break a page — it silently serves private
 * documentation to anyone who asks. Most of this file is therefore the
 * adversarial set rather than the happy path: casing, empty segments,
 * percent-encoding, dot segments and prefix confusion.
 *
 * Every "Astro does X" claim below was measured, not inferred. A throwaway
 * Astro 6.3.1 app with the same two route shapes (`/private/[...slug]` and
 * `/private/orgs/[org]/[...slug]`) was built with the Node adapter and each
 * case sent as a raw request line over a socket, so no HTTP client could
 * normalise the path first; the middleware recorded what it saw and the page
 * recorded the `params` it was given. What follows is that transcript, turned
 * into assertions.
 *
 * Run:  node --test tests/auth-guards.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyPath } from '../src/lib/auth/guards.mjs';

// ---------------------------------------------------------------------------
// The rule itself
// ---------------------------------------------------------------------------

test('public paths are public', () => {
	for (const p of ['/', '/guides/example/', '/api/', '/privateer/', '/orgs/acme/']) {
		assert.deepEqual(classifyPath(p), { type: 'public' }, p);
	}
});

test('auth endpoints are auth', () => {
	assert.deepEqual(classifyPath('/auth/callback'), { type: 'auth' });
	assert.deepEqual(classifyPath('/auth/logout'), { type: 'auth' });
});

test('/private and children are private', () => {
	assert.deepEqual(classifyPath('/private'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/guide/'), { type: 'private' });
});

test('org paths carry the org slug', () => {
	assert.deepEqual(classifyPath('/private/orgs/acme/'), { type: 'org', org: 'acme' });
	assert.deepEqual(classifyPath('/private/orgs/acme/workflow/'), { type: 'org', org: 'acme' });
	// /private/orgs/ itself lists nothing and needs only a login, like /private/.
	assert.deepEqual(classifyPath('/private/orgs'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/orgs/'), { type: 'private' });
});

test('an org slug is matched with or without a trailing slash', () => {
	// `trailingSlash: 'never'` sites hand the guard `/private/orgs/acme`, and
	// deep pages hand it several more segments. Both are the same org.
	assert.deepEqual(classifyPath('/private/orgs/acme'), { type: 'org', org: 'acme' });
	assert.deepEqual(classifyPath('/private/orgs/acme/a/b/c/'), { type: 'org', org: 'acme' });
});

// ---------------------------------------------------------------------------
// Prefix confusion
// ---------------------------------------------------------------------------

test('paths that merely start with the guarded words are public', () => {
	// The guard matches whole segments, so a longer word that happens to begin
	// with "private" or "auth" is an ordinary public URL. Astro agrees: none of
	// these matched a private route in the probe (all 404).
	for (const p of [
		'/privateer/',
		'/private-docs/',
		'/private.html',
		'/privateX',
		'/privateorgs/acme/',
		'/authorize',
		'/authentication/',
		'/auth-callback',
	]) {
		assert.deepEqual(classifyPath(p), { type: 'public' }, p);
	}
});

test('"orgs" only opens an org when it is its own segment', () => {
	assert.deepEqual(classifyPath('/private/orgsuite/acme/'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/orgs-archive/acme/'), { type: 'private' });
});

// ---------------------------------------------------------------------------
// Casing
// ---------------------------------------------------------------------------

test('the guard is case-sensitive, exactly like Astro’s router', () => {
	// Astro builds each route pattern with `new RegExp(...)` and no `i` flag
	// (astro/dist/core/routing/pattern.js), so `/PRIVATE/secret/` matches no
	// route at all — the probe returned 404 for it and for `/Private/secret/`.
	// Classifying them public is therefore correct rather than lax: there is no
	// private page behind either URL.
	//
	// This is an assumption about Astro, not about HTTP. If a future Astro ever
	// matched routes case-insensitively, these two lines are the bypass, and
	// this test is where to come back to.
	assert.deepEqual(classifyPath('/PRIVATE/secret/'), { type: 'public' });
	assert.deepEqual(classifyPath('/Private/secret/'), { type: 'public' });

	// Same reasoning in the other direction: `/AUTH/callback` reaches no
	// endpoint, so leaving it out of the (deliberately unguarded) auth class
	// keeps that allowlist as narrow as the routes it exists for.
	assert.deepEqual(classifyPath('/AUTH/callback'), { type: 'public' });

	// An org slug keeps the casing it arrived with — see the org-slug tests.
	assert.deepEqual(classifyPath('/private/orgs/ACME/'), { type: 'org', org: 'ACME' });
});

// ---------------------------------------------------------------------------
// The input contract
// ---------------------------------------------------------------------------

test('a raw pathname is NOT valid input — the caller must pass Astro’s originPathname', () => {
	// These are the two shapes that make the input contract in guards.mjs
	// load-bearing rather than decorative. Both are what a *raw* request path
	// looks like; neither is what Astro hands the middleware in
	// `context.originPathname`, which is why the guard does not normalise them
	// itself.
	//
	// 1. Duplicate leading slashes. Raw: `//private/guide/`. Astro collapses
	//    those before matching (a fix its own source calls out as preventing
	//    "middleware authorization bypass"), so originPathname is
	//    `/private/guide/` and the guard sees a private path. Handed the raw
	//    form, it would not.
	assert.deepEqual(classifyPath('//private/guide/'), { type: 'public' });
	assert.deepEqual(classifyPath('/private/guide/'), { type: 'private' });

	// 2. A configured `base`. With `base: '/docs'`, `context.url.pathname` is
	//    `/docs/private/secret/` while Astro strips the base and renders the
	//    private page; originPathname is the stripped `/private/secret/`. The
	//    probe confirmed the full bypass: guard "public", body PRIVATE-CONTENT.
	assert.deepEqual(classifyPath('/docs/private/secret/'), { type: 'public' });
	assert.deepEqual(classifyPath('/private/secret/'), { type: 'private' });
});

test('percent-encoded prefixes are already decoded by the time the guard runs', () => {
	// Raw `/%70rivate/secret/` routes to the private page: Astro decodes the
	// pathname (`decodeURI`) before matching, and originPathname is decoded the
	// same way, so the guard sees `/private/secret/` and guards it. The guard
	// itself must not decode a second time — that would let it read a different
	// string than the router, which is the whole bug class this file exists to
	// prevent. So, as with the leading slashes above: the raw form is not the
	// guard's input, and would not be caught if it were.
	assert.deepEqual(classifyPath('/%70rivate/secret/'), { type: 'public' });
	assert.deepEqual(classifyPath('/private/secret/'), { type: 'private' });

	// `decodeURI` leaves reserved characters encoded, so an encoded slash never
	// becomes a segment separator. `/private%2fsecret/` stays one segment and
	// matched no route in the probe.
	assert.deepEqual(classifyPath('/private%2fsecret/'), { type: 'public' });
	assert.deepEqual(classifyPath('/%2Fprivate%2Fsecret/'), { type: 'public' });
});

test('the URL parser resolves dot segments before any pathname reaches the guard', () => {
	// Pinned because the guard does no traversal handling at all, and that is
	// only safe because `new URL()` has already done it — including for the
	// percent-encoded spellings of `.` and `..`. If this ever stops being true,
	// the guard needs traversal handling and this test fails first.
	const pathnameOf = (path) => new URL(path, 'https://docs.example.com').pathname;

	assert.equal(pathnameOf('/private/orgs/acme/../globex/'), '/private/orgs/globex/');
	assert.equal(pathnameOf('/private/orgs/%2e%2e/globex/'), '/private/globex/');
	assert.equal(pathnameOf('/private/orgs/.%2e/globex/'), '/private/globex/');
	assert.equal(pathnameOf('/private/./secret/'), '/private/secret/');
	// Backslashes are separators too, so `\..\` cannot smuggle a traversal past
	// the parser either — it is resolved like `/../`, here climbing out of
	// /private/ entirely.
	assert.equal(pathnameOf('/private\\..\\x/'), '/x/');
	// An encoded slash is NOT a separator, so it cannot introduce a dot segment.
	assert.equal(pathnameOf('/private/orgs/acme%2f..%2fglobex/'), '/private/orgs/acme%2f..%2fglobex/');

	// And the results classify the way the router routes them: dot segments that
	// climb out of /private/ produce a genuinely public path.
	assert.deepEqual(classifyPath(pathnameOf('/private/orgs/acme/../globex/')), {
		type: 'org',
		org: 'globex',
	});
	assert.deepEqual(classifyPath(pathnameOf('/private/orgs/%2e%2e/globex/')), { type: 'private' });
	assert.deepEqual(classifyPath(pathnameOf('/private\\..\\x/')), { type: 'public' });
});

// ---------------------------------------------------------------------------
// The org slug
// ---------------------------------------------------------------------------

test('an empty org segment is not an org', () => {
	// `/private/orgs//workflow/` has no org to check membership against, so it
	// falls back to the plain private class — login required, no org granted.
	// (Astro matched this to the shared-private route, not the org route.)
	assert.deepEqual(classifyPath('/private/orgs//workflow/'), { type: 'private' });
	assert.deepEqual(classifyPath('/private/orgs//'), { type: 'private' });
});

test('a strange org slug is returned verbatim, never repaired', () => {
	// This is the subtle one. Every value below fails `session.orgs.includes()`
	// and so 404s, which is the correct outcome — and it is only correct
	// *because* the guard hands back exactly the segment Astro will hand the
	// page as `params.org` (Astro's `getParams` does not decode, so the two are
	// literally the same substring of the same string).
	//
	// Sanitising these — dropping to `{ type: 'private' }` when the slug looks
	// wrong — would invert the outcome: any logged-in reader would clear the
	// guard and land on the org route with the org check skipped entirely. A
	// weird slug must stay a failed org check, not become a passed private one.
	assert.deepEqual(classifyPath('/private/orgs/acme%2f..%2fglobex/'), {
		type: 'org',
		org: 'acme%2f..%2fglobex',
	});
	assert.deepEqual(classifyPath('/private/orgs/acme%2Fworkflow/'), {
		type: 'org',
		org: 'acme%2Fworkflow',
	});
	assert.deepEqual(classifyPath('/private/orgs/%2e%2e/x/'), { type: 'org', org: '%2e%2e' });
	assert.deepEqual(classifyPath('/private/orgs/./'), { type: 'org', org: '.' });
	assert.deepEqual(classifyPath('/private/orgs/../'), { type: 'org', org: '..' });
	assert.deepEqual(classifyPath('/private/orgs/acme /'), { type: 'org', org: 'acme ' });

	// None of them can become a traversal downstream either: the routes look
	// their entry up by exact collection id (`orgDocs` ids look like
	// `acme/workflow`), never by building a filesystem path.
});
