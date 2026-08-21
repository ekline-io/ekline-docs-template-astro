/**
 * The demo login's round trip, in a real browser against the preview server.
 *
 * The preview's `DOCS_SSO_URL` still points at the mock SSO server — the
 * existing auth suite proves that path and keeps doing so. These tests drive
 * `/demo-login` directly instead, which is exactly what a demo visitor's
 * browser does after the middleware redirect; the middleware does not care
 * where the token came from, only that `DOCS_SSO_SECRET` signed it.
 *
 * Getting a valid `state` without following the redirect: `page.request`
 * shares the browser context's cookie jar, so a `maxRedirects: 0` GET of
 * `/private/` makes the middleware set the state cookie right where the
 * browser will present it, and hands back the nonce to put in the URL.
 *
 * Deliberately not covered here:
 * - `signingFailed` (the 500 path in `src/pages/demo-login.astro`) is
 *   unreachable with any `DOCS_SSO_SECRET` a test in this suite can set —
 *   jose 6 signs any non-empty string, which is what that file's own comment
 *   on the `try`/`catch` around `SignJWT` measured.
 * - the flag's *off* state (`DOCS_UNSAFE_DEMO_LOGIN` unset, `/demo-login`
 *   404s) is untestable here: this suite runs one preview server, built once
 *   with the flag on. `tests/demo-login.test.mjs` covers the off state at
 *   the unit level instead.
 *
 * Runs on both `desktop` and `mobile`, though this page has no
 * viewport-dependent layout of its own — kept for consistency with
 * `tests/visual/auth.spec.mjs`, which does find real per-viewport behaviour
 * elsewhere in this app (the header control's mobile menu). Cheap to keep
 * here too: nothing is `@screenshot`, and Playwright's `.hover()` dispatches
 * real pointer events even under mobile's touch emulation, so the prefetch
 * tests mean the same thing on both projects.
 */
import { test, expect } from '@playwright/test';

/** See tests/visual/auth.spec.mjs — the marker for "private content rendered". */
const SENTINEL = 'EKLINE-PRIVATE-SENTINEL';

/**
 * Written out rather than derived from `baseURL`. See the note on
 * `tests/visual/auth.spec.mjs`'s "the redirect tells the SSO endpoint where
 * to send the reader back" test (around line 93): `astro preview` reports
 * `http://localhost:4321` as the request origin whatever port it was told to
 * listen on, so this must NOT be "cleaned up" into
 * `new URL('/auth/callback', baseURL)` — that refactor silently breaks the
 * moment the preview server moves ports.
 */
const CALLBACK = 'http://localhost:4321/auth/callback';

/** Set by `/auth/callback`; named in `src/config/auth.mjs` (`auth.sessionCookie`). */
const SESSION_COOKIE = 'docs_session';

/** Set by `src/middleware.ts`; named in `src/config/auth.mjs` (`auth.stateCookie`). */
const STATE_COOKIE = 'docs_sso_state';

/** Starlight's rendered navigation, present in the DOM on every viewport but
 * hidden behind the mobile menu — same reason `auth.spec.mjs`'s "the private
 * sidebar" describe skips mobile there. */
const nav = (page) => page.locator('.sidebar-content');

const sessionCookie = async (page) =>
	(await page.context().cookies()).find((cookie) => cookie.name === SESSION_COOKIE);

/**
 * Start the SSO round trip without leaving the site; return the state nonce.
 *
 * The nonce is validated (`toBeTruthy`, not merely `typeof === 'string'`) and
 * the cookie's JSON is parsed inside a `try`/`catch` that names the cause: an
 * empty `state` round-trips into `state=` on the URL and `/demo-login`
 * refuses that with a 400, which would otherwise surface two assertions
 * later as ".warning not found" — a confusing place to learn the nonce was
 * empty. A cookie that stops being JSON would otherwise throw a raw
 * `SyntaxError` out of whichever call site below happens to run first,
 * instead of naming `StateCookie` as the thing that changed shape.
 */
async function beginRoundTrip(page) {
	const response = await page.request.get('/private/', { maxRedirects: 0 });
	expect(response.status()).toBe(302);
	const cookie = (await page.context().cookies()).find((c) => c.name === STATE_COOKIE);
	expect(cookie).toBeTruthy();

	// Astro percent-encodes cookie values; the JSON shape is StateCookie in
	// src/middleware.ts.
	let parsed;
	try {
		parsed = JSON.parse(decodeURIComponent(cookie.value));
	} catch (error) {
		throw new Error(
			`the state cookie is no longer JSON — see StateCookie in src/middleware.ts`,
			{ cause: error }
		);
	}
	expect(parsed.state, 'the state cookie did not carry a usable nonce').toBeTruthy();
	return parsed.state;
}

