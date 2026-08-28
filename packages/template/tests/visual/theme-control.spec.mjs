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

	test('every option is reachable by keyboard', async ({ page }) => {
		await page.goto(PAGE);
		await choose(page, 'light');

		// Reopen if there is a trigger: picking closes the menu, and the options
		// are only focusable while it is open.
		const trigger = control(page).locator('.trigger');
		if (await trigger.count()) await trigger.click();

		// Arrow keys move through a radio group, checking as they go. Light · Auto
		// · Dark, so two presses past Light is Dark — which is the option a
		// keyboard reader cannot reach if arrow navigation ever breaks.
		await control(page).locator('input[value="light"]').focus();
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowDown');

		expect(await checkedThemes(page)).toContain('dark');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	});
});
