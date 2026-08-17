/**
 * Visual and behavioural regression tests for the API reference.
 *
 * The reference is assembled from parts that cannot see each other: Starlight
 * renders the page, Scalar renders the document in the browser from a CDN
 * bundle, and a set of small bridges keeps the two agreeing on theme, search,
 * navigation, and which operation is current. Nothing in the build fails when a
 * bridge breaks — the page still renders, just wrong. These tests are what
 * notice.
 *
 * Two kinds of check, deliberately:
 *
 *   - **Screenshots** of the parts we build and control — the sidebar, the view
 *     switcher — where a regression is visual and hard to assert in words.
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

/** Routes under test, as configured in `src/config/api-reference.mjs`. */
const DOCS_VIEW = '/api/';
const FULL_VIEW = '/api/full/';

/**
 * The rendered reference.
 *
 * Assertions scope to this rather than the page: the operation names also
 * appear in the sidebar (inside collapsed groups) and in the hidden block that
 * feeds the search index, so an unscoped `getByText` matches those instead and
 * reports them as hidden.
 */
const reference = (page) => page.locator('[data-ek-scalar]');

/** Wait until Scalar has fetched its bundle and painted the document. */
async function waitForReference(page) {
	await expect(reference(page)).toBeVisible();
	await expect(
		reference(page).getByRole('heading', { name: 'Example Payments API' })
	).toBeVisible({ timeout: 30_000 });
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
	await page.waitForFunction(
		(t) => document.body.classList.contains(`${t}-mode`),
		theme
	);
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

test.describe('both views render', () => {
	for (const [name, route] of [
		['docs view', DOCS_VIEW],
		['full view', FULL_VIEW],
	]) {
		test(`${name} renders the document`, async ({ page }) => {
			// Deep-link to an operation rather than trusting the landing state:
			// it proves the document parsed, the operation rendered, and the anchor
			// scheme still matches — all in one, and all silently broken otherwise.
			await page.goto(`${route}#tag/payments/POST/payments`);
			await waitForReference(page);

			// A heading, not any text: operation names also appear in Scalar's own
			// sidebar, which the docs view hides, so a text match finds a hidden
			// node and reports the reference as broken when it is fine.
			await expect(
				reference(page).getByRole('heading', { name: 'Create a payment' })
			).toBeVisible({ timeout: 15_000 });
		});
	}
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
			await page.goto(DOCS_VIEW);
			await waitForReference(page);
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
		await page.goto(DOCS_VIEW);
		await waitForReference(page);

		await setTheme(page, 'light');
		const light = await paintedBackground(page, '.scalar-app');
		await setTheme(page, 'dark');
		const dark = await paintedBackground(page, '.scalar-app');

		expect(light).not.toBe(dark);
	});
});

test.describe('search', () => {
	test.skip(({ isMobile }) => isMobile, 'Search dialog and Pagefind assertions are viewport-independent; run once on desktop.');

	test('the site search finds operations and links to them', async ({ page }) => {
		await page.goto('/get-started/quickstart/');

		// Query Pagefind directly: this is the index Starlight's dialog reads, and
		// asserting against it tests the integration rather than the dialog's UI.
		const results = await page.evaluate(async () => {
			const pagefind = await import('/pagefind/pagefind.js');
			await pagefind.init();
			const search = await pagefind.search('Submit dispute evidence');
			if (!search.results.length) return null;
			const top = await search.results[0].data();
			return { url: top.url, subResults: (top.sub_results ?? []).map((s) => s.url) };
		});

		expect(results, 'search returned nothing for a known operation').not.toBeNull();
		expect(results.url).toBe(DOCS_VIEW);
		expect(results.subResults).toContain(
			'/api/#tag/disputes/POST/disputes/{dispute_id}/evidence'
		);
	});

	test('only one view is indexed, so operations appear once', async ({ page }) => {
		await page.goto('/get-started/quickstart/');

		const pages = await page.evaluate(async () => {
			const pagefind = await import('/pagefind/pagefind.js');
			await pagefind.init();
			const search = await pagefind.search('dispute evidence');
			return Promise.all(search.results.map(async (r) => (await r.data()).url));
		});

		expect(pages.filter((url) => url.startsWith('/api'))).toEqual([DOCS_VIEW]);
	});

	test('Scalar does not add a second search field', async ({ page }) => {
		await page.goto(FULL_VIEW);
		await waitForReference(page);

		// The site header's search is the only one. Scalar's would appear inside
		// its sidebar.
		await expect(page.locator('[data-ek-scalar]').getByPlaceholder(/search/i)).toHaveCount(0);
		await expect(page.locator('header.header site-search')).toHaveCount(1);
	});
});

