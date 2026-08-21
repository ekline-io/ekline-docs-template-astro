/**
 * Ends the docs site's own session. It does not touch the customer's product
 * session — the reader signed in there, and signing them out of their product
 * is not this template's call to make. A logged-out reader who clicks a private
 * link simply round-trips through SSO again, usually invisibly.
 *
 * Unguarded on purpose (`/auth/**` classifies as `auth`): logging out must work
 * whether or not the session cookie is still valid.
 *
 * ## Why a GET that changes state is guarded by a header
 *
 * This is reached from a sidebar link, so it has to answer GET — a form POST
 * cannot be a sidebar entry. That makes it a state-changing GET, and the
 * ordinary consequence is that any third-party page can fire it with
 * `<img src="https://docs.example.com/auth/logout">`: the `Set-Cookie` deletion
 * applies whether or not the browser sent the existing cookie, so every reader
 * who loads the attacker's page is silently signed out.
 *
 * The impact is nuisance rather than disclosure — re-signing in is usually an
 * invisible round trip — but it costs one header to refuse. `Sec-Fetch-Site` is
 * set by the browser, cannot be forged by page script, and reports
 * `same-origin` for a link click from this site and `cross-site` for anything
 * embedded elsewhere. A browser too old to send it gets the previous behaviour,
 * which is the right way for this to degrade: failing closed here would mean
 * refusing to log people out.
 */
import type { APIRoute } from 'astro';
import { auth, sessionCookieAttributes } from '../../config/auth.mjs';
import { siteRoot } from '../../lib/auth/http.mjs';
import { clearStateCookie } from '../../middleware';

export const prerender = false;

export const GET: APIRoute = (context) => {
	const from = context.request.headers.get('sec-fetch-site');
	if (from === 'cross-site' || from === 'same-site') {
		// Nothing is disclosed by refusing, so this can be the plainest possible
		// answer. Redirecting instead would let the attacker's page confirm the
		// endpoint exists.
		return new Response(null, { status: 204 });
	}

	context.cookies.delete(auth.sessionCookie, sessionCookieAttributes);
	// Also clear any half-finished sign-in, so its `attempts` counter cannot
	// outlive the session and push the reader onto the loop-guard error page
	// the next time they sign in.
	clearStateCookie(context);
	// `siteRoot()`, not `/`: `context.redirect()` writes `Location` verbatim, so
	// a bare `/` on a site with `base: '/docs'` sends the reader off the site.
	return context.redirect(siteRoot());
};
