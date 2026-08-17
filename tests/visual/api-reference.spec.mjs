/**
 * Visual and behavioural regression tests for the API references.
 *
 * A reference is assembled from parts that cannot see each other: Starlight
 * renders the page, Scalar renders the document in the browser from a CDN
 * bundle, and a set of small bridges keeps the two agreeing on theme, search,
 * navigation, and stacking. Nothing in the build fails when a bridge breaks —
 * the page still renders, just wrong. These tests are what notice.
 *
 * Two kinds of check, deliberately:
 *
 *   - **Screenshots** of the parts we build and control, where a regression is
 *     visual and hard to assert in words. Tagged `@screenshot`; see the note on
 *     that describe block.
 *   - **Measurements** for everything else. That a background matches, or that
 *     search returns an operation, is a fact worth asserting exactly rather than
 *     hoping a human spots it in a diff.
 *
 * Scalar's rendered output is deliberately *not* screenshot wholesale: it fills
 * response examples from the schema, including `date-time` fields that resolve
 * to the current instant, so those pixels differ on every run.
 *
 * Run: `npm run test:visual` (add `-- --update-snapshots` to accept changes).
 */
import { test, expect } from '@playwright/test';

/**
 * The two references the template ships, as configured in
 * `src/config/api-reference.mjs`. They are different APIs, each demonstrating
 * one layout — a customer keeps whichever they need.
 */
const PAYMENTS = { route: '/api/', title: 'Example Payments API', layout: 'docs' };
const ADMIN = { route: '/api/admin/', title: 'Example Admin API', layout: 'full' };

/**
 * The rendered reference.
 *
 * Assertions scope to this rather than the page: operation names also appear in
 * the sidebar (inside collapsed groups) and in the hidden block that feeds the
 * search index, so an unscoped `getByText` matches those instead and reports
 * them as hidden.
 */
const reference = (page) => page.locator('[data-ek-scalar]');

/** Wait until Scalar has fetched its bundle and painted the document. */
async function waitForReference(page, title) {
	await expect(reference(page)).toBeVisible();
	await expect(reference(page).getByRole('heading', { name: title })).toBeVisible({
		timeout: 30_000,
	});
}

/**
 * Drive the site's own theme control, the way a reader would.
 *
 * Starlight renders the control twice — once in the header, once inside the
 * mobile menu — so the selector has to pick one rather than fail strict mode.
 */
async function setTheme(page, theme) {
	await page.locator('starlight-theme-select select').first().selectOption(theme);
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	// The theme bridge rewrites Scalar's classes on the next frame.
	await page.waitForFunction((t) => document.body.classList.contains(`${t}-mode`), theme);
}

/** Background colour actually painted for an element, as `r,g,b`. */
function paintedBackground(page, selector) {
	return page.evaluate((sel) => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.fillStyle = getComputedStyle(document.querySelector(sel)).backgroundColor;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return `${r},${g},${b}`;
	}, selector);
}

test.describe('both references render', () => {
	test('the docs-layout reference renders its own document', async ({ page }) => {
		// Deep-link to an operation rather than trusting the landing state: it
		// proves the document parsed, the operation rendered, and the anchor
		// scheme still matches — all in one, and all silently broken otherwise.
		await page.goto(`${PAYMENTS.route}#tag/payments/POST/payments`);
		await waitForReference(page, PAYMENTS.title);

		// A heading, not any text: operation names also appear in Scalar's own
		// sidebar, which the docs layout hides, so a text match finds a hidden
		// node and reports the reference as broken when it is fine.
		await expect(
			reference(page).getByRole('heading', { name: 'Create a payment' })
		).toBeVisible({ timeout: 15_000 });
	});

	test('the full-layout reference renders its own document', async ({ page }) => {
		await page.goto(ADMIN.route);
		await waitForReference(page, ADMIN.title);

		// Each reference must render *its own* API. Copying a config entry and
		// forgetting to change the spec is the easy mistake, and it produces a
		// page that looks perfectly fine until someone reads it.
		await expect(
			reference(page).getByRole('heading', { name: PAYMENTS.title })
		).toHaveCount(0);
	});

	test("the full-layout reference keeps Scalar's own sidebar", async ({ page, isMobile }) => {
		// Boolean form, not the callback form: `test.skip(fn)` is only valid at
		// describe level, and this describe also holds tests that must run on
		// mobile.
		test.skip(isMobile, 'Sidebars collapse behind a menu on mobile.');

		await page.goto(ADMIN.route);
		await waitForReference(page, ADMIN.title);

		// Scalar owns navigation here, so its sidebar must be present — that is
		// the whole reason this layout exists.
		await expect(reference(page).getByText('Users').first()).toBeVisible();
	});
});

/**
 * Desktop-only from here down.
 *
 * These drive controls that live behind the mobile menu — the theme select, the
 * docs sidebar — so on a phone viewport they would be testing the menu rather
 * than the thing they name. Mobile has its own block at the end.
 */
