/**
 * End-to-end coverage of the SSO handoff and org isolation.
 *
 * This is the only suite that walks the real handshake — browser, cookies,
 * redirects, two servers — so it catches what `npm test` structurally cannot:
 * `tests/auth-guards.test.mjs` and `tests/auth-tokens.test.mjs` prove the pure
 * functions behave, and `tests/private-leaks.test.mjs` proves private content
 * never enters the static build, but neither can tell whether the middleware
 * still calls them, still sets a cookie the browser accepts, or still sends the
 * SSO endpoint a `redirect_uri` that points back at this site.
 *
 * The other half of the round trip is `tests/mock-sso/server.mjs`, started by
 * `playwright.config.mjs` alongside the preview server. Read the note on
 * `webServer` there before changing ports: the preview server has to run on
 * 4321 or the callback URL it advertises points at nothing.
 *
 * Nothing here is tagged `@screenshot`, so all of it runs in CI
 * (`test:visual:ci` is `--grep-invert @screenshot`). Each test gets a fresh
 * browser context, so a session never bleeds from one test into the next —
 * which is what lets the logged-out tests below mean anything.
 */
import { test, expect } from '@playwright/test';

/**
 * The phrase every example private and org page carries. `npm test` asserts it
 * is absent from the whole static build; here it is the marker for "this
 * response carried private content", whatever the status line claims.
 */
const SENTINEL = 'EKLINE-PRIVATE-SENTINEL';

/** Set by `/auth/callback`; named in `src/config/auth.mjs` (`auth.sessionCookie`). */
const SESSION_COOKIE = 'docs_session';

/** Starlight's rendered navigation. Present in the DOM on every viewport. */
const nav = (page) => page.locator('.sidebar-content');

const sessionCookie = async (page) =>
	(await page.context().cookies()).find((cookie) => cookie.name === SESSION_COOKIE);

test.describe('the guard', () => {
	// Both the section root and a page below it. A prefix-matching bug could let
	// children through while the root still redirects, and a suite that only ever
	// asked for `/private/` would report that as healthy.
	for (const path of ['/private/', '/private/example-private-guide/']) {
		test(`${path} is refused without a session`, async ({ page }) => {
			// A raw request, following no redirects and carrying no cookies: what
			// leaves the server for an anonymous visitor has to be the redirect
			// itself, never private HTML.
			const response = await page.request.get(path, { maxRedirects: 0 });

			expect(await response.text(), 'the guard served private content').not.toContain(SENTINEL);
			expect(response.status(), 'expected a redirect to SSO').toBe(302);
			expect(response.headers()['location']).toContain('localhost:4545/docs-sso');
		});
	}

	test('the redirect tells the SSO endpoint where to send the reader back', async ({ page }) => {
		// The half of the handshake that only an end-to-end test can see. Every
		// other check here would still pass if `redirect_uri` were dropped or
		// built from the wrong origin — the mock SSO server would simply never be
		// told where to return to, and this is the assertion that notices.
		const response = await page.request.get('/private/', { maxRedirects: 0 });
		const target = new URL(response.headers()['location']);

		// Written out rather than derived from `baseURL`, on purpose. `astro
		// preview` reports `http://localhost:4321` as the request origin whatever
		// port it was told to listen on, so moving the preview server is exactly
		// the change that breaks this handshake — and deriving the expectation
		// from the config would make the suite move quietly along with it.
		expect(target.searchParams.get('redirect_uri')).toBe(
			'http://localhost:4321/auth/callback'
		);
		// The nonce that binds the token to this browser. Its absence would not
		// break sign-in — `verifyHandoffToken` refuses an empty expected state —
		// but it would turn the CSRF check into a formality.
		expect(target.searchParams.get('state')).toBeTruthy();
	});
});

