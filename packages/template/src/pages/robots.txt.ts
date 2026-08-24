/**
 * `robots.txt`, generated from `site` rather than shipped as a static file.
 *
 * Its whole job is telling crawlers where the sitemap is, and that URL has to
 * be absolute. A static `public/robots.txt` would need the domain written into
 * it by hand — wrong for every customer who forgets, and wrong again on the day
 * the domain changes. Generating it means it is correct wherever `site` points,
 * including preview deployments.
 *
 * `withBase`, not a literal `/private/`: on a site built with `base: '/docs'`
 * the guarded routes answer at `/docs/private/`, so a hardcoded path matches
 * nothing on that host. Same blind spot the guard itself is hardened against —
 * see "The guard reads two signals" in wiki/private-docs.md — and it fails the
 * same way, silently and only on subpath deployments.
 *
 * `Disallow` is not access control. `src/middleware.ts` is, and it answers a
 * redirect or a 404 to anyone unauthenticated; this only spares crawlers a walk
 * they gain nothing from. It names the fixed prefix and never an org, because
 * org names are customer names — see "Wrong org is a 404, never a 403".
 *
 * The body itself lives in `src/lib/robots.mjs` so it can be tested without a
 * build; this file is only the wiring.
 */
import type { APIRoute } from 'astro';

import { withBase } from '../lib/auth/http.mjs';
import { robotsBody } from '../lib/robots.mjs';

export const prerender = true;

export const GET: APIRoute = ({ site }) =>
	new Response(robotsBody({ privatePath: withBase('/private/'), site }), {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	});