/**
 * Collect any request that would constitute a sign-in, from now until the test
 * stops looking. Register it *before* the hover: this observes the first
 * effect of a prefetch rather than the last, which is the whole point — a
 * fixed sleep waiting on a session cookie has to outlast sign → 302 → callback
 * → `Set-Cookie`, and when it does not, it passes because nothing has happened
 * *yet* rather than because nothing will.
 *
 * Parsed rather than substring-matched. `url.includes('as=')` also matches
 * `canvas=` and `alias=`, and `includes('/auth/callback')` misses the
 * percent-encoded `%2Fauth%2Fcallback` that appears inside the persona hrefs.
 * Neither is reachable on this page today; parsing means neither has to be
 * re-checked when it changes.
 */
function watchForSignIn(page) {
	const leaks = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.searchParams.has('as') || url.pathname.endsWith('/auth/callback')) {
			leaks.push(request.url());
		}
	});
	return leaks;
}

function demoLoginUrl(params) {
	return `/demo-login?${new URLSearchParams(params)}`;
}

test.describe('the picker', () => {
	test('lists the personas and leads with the warning', async ({ page }) => {
		// Without `?as=`, /demo-login renders the picker instead of signing
		// anyone in. This is the only place that branch is exercised end to end.
		const state = await beginRoundTrip(page);
		await page.goto(demoLoginUrl({ redirect_uri: CALLBACK, state }));
		await expect(page.locator('.warning')).toContainText('accepts anyone');
		await expect(page.locator('a.persona')).toHaveCount(3);
	});

	test('a direct visit with no parameters gets directions, not an error', async ({ page }) => {
		const response = await page.goto('/demo-login');
		expect(response.status()).toBe(200);
		await expect(page.locator('body')).toContainText('round trip');
		const privateLink = page.locator(`a[href$="/private/"]`);
		await expect(privateLink).toBeVisible();

		// This link carries data-astro-prefetch="false" too, for the same
		// reason the persona links do (see the hover test below) — and under
		// `.env.test` the mock SSO endpoint auto-signs, so hovering it for real
		// would run the whole round trip and sign the reader in with no click
		// at all.
		const leaks = watchForSignIn(page);
		await privateLink.hover();
		await page.waitForTimeout(1200);
		// Same instrument as the persona hover below, for the same reason: the
		// cookie check alone has to outlast the whole chain, and passes early
		// when it does not.
		expect(leaks, 'hovering the "private docs" link must not fire a sign-in').toEqual([]);
		expect(
			await sessionCookie(page),
			'hovering the "private docs" link must not sign anyone in'
		).toBeUndefined();
	});

	test('hovering a persona link does not sign anyone in', async ({ page }) => {
		// Same hazard as tests/visual/auth.spec.mjs's "hovering a control does
		// not change anything": Starlight's `prefetchAll` makes Astro prefetch
		// every link on hover regardless of `<ClientRouter />`, and a prefetch
		// is a real GET carrying cookies. Without `data-astro-prefetch="false"`
		// on the persona links, hovering one mints a handoff token and
		// completes the SSO round trip before any click — whichever persona
		// the mouse happened to cross becomes who the reader is signed in as.
		const state = await beginRoundTrip(page);
		await page.goto(demoLoginUrl({ redirect_uri: CALLBACK, state }));

		// Deterministic, independent of timing, and covers all three links
		// rather than just the one that gets hovered below: the markup itself
		// still says "do not prefetch me". This is what stops the attribute
		// being tidied away as decoration even if the behavioural check below
		// were ever weakened.
		await expect(page.locator('a.persona[data-astro-prefetch="false"]')).toHaveCount(3);

		// The first effect of a leak, not the last. A prefetch fires as soon as
		// the hover starts — well before sign, redirect and Set-Cookie finish —
		// so watching for the request itself needs far less margin than a
		// fixed sleep that only checks the cookie afterwards: that version has
		// to outlast the whole chain to catch a regression, which is generous
		// on a loaded runner and silent when it isn't (it passes because
		// nothing has happened *yet*). Verified against a mutated build with
		// `data-astro-prefetch="false"` removed: Chromium fires the whole
		// chain as ordinary `request` events — first
		// `/demo-login?as=acme&…` (the prefetch itself), then
		// `/auth/callback?token=…` moments later — well within this test's
		// 1200ms budget.
		const leaks = watchForSignIn(page);

		await page.locator('a.persona').first().hover();
		await page.waitForTimeout(1200);

		expect(leaks, 'hovering a persona link must not fire the sign-in request').toEqual([]);
		// The end-state check too, so a leak that used a mechanism other than
		// a plain `request` event (a `fetch()`-based prefetch, say) is still
		// caught. This is the assertion Important-1 anchors: everywhere else in
		// this file that asserts "no session cookie", this test and test 5 are
		// what prove the cookie name still matters — a silent rename of
		// `docs_session` would otherwise leave every one of those negatives
		// vacuously true.
		expect(
			await sessionCookie(page),
			'hovering a persona link must not sign anyone in'
		).toBeUndefined();
	});
});

