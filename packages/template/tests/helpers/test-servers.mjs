/**
 * Where the browser suite's two servers listen, in one place.
 *
 * `playwright.config.mjs` starts them from these values and `tests/visual/*`
 * asserts against them, so a port change is one edit rather than a hunt
 * through hardcoded literals in three files.
 *
 * ## Why this can be configurable at all
 *
 * It could not be, until the suite stopped using `astro preview`. Under
 * `astro preview --port N`, `context.url.origin` reports
 * `http://localhost:4321` whatever `N` is — measured at four different ports.
 * The middleware builds the `redirect_uri` it hands the SSO endpoint out of
 * that origin, so a preview on any other port told the SSO server to send
 * readers back to a port nothing was listening on, and the round trip died on
 * connection refused. That is why the suite was pinned to 4321, and why the
 * pin was load-bearing rather than a matter of taste.
 *
 * The standalone Node server the adapter emits has no such quirk: measured on
 * `PORT=4500 node ./dist/server/entry.mjs`, `/private/` redirects with
 * `redirect_uri=http%3A%2F%2Flocalhost%3A4500%2Fauth%2Fcallback` — the real
 * port — and it serves the prerendered pages and the Pagefind index from
 * `dist/client/` too, which is the reason the suite needed a built site
 * rather than `astro dev` in the first place. So the suite runs that instead,
 * and the port became an ordinary preference.
 *
 * Both are overridable because a developer machine is not guaranteed to have
 * any particular port free — the original 4321 pin collided with an unrelated
 * project's dev server, which is what prompted this.
 *
 * ## The mock SSO port is derived, not declared
 *
 * It comes from `DOCS_SSO_URL` in `.env.test`, because that value is what the
 * *site* is configured to redirect to. Declaring the port separately would
 * let the two drift, and the failure when they did would be a redirect to a
 * port nothing is listening on — the same failure the 4321 pin existed to
 * prevent, reintroduced by a different route.
 */
import { readFileSync } from 'node:fs';

/** `.env.test` parsed — the one place the `DOCS_*` test values are written. */
export const testEnv = Object.fromEntries(
	readFileSync(new URL('../../.env.test', import.meta.url), 'utf8')
		.split('\n')
		.filter((line) => line.trim() && !line.startsWith('#'))
		.map((line) => {
			const eq = line.indexOf('=');
			return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
		})
);

/**
 * The port the docs site listens on under test.
 *
 * Deliberately not 4321: that is `astro dev`'s default, so a developer with
 * the dev server running would otherwise collide with their own site. Set
 * `DOCS_TEST_PORT` to move it.
 */
export const SITE_PORT = Number(process.env.DOCS_TEST_PORT ?? 4331);

/** The site's origin as the browser — and the server itself — sees it. */
export const SITE_ORIGIN = `http://localhost:${SITE_PORT}`;

/**
 * The mock SSO endpoint, read off `DOCS_SSO_URL` so the site's configuration
 * and the server the suite starts cannot disagree. Override by editing
 * `.env.test`, which moves both at once.
 */
export const MOCK_SSO_URL = new URL(testEnv.DOCS_SSO_URL);
export const MOCK_SSO_ORIGIN = MOCK_SSO_URL.origin;
export const MOCK_SSO_PORT = Number(MOCK_SSO_URL.port);

/** Where the SSO round trip comes back to. Base-less, as this build has no `base`. */
export const CALLBACK_URL = `${SITE_ORIGIN}/auth/callback`;
