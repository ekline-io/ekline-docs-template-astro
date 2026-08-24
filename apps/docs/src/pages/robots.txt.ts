/**
 * `robots.txt`, generated from `site` rather than shipped as a static file.
 *
 * Its whole job is telling crawlers where the sitemap is, and that URL has to
 * be absolute — so writing it by hand means it is wrong the day the domain
 * changes. Generating it keeps it correct wherever `site` points.
 *
 * No `Disallow` here: this site is entirely public, and the template's own
 * copy of this file (which does disallow `/private/`) is the one that needs
 * the extra line.
 */
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	const sitemap = site ? `Sitemap: ${new URL('sitemap-index.xml', site).href}\n` : '';

	return new Response(`User-agent: *\nAllow: /\n\n${sitemap}`, {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	});
};
