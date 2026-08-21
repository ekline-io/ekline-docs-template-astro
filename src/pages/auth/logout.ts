/**
 * Ends the docs site's own session. It does not touch the customer's product
 * session — the reader signed in there, and signing them out of their product
 * is not this template's call to make. A logged-out reader who clicks a private
 * link simply round-trips through SSO again, usually invisibly.
 *
 * Unguarded on purpose (`/auth/**` classifies as `auth`): logging out must work
 * whether or not the session cookie is still valid.
 */
import type { APIRoute } from 'astro';
import { auth } from '../../config/auth.mjs';

export const prerender = false;

export const GET: APIRoute = (context) => {
	context.cookies.delete(auth.sessionCookie, { path: '/' });
	return context.redirect('/');
};