test.describe('the round trip', () => {
	// Both fake org members, not just Acme: the demo's headline claim — sign
	// in as either persona and see only your own org — is symmetric, and a
	// suite that only ever signed in as Acme would leave the Globex half of
	// that claim proven by nothing. Modelled on tests/visual/auth.spec.mjs's
	// own parameterised loop over `/private/` and `/private/example-private-guide/`.
	for (const { as, name, mine, theirs } of [
		{ as: 'acme', name: 'Dana Reed', mine: 'acme', theirs: 'globex' },
		{ as: 'globex', name: 'Sam Patel', mine: 'globex', theirs: 'acme' },
	]) {
		test(`signing in as ${as} lands on the private docs, org isolation intact`, async ({
			page,
		}) => {
			const state = await beginRoundTrip(page);
			await page.goto(demoLoginUrl({ redirect_uri: CALLBACK, state }));

			// The rendered link, not a hand-built URL. `pickerLinks` in
			// src/pages/demo-login.astro assembles `as` + `redirect_uri` +
			// `state` onto `Astro.url.pathname` itself, and it lives in `.astro`
			// frontmatter — `tests/demo-login.test.mjs` cannot reach it, so
			// nothing but this click proves it is wired correctly. A picker that
			// dropped `state`, echoed the raw `redirect_uri` instead of
			// `roundTrip.redirectTarget.href`, or built the wrong pathname under
			// a configured `base` would leave a hand-built-URL version of this
			// test green while every real reader clicking the real link got a
			// 400.
			await page.getByRole('link', { name, exact: false }).click();

			// Through /auth/callback and back to the page the round trip started
			// at. The trailing `$` is deliberate, not incidental: it also pins
			// that no `?token=` survived into a URL the reader could bookmark or
			// share — easy to relax by accident if this ever becomes a
			// `.toContain` instead.
			await expect(page).toHaveURL(/\/private\/$/);
			await expect(page.locator('body')).toContainText(SENTINEL);
			// The positive anchor: without this, a rename of `docs_session`
			// would leave the negative assertions elsewhere in this file
			// (test 5, the hover tests) passing for the wrong reason.
			expect(await sessionCookie(page), 'sign-in did not issue a session').toBeDefined();

			const own = await page.request.get(`/private/orgs/${mine}/`);
			expect(own.status()).toBe(200);
			expect(await own.text()).toContain(SENTINEL);

			// The same bare 404 an org that does not exist gets.
			const other = await page.request.get(`/private/orgs/${theirs}/`);
			expect(other.status()).toBe(404);
			expect(await other.text()).not.toContain(SENTINEL);
		});
	}

	test('a persona with no orgs sees private docs and 404s on every org', async ({
		page,
		isMobile,
	}) => {
		// The `orgs: []` edge: acme/globex above prove membership in *some* org
		// works, this proves membership in *none* is handled as its own case
		// rather than an org name that just happens not to match.
		const state = await beginRoundTrip(page);
		// Clicked, not hand-built, like the org tests above — `no-org` is the
		// one persona id carrying a hyphen, so it is the one most likely to be
		// mangled by a future change to how the hrefs are assembled.
		await page.goto(demoLoginUrl({ redirect_uri: CALLBACK, state }));
		await page.getByRole('link', { name: 'Alex Kim', exact: false }).click();
		await expect(page).toHaveURL(/\/private\/$/); // see the note on this pattern above
		await expect(page.locator('body')).toContainText(SENTINEL);
		expect(await sessionCookie(page), 'sign-in did not issue a session').toBeDefined();

		const acme = await page.request.get('/private/orgs/acme/');
		expect(acme.status()).toBe(404);
		// Symmetric with the org-isolation check above: a 404 that still
		// carried private content in its body would pass every check before
		// this one.
		expect(await acme.text()).not.toContain(SENTINEL);

		if (!isMobile) {
			// Desktop only: the sidebar is behind the mobile menu, same as
			// tests/visual/auth.spec.mjs's "the private sidebar" describe.
			// `src/lib/private-sidebar.mjs` only emits an org section when
			// `session.orgs` is non-empty, so this reader's sidebar should carry
			// neither org.
			//
			// The positive first, and it is not decoration: both counts below
			// are zero if `nav()` matches nothing at all — a Starlight class
			// rename, or the sidebar simply failing to render, would make them
			// silently vacuous. "Log out" is emitted for every signed-in reader
			// (src/lib/private-sidebar.mjs), so it proves the locator is
			// pointed at a real sidebar before the absences mean anything.
			await expect(nav(page).getByRole('link', { name: 'Log out' })).toBeVisible();
			await expect(nav(page).getByText('Acme docs')).toHaveCount(0);
			await expect(nav(page).getByText('Globex')).toHaveCount(0);
		}
	});

	test('the token-bearing redirect leaves uncacheable', async ({ page }) => {
		// src/pages/demo-login.astro hand-rolls this 302 instead of calling
		// Astro.redirect(), specifically because Astro.redirect() drops
		// cache-control — and this is the one response in the whole app that
		// carries a credential in `Location`. A tidy-looking refactor back to
		// Astro.redirect(target.href) keeps every other test in this file
		// green while making that credential-bearing redirect cacheable by a
		// CDN or proxy that stores by path+query regardless of status.
		// Mutation-tested: reverting to Astro.redirect() here makes this test
		// fail (missing cache-control) — nothing else in the suite notices.
		const state = await beginRoundTrip(page);
		const response = await page.request.get(
			demoLoginUrl({ as: 'acme', redirect_uri: CALLBACK, state }),
			{ maxRedirects: 0 }
		);
		expect(response.status()).toBe(302);
		expect(response.headers()['cache-control']).toContain('no-store');
		const location = new URL(response.headers()['location']);
		expect(location.origin).toBe('http://localhost:4321');
		expect(location.searchParams.get('token')).toBeTruthy();
	});
});