test.describe('sidebar navigation', () => {
	test.skip(({ isMobile }) => isMobile, 'The docs sidebar is behind the mobile menu.');

	test('operations are listed and deep-link into the reference', async ({ page }) => {
		await page.goto(DOCS_VIEW);
		await waitForReference(page);

		const operation = page.locator(
			'.sidebar-content a[href="/api/#tag/payments/POST/payments/{payment_id}/capture"]'
		);
		await expect(operation).toHaveCount(1);
	});

	test('the active operation follows the reader', async ({ page }) => {
		await page.goto(DOCS_VIEW);
		await waitForReference(page);

		await page.evaluate(() => {
			location.hash = '#tag/disputes/webhook/POST/disputecreated';
		});

		const active = page.locator('.sidebar-content a[aria-current="page"]');
		await expect(active).toHaveCount(1);
		await expect(active).toContainText('dispute.created');
	});
});

test.describe('view switcher', () => {
	test.skip(({ isMobile }) => isMobile, 'Covered on desktop; the switcher is identical on mobile.');

	test('switching views keeps the reader in place', async ({ page }) => {
		const hash = '#tag/refunds/POST/refunds';

		await page.goto(`${DOCS_VIEW}${hash}`);
		await waitForReference(page);
		await expect(reference(page).getByRole('heading', { name: 'Create a refund' })).toBeVisible({
			timeout: 15_000,
		});

		// Read the hash once it stops moving, and carry *that* forward.
		//
		// Asserting a fixed value here is wrong: Scalar's scroll-spy rewrites the
		// hash continuously while it scrolls to the anchor, so the value at any
		// given instant is whatever is on screen — which is the point. The contract
		// is "the reader keeps their place", not "the hash equals what we typed".
		const settledHash = await page.evaluate(async () => {
			let previous = location.hash;
			for (let i = 0; i < 40; i++) {
				await new Promise((resolve) => setTimeout(resolve, 250));
				if (location.hash === previous) return location.hash;
				previous = location.hash;
			}
			return location.hash;
		});

		expect(decodeURIComponent(settledHash), 'expected to land on the operation').toBe(hash);

		await page.getByRole('link', { name: 'Full width' }).click();
		await expect(page).toHaveURL(/\/api\/full\//);
		await waitForReference(page);

		// Assert the operation rendered, not the URL and not the scroll offset.
		//
		// The URL is unusable as an assertion: Scalar rewrites `location.hash`
		// continuously from its scroll-spy, so reading it straight after a
		// navigation samples a random moment mid-settle. Scroll position is no
		// better, for the same reason.
		//
		// Rendering is the reliable signal. Scalar only renders operations under
		// tags it has opened, and on this view the Refunds tag is collapsed unless
		// something points at it — loading `/api/full/` with no hash leaves this
		// heading out of the DOM entirely. So its presence means the anchor
		// survived the switch and Scalar acted on it.
		await expect(
			reference(page).getByRole('heading', { name: 'Create a refund' })
		).toBeVisible({ timeout: 30_000 });
	});

	test('the current view is marked', async ({ page }) => {
		await page.goto(FULL_VIEW);
		await expect(page.getByRole('link', { name: 'Full width' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});
});

test.describe('appearance', () => {
	test.skip(({ isMobile }) => isMobile, 'Snapshots are taken at the desktop viewport.');

	// Only the parts this template renders itself are snapshotted. Scalar's own
	// output is excluded: it fills examples from the schema, and `date-time`
	// fields resolve to the current instant, so it differs on every run.
	for (const theme of ['light', 'dark']) {
		test(`view switcher, ${theme}`, async ({ page }) => {
			await page.goto(DOCS_VIEW);
			await waitForReference(page);
			await setTheme(page, theme);

			await expect(page.locator('.ek-view-switcher')).toHaveScreenshot(
				`view-switcher-${theme}.png`
			);
		});
	}

	test('sidebar operation list, expanded', async ({ page }) => {
		test.skip(
			test.info().project.name === 'mobile',
			'The sidebar is behind a menu on mobile; covered by the mobile layout test.'
		);

		await page.goto(DOCS_VIEW);
		await waitForReference(page);
		await setTheme(page, 'light');

		// Open every tag group so the badges and nesting are all in frame.
		await page.evaluate(() => {
			document
				.querySelectorAll('.sidebar-content details')
				.forEach((group) => (group.open = true));
		});

		// Tighter than the suite default. This capture is tall, so the default 1%
		// ratio is a large absolute area — enough to swallow a badge losing its
		// colour or a row's spacing collapsing, which is exactly what it is here
		// to catch. The small switcher snapshots keep the looser default, where
		// the tolerance is really only absorbing antialiasing.
		await expect(page.locator('.sidebar-content')).toHaveScreenshot('sidebar-operations.png', {
			maxDiffPixelRatio: 0.002,
		});
	});
});

test.describe('mobile', () => {
	test.skip(({ isMobile }) => !isMobile, 'Mobile viewport only.');

	for (const [name, route] of [
		['docs view', DOCS_VIEW],
		['full view', FULL_VIEW],
	]) {
		test(`${name} fits the viewport`, async ({ page }) => {
			await page.goto(route);
			await waitForReference(page);

			// Horizontal overflow is the classic failure for a two-column reference
			// inside a docs shell, and it is invisible on a desktop viewport.
			const overflows = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
			);
			expect(overflows, 'page scrolls horizontally').toBe(false);
		});
	}
});
