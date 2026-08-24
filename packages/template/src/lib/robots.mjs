/**
 * The body of `robots.txt`, as a pure function of the two things it depends on.
 *
 * Separated from the route for the reason `src/config/auth.mjs` gives for its
 * own split: the route reads `import.meta.env.BASE_URL`, which Vite substitutes
 * at build time and `node --test` cannot supply. A test against the route would
 * have to re-implement it, and a test that re-implements what it checks passes
 * while the real thing is broken.
 *
 * Both parameters are passed in rather than read here, so the same call the
 * route makes is the call the tests make.
 */

/** The placeholder `site` the template ships, which no customer should deploy. */
const PLACEHOLDER_ORIGIN = 'https://example.com';

/**
 * @param {object} options
 * @param {string} options.privatePath The guarded prefix, base included —
 *   `withBase('/private/')` at the call site. On a site built with
 *   `base: '/docs'` the guarded routes answer at `/docs/private/`, so a literal
 *   `/private/` matches nothing on that host and crawlers walk the sign-in link
 *   freely, collecting an SSO redirect per page. Measured on a real build.
 * @param {URL | undefined} options.site Astro's `site`, or undefined when
 *   `astro.config.mjs` sets none.
 * @returns {string}
 */
export function robotsBody({ privatePath, site }) {
	// Only advertise a sitemap once `site` is really yours. Until a customer
	// replaces the shipped placeholder, pointing crawlers at
	// `example.com/sitemap-index.xml` is worse than saying nothing — and it is
	// the same silent misconfiguration that put `https://example.com` canonicals
	// on a live deployment once already.
	//
	// `@astrojs/sitemap` writes its index at the origin root regardless of
	// `base` (measured), which is where this resolves to.
	const configured = site && site.origin !== PLACEHOLDER_ORIGIN;
	const sitemap = configured ? `Sitemap: ${new URL('sitemap-index.xml', site).href}\n` : '';

	return ['User-agent: *', 'Allow: /', `Disallow: ${privatePath}`, '', sitemap].join('\n');
}
