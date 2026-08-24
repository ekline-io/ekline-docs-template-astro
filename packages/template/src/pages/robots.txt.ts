/**
 * `robots.txt`, generated from `site` rather than shipped as a static file.
 *
 * Its whole job is telling crawlers where the sitemap is, and that URL has to
 * be absolute. A static `public/robots.txt` would need the domain written into
 * it by hand — so it would be wrong for every customer who forgets, and wrong
 * again on the day the domain changes. Generating it means it is correct
 * wherever `site` points, including preview deployments.
 *
 * `Disallow: /private/` is not access control — `src/middleware.ts` is, and it
 * answers a redirect or a 404 to anyone unauthenticated. This just stops
 * crawlers walking the sign-in link and collecting redirects. It names only
 * the fixed prefix, never an org, because org names are customer names (see
 * "Wrong org is a 404, never a 403" in wiki/private-docs.md).
 */
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	// `site` is undefined only if `astro.config.mjs` has no `site` set. The
	// template always sets one, but emitting a bare `Sitemap:` line would be
	// worse than emitting none, so the line is conditional.
	const sitemap = site ? `Sitemap: ${new URL('sitemap-index.xml', site).href}\n` : '';

	return new Response(
		`User-agent: *\nAllow: /\nDisallow: /private/\n\n${sitemap}`,
		{ headers: { 'content-type': 'text/plain; charset=utf-8' } }
	);
};