test.describe('the refusals', () => {
	test('a cross-origin redirect_uri is refused, token unsent', async ({ page }) => {
		// The only place in this repo that proves the *route* actually calls
		// `parseDemoRedirectUri` rather than merely defining it correctly:
		// tests/demo-login.test.mjs exhausts the parser in isolation, but a
		// correct parser proves nothing about whether /demo-login remembers to
		// call it before signing. Delete or bypass that call and every other
		// test in this file — all same-origin — stays green; only this one
		// goes red. Without it, /demo-login is an open redirector: a freshly
		// signed handoff token handed to any site named in the query string.
		const state = await beginRoundTrip(page);
		const response = await page.goto(
			demoLoginUrl({ as: 'acme', redirect_uri: 'https://evil.example/steal', state })
		);
		// Refused on this page — not redirected anywhere, no token in any URL.
		expect(response.status()).toBe(400);
		expect(page.url()).toContain('/demo-login');
		expect(page.url()).not.toContain('token=');
	});

	test('an unknown persona never signs a token', async ({ page }) => {
		// findPersona() is unit-tested directly against every input shape, but
		// that only proves the function returns null correctly — not that the
		// route checks the result before signing. A version that fell through
		// and signed for whatever `as` was given regardless of `findPersona`'s
		// answer would pass every unit test and be caught only here.
		const state = await beginRoundTrip(page);
		const response = await page.goto(
			demoLoginUrl({ as: 'initech', redirect_uri: CALLBACK, state })
		);
		// Back to the picker, offering the real personas.
		expect(response.status()).toBe(200);
		await expect(page.locator('a.persona')).toHaveCount(3);
		// And no session came into being.
		expect(
			await sessionCookie(page),
			'an unknown persona must not create a session'
		).toBeUndefined();
	});
});
