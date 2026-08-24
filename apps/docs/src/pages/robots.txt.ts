/**
 * `robots.txt`, generated from `site` rather than shipped as a static file.
 *
 * Its whole job is telling crawlers where the sitemap is, and that URL has to
 * be absolute — so writing it by hand means it is wrong the day the domain
 * changes. Generating it keeps it correct wherever `site` points.
 *
 * No `Disallow`: this site is entirely public. The template's copy of this file
 * has one, because it ships a guarded `/private/` prefix.
 */
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	// `site` is hardcoded in astro.config.mjs, so this is belt-and-braces — but a
	// bare `Sitemap:` line would be worse than none if it ever became unset.
	const sitemap = site ? `Sitemap: ${new URL('sitemap-index.xml', site).href}\n` : '';

	return new Response(`User-agent: *\nAllow: /\n\n${sitemap}`, {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	});
};
