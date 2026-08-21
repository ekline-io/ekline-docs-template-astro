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
 * Nothing here is tagged `@screenshot`, so all of it runs in CI.
 */
import { test, expect } from '@playwright/test';

/** See tests/visual/auth.spec.mjs — the marker for "private content rendered". */
const SENTINEL = 'EKLINE-PRIVATE-SENTINEL';

const CALLBACK = 'http://localhost:4321/auth/callback';

/** Start the SSO round trip without leaving the site; return the state nonce. */
async function beginRoundTrip(page) {
	const response = await page.request.get('/private/', { maxRedirects: 0 });
	expect(response.status()).toBe(302);
	const cookie = (await page.context().cookies()).find((c) => c.name === 'docs_sso_state');
	expect(cookie).toBeTruthy();
	// Astro percent-encodes cookie values; the JSON shape is StateCookie in
	// src/middleware.ts.
	const { state } = JSON.parse(decodeURIComponent(cookie.value));
	expect(typeof state).toBe('string');
	return state;
}

function demoLoginUrl(params) {
	return `/demo-login?${new URLSearchParams(params)}`;
}

test('the picker lists the personas and leads with the warning', async ({ page }) => {
	const state = await beginRoundTrip(page);
	await page.goto(demoLoginUrl({ redirect_uri: CALLBACK, state }));
	await expect(page.locator('.warning')).toContainText('accepts anyone');
	await expect(page.locator('a.persona')).toHaveCount(3);
});

test('choosing a persona lands the reader on the private docs, org isolation intact', async ({
	page,
}) => {
	const state = await beginRoundTrip(page);
	await page.goto(demoLoginUrl({ as: 'acme', redirect_uri: CALLBACK, state }));

	// Through /auth/callback and back to the page the round trip started at.
	await expect(page).toHaveURL(/\/private\/$/);
	await expect(page.locator('body')).toContainText(SENTINEL);

	// Dana is in Acme…
	const acme = await page.request.get('/private/orgs/acme/');
	expect(acme.status()).toBe(200);
	expect(await acme.text()).toContain(SENTINEL);

	// …and not in Globex: the same bare 404 an org that does not exist gets.
	const globex = await page.request.get('/private/orgs/globex/');
	expect(globex.status()).toBe(404);
	expect(await globex.text()).not.toContain(SENTINEL);
});

test('a persona with no orgs sees private docs but no org section', async ({ page }) => {
	const state = await beginRoundTrip(page);
	await page.goto(demoLoginUrl({ as: 'no-org', redirect_uri: CALLBACK, state }));
	await expect(page).toHaveURL(/\/private\/$/);
	await expect(page.locator('body')).toContainText(SENTINEL);

	const acme = await page.request.get('/private/orgs/acme/');
	expect(acme.status()).toBe(404);
});

test('a cross-origin redirect_uri is refused, token unsent', async ({ page }) => {
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
	const state = await beginRoundTrip(page);
	const response = await page.goto(
		demoLoginUrl({ as: 'initech', redirect_uri: CALLBACK, state })
	);
	// Back to the picker, offering the real personas.
	expect(response.status()).toBe(200);
	await expect(page.locator('a.persona')).toHaveCount(3);
	// And no session came into being.
	const session = (await page.context().cookies()).find((c) => c.name === 'docs_session');
	expect(session).toBeUndefined();
});

test('a direct visit with no parameters gets directions, not an error', async ({ page }) => {
	const response = await page.goto('/demo-login');
	expect(response.status()).toBe(200);
	await expect(page.locator('body')).toContainText('round trip');
	await expect(page.locator(`a[href$="/private/"]`)).toBeVisible();
});

test('hovering a persona link does not sign anyone in', async ({ page }) => {
	// Same hazard as `tests/visual/auth.spec.mjs`'s "hovering a control does not
	// change anything": Starlight's `prefetchAll` makes Astro prefetch every
	// link on hover regardless of `<ClientRouter />`, and a prefetch is a real
	// GET carrying cookies. Without `data-astro-prefetch="false"` on the
	// persona links, hovering one mints a handoff token and completes the SSO
	// round trip before any click — whichever persona the mouse happened to
	// cross becomes who the reader is signed in as. This test is what stops
	// that attribute being tidied away as decoration.
	const state = await beginRoundTrip(page);
	await page.goto(demoLoginUrl({ redirect_uri: CALLBACK, state }));

	await page.locator('a.persona').first().hover();
	await page.waitForTimeout(1200);

	expect(page.url()).toContain('/demo-login');
	const session = (await page.context().cookies()).find((c) => c.name === 'docs_session');
	expect(session, 'hovering a persona link must not sign anyone in').toBeUndefined();
});
