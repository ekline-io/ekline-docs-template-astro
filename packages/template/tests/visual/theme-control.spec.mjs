/**
 * The theme control.
 *
 * Four properties, each of which fails silently — the page still renders, in
 * the wrong colours, with no error anywhere:
 *
 *   - **Choosing works.** The reader picks a theme and the document changes.
 *   - **The two copies agree.** The control is rendered twice per page (header
 *     and mobile menu). Picking in one has to move both, or a phone-width
 *     reader opening the menu sees a control pointing at a theme they are
 *     not in.
 *   - **It survives a navigation.** `<ClientRouter />` replaces `<html>`'s
 *     attributes on every swap, so `data-theme` is lost each time and something
 *     has to put it back before paint. That is `ThemeProvider.astro`'s job —
 *     which only exists because Starlight's version relies on the theme control
 *     being on the page, and `src/config/theme.mjs` can take it off.
 *   - **Keyboard reaches every option.** Both layouts are a radio group, so
 *     arrow keys move through it. In the `menu` layout that is the only reason
 *     the third option is reachable at all without a mouse.
 *   - **It does not leak.** The menu layout listens on `window`, which outlives
 *     the element the swap replaces. Nothing else here would notice those
 *     listeners piling up — the control keeps working perfectly while it fills
 *     memory with the popovers of pages the reader has left.
 *
 * These follow `src/config/theme.mjs` rather than assuming a layout: the config
 * is a plain module with no Astro imports, so the suite can read the same value
 * the build did. `'none'` renders no control, so there is nothing here to drive
 * — the whole file skips, loudly and on purpose, rather than each test failing
 * on a missing element.
 *
 * Run: `npm run test:visual`.
 */
import { test, expect } from '@playwright/test';
import { themeControl } from '../../src/config/theme.mjs';

/** Somewhere with a sidebar, so both copies of the control are on the page. */
const PAGE = '/get-started/introduction/';

/** The header's copy on desktop; the mobile menu's on a phone viewport. */
const control = (page) => page.locator('ekline-theme-select').first();

/**
 * Pick a theme the way a reader would: open the menu if there is one, then
 * click the option. Same helper shape as `api-reference.spec.mjs`, and for the
 * same reason — the layout is configuration, not a fact these tests assert.
 */
async function choose(page, theme) {
	const trigger = control(page).locator('.trigger');
	if (await trigger.count()) await trigger.click();
	await control(page).locator(`label[data-theme-option="${theme}"]`).click();
}

/** Which option each copy of the control has checked, in document order. */
const checkedThemes = (page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('ekline-theme-select input:checked')].map((input) => input.value)
	);

test.describe('the theme control', () => {
	test.skip(themeControl === 'none', 'The theme is pinned; no control is rendered.');

	// The header's copy is `sl-hidden` below `md`, and the mobile menu's is
	// behind a menu button. Driving it on a phone viewport would be testing the
	// menu, not the control.
	test.skip(({ isMobile }) => isMobile, 'The control is inside the mobile menu.');

	test('choosing a theme changes the document', async ({ page }) => {
		await page.goto(PAGE);

		await choose(page, 'light');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		await choose(page, 'dark');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	});

	test('both copies of the control agree', async ({ page }) => {
		await page.goto(PAGE);
		await choose(page, 'light');

		// Two instances, both on `light` — not one on `light` and one still on the
		// server-rendered `auto`.
		const checked = await checkedThemes(page);
		expect(checked.length).toBeGreaterThan(1);
		expect(new Set(checked)).toEqual(new Set(['light']));
	});

	test('the choice survives a client-side navigation', async ({ page }) => {
		await page.goto(PAGE);
		await choose(page, 'light');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		// A real in-page link, so this goes through `<ClientRouter />` rather than
		// a full document load — a reload would pass on the pre-paint script alone
		// and prove nothing about the swap.
		await page.getByRole('link', { name: 'Quickstart', exact: true }).first().click();
		await expect(page).toHaveURL(/\/get-started\/quickstart\/$/);

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		expect(await checkedThemes(page)).toContain('light');
	});

	test('the control does not leak window listeners across navigations', async ({ page }) => {
		test.skip(themeControl !== 'menu', 'Only the menu layout listens on window.');

		await page.goto(PAGE);

		// Wrap every window `scroll` listener registered from here on, so we can
		// count how many actually fire. `AbortController.abort()` removes what was
		// registered — the wrapper — so a listener that is properly torn down stops
		// being counted. Counting registrations instead would prove nothing: the
		// fix does not register fewer, it removes them again.
		await page.evaluate(() => {
			window.__fired = 0;
			const original = window.addEventListener.bind(window);
			window.addEventListener = function (type, listener, options) {
				if (type !== 'scroll') return original(type, listener, options);
				return original(
					type,
					(event) => {
						window.__fired++;
						return listener(event);
					},
					options
				);
			};
		});

		// Two client-side navigations. Each builds a fresh pair of controls; the
		// pair it replaces must take its window listeners with it.
		//
		// Waits on the new page's own heading, not on a control count — the count
		// is two before the navigation as well, so asserting it is satisfied the
		// instant it is made and races the swap. That is not hypothetical: this
		// test passed on retry against the unfixed component until the wait was
		// made specific to the destination.
		for (const [name, path] of [
			['Quickstart', '/get-started/quickstart/'],
			['Authentication', '/get-started/authentication/'],
		]) {
			await page.getByRole('link', { name, exact: true }).first().click();
			await expect(page).toHaveURL(new RegExp(`${path}$`));
			await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
		}

		const { fired, live } = await page.evaluate(() => {
			window.__fired = 0;
			window.dispatchEvent(new Event('scroll'));
			return {
				fired: window.__fired,
				live: document.querySelectorAll('ekline-theme-select').length,
			};
		});

		// One handler per control that is actually on the page. Before the
		// listeners moved to `connectedCallback`/`disconnectedCallback` this was
		// two per navigation and grew without bound, each stale closure pinning a
		// detached popover in memory and running on every scroll for the rest of
		// the session.
		expect(fired).toBe(live);
	});

	test('every option is reachable by keyboard', async ({ page }) => {
		await page.goto(PAGE);
		await choose(page, 'light');

		// Reopen if there is a trigger: picking closes the menu, and the options
		// are only focusable while it is open.
		//
		// Then wait for the control's own focus management rather than calling
		// `focus()` and pressing keys straight away. A popover is `display: none`
		// until it is shown, and `click()` resolves as soon as the click is
		// dispatched — so focusing an option too early silently does nothing,
		// focus stays on the trigger, and the first arrow press is swallowed.
		// That race is why this test once reported Auto where it expected Dark.
		const trigger = control(page).locator('.trigger');
		const light = control(page).locator('input[value="light"]');

		if (await trigger.count()) {
			await trigger.click();
			await expect(light).toBeFocused();
		} else {
			await light.focus();
		}

		// Arrow keys move through a radio group, checking as they go. Light · Auto
		// · Dark, so two presses past Light is Dark — which is the option a
		// keyboard reader cannot reach if arrow navigation ever breaks.
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowDown');

		expect(await checkedThemes(page)).toContain('dark');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	});
});
