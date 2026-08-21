/**
 * Auth knobs — the non-secret half of the configuration.
 *
 * Secrets and the per-deployment SSO URL come from env vars (see
 * `.env.example`); this file is what a customer edits for behaviour. Server
 * code only: it imports `astro:env/server`, so neither `astro.config.mjs` nor
 * the `node --test` suites can import it. The pure logic lives in
 * `src/lib/auth/` for exactly that reason.
 *
 * ## Why the SSO URL is parsed here rather than where it is used
 *
 * `DOCS_SSO_URL` ends up in a `Location:` header, so `src/middleware.ts` has to
 * turn it into a `URL` to hang `redirect_uri` and `state` off it. Parsing at
 * the point of use means a typo'd value — `app.example.com/docs-sso` with the
 * scheme left off is the ordinary one — throws *inside the guard*, and every
 * request to `/private/**` becomes a 500 with a stack trace instead of the
 * documented fail-closed 404. Parsing once, here, folds that case into
 * `authConfigured()`: a value that cannot be a redirect target counts as no SSO
 * URL at all, which is a state the rest of the system already handles.
 *
 * The scheme check is the same idea. This value exists only to be handed to a
 * browser as somewhere to navigate, so http(s) is the whole of what it can
 * usefully be, and anything else is a typo worth failing closed on.
 */
import { DOCS_SSO_URL, DOCS_SSO_SECRET, DOCS_SESSION_SECRET } from 'astro:env/server';

export const auth = {
	/** Master switch. `false` behaves exactly like unset env vars: `/private/**` 404s. */
	enabled: true,
	/** Where readers are sent to authenticate — their product's SSO endpoint. */
	ssoUrl: DOCS_SSO_URL ?? null,
	sessionTtlSeconds: 8 * 60 * 60,
	sessionCookie: 'docs_session',
	stateCookie: 'docs_sso_state',
};

export const authSecrets = {
	sso: DOCS_SSO_SECRET ?? null,
	session: DOCS_SESSION_SECRET ?? null,
};

/**
 * `auth.ssoUrl` parsed, or `null` if it is unset or unusable as a redirect
 * target. Computed once at module load: env vars do not change under a running
 * server, and this must not be able to throw on the request path.
 *
 * Shared by every request, so callers must not mutate it — `redirectToSso`
 * copies it before adding query parameters.
 *
 * @type {URL | null}
 */
export const ssoEndpoint = parseSsoUrl(auth.ssoUrl);

/**
 * @param {string | null} value
 * @returns {URL | null}
 */
function parseSsoUrl(value) {
	if (!value) return null;
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		// The value is named but never echoed: it is declared `access: 'secret'`
		// in the env schema, and naming the variable is enough to fix it.
		console.error(
			'[auth] DOCS_SSO_URL is not a valid absolute URL, so private docs are ' +
				'disabled. Expected something like https://app.example.com/docs-sso.'
		);
		return null;
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		console.error(
			`[auth] DOCS_SSO_URL uses the "${parsed.protocol}" scheme, so private docs ` +
				'are disabled. Readers are redirected to this URL, so it has to be http or https.'
		);
		return null;
	}
	return parsed;
}

/**
 * Is there enough configuration to run a sign-in at all?
 *
 * Everything guarded fails closed when this is false — a 404 in production, a
 * setup page under `astro dev`. `src/middleware.ts` and `/auth/callback` both
 * check it before touching a secret, which is what keeps an unconfigured site
 * from reporting a deployment fault as a rejected token.
 */
export function authConfigured() {
	return Boolean(auth.enabled && ssoEndpoint && authSecrets.sso && authSecrets.session);
}