test.describe('theme', () => {
	test.skip(({ isMobile }) => isMobile, 'Theme control is inside the mobile menu.');

	for (const theme of ['light', 'dark']) {
		test(`${theme}: the reference and the page share one background`, async ({ page }) => {
			await page.goto(PAYMENTS.route);
			await waitForReference(page, PAYMENTS.title);
			await setTheme(page, theme);

			// Scalar paints its own surfaces and stamps its own theme class on
			// <body>. If either drifts from Starlight's palette the page shows a
			// seam — which is invisible to every other kind of test.
			const site = await page.evaluate(() => {
				const canvas = document.createElement('canvas');
				canvas.width = canvas.height = 1;
				const ctx = canvas.getContext('2d', { willReadFrequently: true });
				ctx.fillStyle = getComputedStyle(document.documentElement)
					.getPropertyValue('--sl-color-bg')
					.trim();
				ctx.fillRect(0, 0, 1, 1);
				const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
				return `${r},${g},${b}`;
			});

			expect(await paintedBackground(page, 'body')).toBe(site);
			expect(await paintedBackground(page, '.scalar-app')).toBe(site);
		});
	}

	test('the reference follows the site theme toggle without a reload', async ({ page }) => {
		await page.goto(PAYMENTS.route);
		await waitForReference(page, PAYMENTS.title);

		await setTheme(page, 'light');
		const light = await paintedBackground(page, '.scalar-app');
		await setTheme(page, 'dark');
		const dark = await paintedBackground(page, '.scalar-app');

		expect(light).not.toBe(dark);
	});
});

test.describe('search', () => {
	test.skip(({ isMobile }) => isMobile, 'Pagefind assertions are viewport-independent; run once on desktop.');

	/** Query Pagefind directly — the index Starlight's dialog reads. */
	const search = (page, term) =>
		page.evaluate(async (t) => {
			const pagefind = await import('/pagefind/pagefind.js');
			await pagefind.init();
			const results = await pagefind.search(t);
			return Promise.all(
				results.results.map(async (r) => {
					const data = await r.data();
					return { url: data.url, subResults: (data.sub_results ?? []).map((s) => s.url) };
				})
			);
		}, term);

	test('the site search finds operations and links to them', async ({ page }) => {
		await page.goto('/get-started/quickstart/');

		const results = await search(page, 'Submit dispute evidence');
		expect(results.length, 'search returned nothing for a known operation').toBeGreaterThan(0);
		expect(results[0].url).toBe(PAYMENTS.route);
		expect(results[0].subResults).toContain(
			'/api/#tag/disputes/POST/disputes/{dispute_id}/evidence'
		);
	});

	test('each reference is searchable under its own route', async ({ page }) => {
		await page.goto('/get-started/quickstart/');

		// An operation unique to the admin document must resolve to the admin
		// route, not the payments one — the two indexes must not bleed together.
		const results = await search(page, 'Revoke an API key');
		expect(results.length, 'admin operations are not searchable').toBeGreaterThan(0);
		expect(results[0].url).toBe(ADMIN.route);
	});

	test('an operation appears under one route only', async ({ page }) => {
		await page.goto('/get-started/quickstart/');

		const results = await search(page, 'dispute evidence');
		const apiRoutes = results.map((r) => r.url).filter((url) => url.startsWith('/api'));
		expect(apiRoutes).toEqual([PAYMENTS.route]);
	});

	test('Scalar does not add a second search field', async ({ page }) => {
		await page.goto(ADMIN.route);
		await waitForReference(page, ADMIN.title);

		// The site header's search is the only one. Scalar's would appear inside
		// its sidebar.
		await expect(reference(page).getByPlaceholder(/search/i)).toHaveCount(0);
		await expect(page.locator('header.header site-search')).toHaveCount(1);
	});
});

test.describe('sidebar navigation', () => {
	test.skip(({ isMobile }) => isMobile, 'The docs sidebar is behind the mobile menu.');

	test('operations are listed and deep-link into the reference', async ({ page }) => {
		await page.goto(PAYMENTS.route);
		await waitForReference(page, PAYMENTS.title);

		const operation = page.locator(
			'.sidebar-content a[href="/api/#tag/payments/POST/payments/{payment_id}/capture"]'
		);
		await expect(operation).toHaveCount(1);
	});

	test('a full-layout reference is one sidebar link, not an operation list', async ({ page }) => {
		await page.goto(PAYMENTS.route);
		await waitForReference(page, PAYMENTS.title);

		// Scalar's own sidebar lists the operations on that route, so listing them
		// in Starlight's as well would be two navigation trees for one document.
		await expect(page.locator(`.sidebar-content a[href="${ADMIN.route}"]`)).toHaveCount(1);
		await expect(
			page.locator(`.sidebar-content a[href^="${ADMIN.route}#"]`)
		).toHaveCount(0);
	});

	test('the active operation follows the reader', async ({ page }) => {
		await page.goto(PAYMENTS.route);
		await waitForReference(page, PAYMENTS.title);

		await page.evaluate(() => {
			location.hash = '#tag/disputes/webhook/POST/disputecreated';
		});

		const active = page.locator('.sidebar-content a[aria-current="page"]');
		await expect(active).toHaveCount(1);
		await expect(active).toContainText('dispute.created');
	});
});

