import { defineConfig, devices } from '@playwright/test';

import {
	testEnv,
	SITE_PORT,
	SITE_ORIGIN,
	MOCK_SSO_PORT,
	MOCK_SSO_URL,
} from './tests/helpers/test-servers.mjs';

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
		// Both suites share one server: running the API reference suite somewhere
		// else would mean two servers for one `dist/`. The port is a preference
		// now rather than a constraint — see `tests/helpers/test-servers.mjs`
		// for why it used to be neither.
		baseURL: SITE_ORIGIN,
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

	/*
	 * Two servers: the docs site, and the mock SSO endpoint it hands readers off
	 * to. `tests/visual/auth.spec.mjs` drives the round trip between them.
	 *
	 * ## Not `astro preview`
	 *
	 * The site runs from the adapter's own standalone entry point rather than
	 * `astro preview`, and that is what makes the port configurable. Under
	 * `astro preview --port N`, `context.url.origin` reports
	 * `http://localhost:4321` whatever `N` is, so the middleware advertised a
	 * `redirect_uri` pointing at a port nothing was listening on and the round
	 * trip died on connection refused. The standalone server reports the real
	 * port and serves `dist/client/` — including the Pagefind index, the reason
	 * this suite needs a built site rather than `astro dev`. Measured both ways;
	 * `tests/helpers/test-servers.mjs` carries the detail.
	 *
	 * What has *not* changed: the fix is still not to make the mock SSO server
	 * ignore `redirect_uri`. That round trip is what these tests prove, and a
	 * mock that ignored the parameter would keep passing if the middleware
	 * stopped sending one.
	 */
	webServer: [
		{
			// Serve only — the build runs from the `test:visual` script instead.
			//
			// Building here would be skipped whenever `reuseExistingServer` finds a
			// server already listening, and the suite would then quietly test the
			// previous build. That is how a real fix can look like a persistent
			// failure. This entry point reads `dist/` from disk at startup, so a
			// server left running from an earlier run picks the fresh build up on
			// restart either way.
			//
			// If `dist/server/entry.mjs` is missing, the build did not run: the
			// script does it, so run the suite through `npm run test:visual`
			// rather than `npx playwright test`.
			//
			// Env is the one thing a reused server does *not* pick up: these values
			// are read at runtime (`astro:env` `access: 'secret'`), so a preview
			// started by hand without them serves 404s from `/private/**` instead of
			// the SSO redirect. The logged-out specs fail loudly when that happens,
			// which is the intended outcome — stop the server and let this config
			// start its own.
			command: 'node ./dist/server/entry.mjs',
			url: SITE_ORIGIN,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
			// Read from `.env.test` rather than written out here.
			//
			// The same `DOCS_*` values configure the *build* — the auth controls are
			// derived from configuration, so a build without them correctly omits
			// them and every header test would fail for the right reason and the
			// wrong purpose. That build runs via `node --env-file=.env.test` in
			// `package.json`. Two copies of these values would drift, and the
			// failure when they did would be a redirect to an SSO endpoint whose
			// signature no longer verifies — a long way from the edit that caused
			// it.
			//
			// The two secrets are deliberately different, as in `.env.example`:
			// the session token's `aud` claim means a handoff token cannot be
			// replayed as a session cookie even when both match, and the suite
			// should exercise the configuration customers are told to use.
			env: { PORT: String(SITE_PORT), ...testEnv },
		},
		{
			// The readiness probe is deliberately a request the endpoint refuses:
			// `redirect_uri=probe` is not a URL, so it answers 400, and Playwright
			// counts anything under 404 as up. A well-formed probe would answer 302
			// — and Playwright *follows* redirects when polling, which would send it
			// to a docs site that may not be listening yet.
			command: 'node tests/mock-sso/server.mjs',
			env: { MOCK_SSO_PORT: String(MOCK_SSO_PORT), MOCK_SSO_SECRET: testEnv.DOCS_SSO_SECRET },
			url: `${MOCK_SSO_URL.href}?redirect_uri=probe&state=probe`,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
		},
	],
});