test.describe('the SSO round trip', () => {
	test('lands back on the private page, logged in', async ({ page }) => {
		await page.goto('/private/');

		await expect(page).toHaveURL(/\/private\/$/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Private documentation');
		// Not decoration: without this the test passes just as happily against a
		// site with no guard at all, where the page simply renders and no session
		// is ever created.
		expect(await sessionCookie(page), 'no session cookie was issued').toBeDefined();
	});

	test('returns to the page that was asked for, not the section root', async ({ page }) => {
		// `returnTo` travels in the state cookie and is re-checked by the callback.
		// A bug that dropped it would send every reader to `/private/` after
		// sign-in — invisible to a test that only ever asks for `/private/`.
		await page.goto('/private/example-private-guide/');

		await expect(page).toHaveURL(/\/private\/example-private-guide\/$/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Example private guide');
	});

	test('an org member can read their org docs', async ({ page }) => {
		const response = await page.goto('/private/orgs/acme/');

		expect(response.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Acme docs');
	});

	test('another org’s docs 404, and say nothing about the org', async ({ page }) => {
		// The mock reader is in `acme` only. 404 rather than 403 is the design:
		// a 403 confirms the org exists, and org names are customer names.
		const response = await page.goto('/private/orgs/globex/');

		expect(response.status()).toBe(404);
		const body = await response.text();
		expect(body).not.toContain(SENTINEL);
		expect(body).not.toContain('Globex');
	});

	test('a real org the reader lacks is indistinguishable from a fictional one', async ({
		page,
	}) => {
		// The property the 404 exists for. Comparing the two responses is the only
		// way to assert it: either one on its own looks correct while the pair
		// still leaks which customer names are real.
		await page.goto('/private/');
		// Two logged-out responses are also identical, so without this the
		// comparison below passes on any failure that quietly prevents sign-in.
		// Measured: with the SSO redirect broken, this test was the one green
		// result in a suite where everything else had gone red.
		expect(await sessionCookie(page), 'never signed in; the comparison would be vacuous').toBeDefined();

		const [refused, fictional] = await Promise.all([
			page.request.get('/private/orgs/globex/'),
			page.request.get('/private/orgs/no-such-org/'),
		]);

		expect(refused.status(), 'an org the reader lacks must 404').toBe(404);
		expect(fictional.status()).toBe(404);
		expect(await refused.text()).toBe(await fictional.text());
	});

	test('a missing page 404s identically to a refused org', async ({ page }) => {
		// The routes under `src/pages/private/` build their own 404 rather than
		// importing the middleware's `notFound()`, because `astro check` cannot
		// analyse a top-level early return in Astro frontmatter — an imported
		// helper there reads as an unused import and the branch goes untyped.
		// The comments in those files point at this test as what keeps the three
		// bodies in step, so this is that test: without it, the duplication is
		// unguarded and a well-meaning edit to one of them turns the difference
		// between "does not exist" and "not yours" into an oracle.
		//
		// The pairs matter. `globex` is refused by the middleware (the reader is
		// not a member); the other two are produced by the route files, for a
		// reader who IS in `acme` asking for pages that are not there.
		await page.goto('/private/');
		expect(await sessionCookie(page), 'never signed in; the comparison would be vacuous').toBeDefined();

		const [refusedByGuard, missingOrgPage, missingPrivatePage] = await Promise.all([
			page.request.get('/private/orgs/globex/'),
			page.request.get('/private/orgs/acme/no-such-page/'),
			page.request.get('/private/no-such-page/'),
		]);

		expect(refusedByGuard.status()).toBe(404);
		expect(missingOrgPage.status(), 'a member asking for a missing org page').toBe(404);
		expect(missingPrivatePage.status(), 'a missing shared private page').toBe(404);

		const refusedBody = await refusedByGuard.text();
		expect(await missingOrgPage.text(), 'org route 404 must match the guard byte for byte').toBe(
			refusedBody
		);
		expect(await missingPrivatePage.text(), 'private route 404 must match too').toBe(refusedBody);
	});

	test('logout ends the session for real, not just in the cookie jar', async ({ page }) => {
		await page.goto('/private/');
		expect(await sessionCookie(page)).toBeDefined();

		await page.goto('/auth/logout');

		await expect(page).toHaveURL('/');
		expect(await sessionCookie(page)).toBeUndefined();
		// The cookie being gone from the browser is the visible half. That the
		// server now refuses again is the half that matters, and it is what would
		// break if logout ever cleared the cookie on the wrong path.
		const response = await page.request.get('/private/', { maxRedirects: 0 });
		expect(response.status()).toBe(302);
	});
});

/**
 * What a logged-in reader's navigation contains.
 *
 * Desktop only: the sidebar is behind the mobile menu there, and its contents
 * are decided on the server, so a second viewport would re-assert the same
 * HTML. The access decisions these depend on are covered above on both.
 */
test.describe('the private sidebar', () => {
	test.skip(({ isMobile }) => isMobile, 'The docs sidebar is behind the mobile menu.');

	test('shows the reader’s own org and no other', async ({ page }) => {
		await page.goto('/private/');

		await expect(nav(page).getByRole('link', { name: 'Acme docs' })).toBeVisible();
		// Globex ships with the template as a second example org, so this is a
		// real other-tenant section rather than a name that happens not to exist.
		await expect(nav(page).getByText('Globex')).toHaveCount(0);
	});

	test('offers a way out, not the public way in', async ({ page }) => {
		await page.goto('/private/');

		await expect(nav(page).getByRole('link', { name: 'Log out' })).toBeVisible();
		// `loginLink` in `src/config/sidebar.mjs` is the public pages' "Private
		// docs" link, and it exists to start the SSO round trip. Offering it to a
		// reader who is already signed in is the giveaway that the private sidebar
		// was built from the public config instead of `buildPrivateSidebar`.
		await expect(
			nav(page).getByRole('link', { name: 'Private docs', exact: true })
		).toHaveCount(0);
	});

	test('lists API references as plain links, not operation groups', async ({ page }) => {
		await page.goto('/private/');

		// Expanding a reference means running Scalar's navigation builder against
		// the spec file at request time, and that file is not guaranteed to exist
		// inside a serverless bundle — so one link per reference is the documented
		// behaviour here, not a shortfall. The public sidebar does list operations;
		// `api-reference.spec.mjs` asserts that side.
		await expect(nav(page).locator('a[href="/api/"]')).toHaveCount(1);
		await expect(nav(page).locator('a[href="/api/admin/"]')).toHaveCount(1);
		await expect(nav(page).locator('a[href^="/api/#"]')).toHaveCount(0);
	});
});