test.describe('API client overlay', () => {
	test.skip(({ isMobile }) => isMobile, 'Covered on desktop; the overlay is full-screen either way.');

	/**
	 * "Test Request" opens Scalar's full-screen client.
	 *
	 * Scalar builds the overlay correctly — `position: fixed; inset: 0` under a
	 * `z-index: 10000` wrapper — but Starlight sets `isolation: isolate` on
	 * `.main-pane`, which makes that pane a stacking context and traps the
	 * z-index inside it. Starlight's own fixed sidebar and header then paint over
	 * the dialog, hiding its left-hand column of parameter labels behind the
	 * sidebar.
	 *
	 * Nothing in a build or a unit test can see that: the markup is identical
	 * either way, and only the paint order differs.
	 */
	test('the client covers the page instead of rendering under the sidebar', async ({ page }) => {
		await page.goto(`${PAYMENTS.route}#tag/payments/GET/payments`);
		await waitForReference(page, PAYMENTS.title);

		const mainPaneIsolation = () =>
			page.evaluate(() => getComputedStyle(document.querySelector('.main-pane')).isolation);

		// Starlight's isolation is left alone until the client is actually open —
		// it is what stops page content painting over the header and sidebar.
		expect(await mainPaneIsolation()).toBe('isolate');

		await page.getByRole('button', { name: /Test Request/i }).first().click();

		const overlay = page.locator('.scalar-container.scalar-client--open');
		await expect(overlay).toBeVisible();
		expect(await mainPaneIsolation()).toBe('auto');

		// The overlay fills the viewport, and nothing from the docs page is on top
		// of it — hit-testing catches a stacking regression that a screenshot
		// tolerance might absorb.
		const covered = await page.evaluate(() => {
			const inScalar = (x, y) => {
				const el = document.elementFromPoint(x, y);
				return !!el && !!el.closest('[data-ek-scalar]');
			};
			const box = document
				.querySelector('.scalar-container.scalar-client--open')
				.getBoundingClientRect();
			return {
				fillsViewport: box.width >= innerWidth - 20 && box.height >= innerHeight - 20,
				overSidebar: inScalar(60, 300),
				overHeader: inScalar(700, 30),
				overContent: inScalar(700, 500),
			};
		});

		expect(covered.fillsViewport, 'overlay does not fill the viewport').toBe(true);
		expect(covered.overSidebar, 'Starlight sidebar paints over the client').toBe(true);
		expect(covered.overHeader, 'Starlight header paints over the client').toBe(true);
		expect(covered.overContent).toBe(true);
	});
});

/**
 * Screenshot comparisons, tagged so CI can skip them.
 *
 * Baselines are per-platform — font rendering differs between macOS and Linux —
 * and only the platform they were generated on is committed. Everything else in
 * this file asserts behaviour and passes identically anywhere, so CI runs
 * `--grep-invert @screenshot` and these stay a local pre-merge check.
 */
test.describe('appearance', { tag: '@screenshot' }, () => {
	test.skip(({ isMobile }) => isMobile, 'Snapshots are taken at the desktop viewport.');

	test('sidebar operation list, expanded', async ({ page }) => {
		await page.goto(PAYMENTS.route);
		await waitForReference(page, PAYMENTS.title);
		await setTheme(page, 'light');

		// Open every tag group so the badges and nesting are all in frame.
		await page.evaluate(() => {
			document.querySelectorAll('.sidebar-content details').forEach((group) => (group.open = true));
		});

		// Tighter than the suite default. This capture is tall, so the default 1%
		// ratio is a large absolute area — enough to swallow a badge losing its
		// colour or a row's spacing collapsing, which is exactly what it is here
		// to catch.
		await expect(page.locator('.sidebar-content')).toHaveScreenshot('sidebar-operations.png', {
			maxDiffPixelRatio: 0.002,
		});
	});
});

test.describe('mobile', () => {
	test.skip(({ isMobile }) => !isMobile, 'Mobile viewport only.');

	for (const target of [PAYMENTS, ADMIN]) {
		test(`${target.layout} layout fits the viewport`, async ({ page }) => {
			await page.goto(target.route);
			await waitForReference(page, target.title);

			// Horizontal overflow is the classic failure for a two-column reference
			// inside a docs shell, and it is invisible on a desktop viewport.
			const overflows = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
			);
			expect(overflows, 'page scrolls horizontally').toBe(false);
		});
	}
});
