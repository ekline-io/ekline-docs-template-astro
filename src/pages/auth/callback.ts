/**
 * The SSO handoff landing. Verifies the token the customer's product signed,
 * then swaps it for this site's own session cookie. The handoff token lives
 * only in this one redirect — it is never stored.
 *
 * `/auth/**` is deliberately outside the guard (`classifyPath` returns `auth`,
 * and `src/middleware.ts` passes it straight through): this endpoint is how a
 * session comes into existence, so guarding it would make sign-in impossible.
 * Everything it reads is therefore attacker-controlled — the `token` query
 * parameter and the unsigned state cookie both — and nothing here may assume
 * otherwise.
 */
import type { APIRoute } from 'astro';
import { auth, authSecrets, authConfigured } from '../../config/auth.mjs';
import { verifyHandoffToken, createSessionToken } from '../../lib/auth/tokens.mjs';
import { readStateCookie } from '../../middleware';

export const prerender = false;

export const GET: APIRoute = async (context) => {
	// Fail closed in the same shape as the guard: an unconfigured site has no
	// sign-in endpoint, rather than one that reports a deployment fault.
	if (!authConfigured()) return new Response('Not found', { status: 404 });

	const token = context.url.searchParams.get('token');
	const stored = readStateCookie(context.cookies.get(auth.stateCookie)?.value);
	const returnTo = safeReturnTo(stored?.returnTo);

	if (!token || !stored) return failure('The sign-in link is missing its token or state.', returnTo);

	let session;
	try {
		session = await verifyHandoffToken(token, {
			secret: authSecrets.sso!,
			expectedState: stored.state,
		});
	} catch (error) {
		console.error('[auth] handoff token rejected:', error);
		return failure('The sign-in token was invalid or expired.', returnTo);
	}

	const value = await createSessionToken(session, {
		secret: authSecrets.session!,
		ttlSeconds: auth.sessionTtlSeconds,
	});
	context.cookies.set(auth.sessionCookie, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge: auth.sessionTtlSeconds,
	});
	// Success clears the state cookie — and with it the loop-guard counter.
	context.cookies.delete(auth.stateCookie, { path: '/' });
	return context.redirect(returnTo);
};

/**
 * Only same-site paths; anything else falls back to the private index.
 *
 * An allowlist, not a denylist. The obvious spelling — "starts with `/`, but
 * not `//`" — admits `/"><script>…`, which breaks out of the `href` attribute
 * in `failure()` below. `returnTo` arrives from the unsigned state cookie, so
 * reaching a victim needs cookie-forcing first; that is a real position on a
 * docs site, not a theoretical one. Restricting the character set is cheaper
 * to get right than escaping, and nothing legitimate needs the rest: this
 * value is always a path this site generated.
 */
function safeReturnTo(value: string | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return '/private/';
	return /^\/[A-Za-z0-9/_\-.~%?=&]*$/.test(value) ? value : '/private/';
}

function failure(reason: string, returnTo: string) {
	// The retry link restarts SSO via the middleware. The state cookie is NOT
	// cleared here: repeated failures increment its counter until the loop
	// guard stops the cycle.
	//
	// `reason` is one of this file's own literals and `returnTo` has been
	// through `safeReturnTo`, so neither can carry markup — but escape anyway.
	// The alternative is that the safety of this string depends on a reader
	// tracing both arguments to their sources.
	return new Response(
		`<!doctype html><title>Sign-in failed</title>
		<h1>Sign-in failed</h1><p>${escapeHtml(reason)}</p>
		<p><a href="${escapeHtml(returnTo)}">Try again</a></p>`,
		{ status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);
}

/**
 * The characters that can change the meaning of the HTML in `failure()`.
 *
 * A named `Record<string, string>` rather than an object literal indexed
 * inline: TypeScript narrows a literal's keys to exactly those five, so
 * indexing one with an arbitrary `string` is `string | undefined` and
 * `astro check` refuses to pass it to `String#replace`. Widening the type is
 * the honest fix — the guarantee that every lookup hits is the regex below
 * having no character this table lacks, which is a property of reading the two
 * together, not something the key type was ever proving.
 */
const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
