import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression tests for the API reference.
 *
 * Kept out of `npm test` on purpose. That suite is plain `node --test` over the
 * build output, so a customer can clone this template and verify it without
 * downloading a browser. These run separately, via `npm run test:visual`.
 *
 * They run against `astro preview`, not `astro dev`: Pagefind only builds its
 * search index at build time, so the dev server cannot exercise search at all.
 *
 * Docs: https://playwright.dev/docs/test-snapshots
 */
export default defineConfig({
	testDir: './tests/visual',
	/*
	 * Screenshots are compared per-platform: font rendering differs enough
	 * between macOS and Linux that one baseline cannot serve both.
	 *
	 * Only the platform you generate on is committed. The first run on another —
	 * a Linux CI runner, most likely — has no baseline to compare against and
	 * fails, because a missing snapshot is a failure rather than something
	 * Playwright quietly creates. Generate and commit that platform's baselines
	 * once (`npm run test:visual:update` on a matching machine or container),
	 * or keep this suite to the platform it was authored on. See
	 * `wiki/api-reference.md`.
	 */
	snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
	/*
	 * Run serially.
	 *
	 * Every test waits on Scalar's bundle from a CDN and on it rendering a large
	 * document. Several workers doing that at once stretch those waits past the
	 * point where a test can tell "slow" from "broken", and the suite starts
	 * failing on timing rather than on behaviour. The whole run is ~30s serial,
	 * which is a fair price for a signal worth trusting.
	 */
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,

	/*
	 * Retry once even locally.
	 *
	 * The reference loads Scalar's bundle from a CDN, so the first test against a
	 * cold cache can take several times longer than the rest — long enough to
	 * trip a timeout on a run that is otherwise fine. Retrying absorbs that
	 * without hiding real failures: a genuine break fails both attempts.
	 */
	retries: process.env.CI ? 2 : 1,

	// Generous, for the same reason: a cold CDN fetch plus rendering a large
	// document is slow, and the default 30s can be tight on the first test.
	timeout: 60_000,
	reporter: process.env.CI ? 'github' : 'list',

	use: {
		baseURL: 'http://localhost:4331',
		// Only kept for failures — a passing run should leave nothing behind.
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},

	expect: {
		toHaveScreenshot: {
			// Scalar renders from a CDN bundle and paints its own surfaces, so a
			// handful of pixels can differ between runs from antialiasing alone.
			// Tight enough to catch a layout or colour regression, loose enough not
			// to fail on a font hinting difference.
			maxDiffPixelRatio: 0.01,
			animations: 'disabled',
		},
	},

	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
		// Pixel 5 rather than an iPhone: it is Chromium-based, so `npx playwright
		// install chromium` is the only browser download this suite needs.
		{ name: 'mobile', use: { ...devices['Pixel 5'] } },
	],

	webServer: {
		// Preview only — the build runs from the `test:visual` script instead.
		//
		// Building here would be skipped whenever `reuseExistingServer` finds a
		// server already listening, and the suite would then quietly test the
		// previous build. That is how a real fix can look like a persistent
		// failure. `astro preview` serves `dist/` from disk, so a server left
		// running from an earlier run picks the fresh build up either way.
		command: 'npx astro preview --port 4331',
		url: 'http://localhost:4331',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
