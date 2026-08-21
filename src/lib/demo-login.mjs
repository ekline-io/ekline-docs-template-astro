/**
 * Pure logic for the demo login — the persona list and the two validation
 * rules `/demo-login` applies. See "The demo login" in wiki/private-docs.md.
 *
 * No `astro:env` import, the same split `src/config/auth.mjs` documents: this
 * stays importable from `node --test` and from `astro.config.mjs`, while the
 * env-reading gate lives in `src/config/demo-login.mjs`.
 */

/**
 * The fake readers the demo offers. `orgs` values are folder names under
 * `src/content/org-docs/`, compared byte-verbatim by the guard — the same
 * contract a real SSO token is under (wiki/private-docs.md). A customer who
 * keeps the demo enabled on a staging deployment edits this list to match
 * their own org folders; `tests/demo-login.test.mjs` fails if a persona names
 * a folder that does not exist.
 *
 * Three on purpose: org isolation is half the feature, and it takes a reader
 * in Acme, a reader in Globex and a reader in neither to see it — Acme's
 * persona reads `/private/orgs/acme/` and gets a bare 404 on Globex's.
 */
export const personas = [
	{
		id: 'acme',
		name: 'Dana Reed',
		email: 'dana@acme.test',
		orgs: ['acme'],
		describes: 'Acme member — private docs plus the Acme section, 404 on Globex',
	},
	{
		id: 'globex',
		name: 'Sam Patel',
		email: 'sam@globex.test',
		orgs: ['globex'],
		describes: 'Globex member — private docs plus the Globex section, 404 on Acme',
	},
	{
		id: 'no-org',
		name: 'Alex Kim',
		email: 'alex@example.test',
		orgs: [],
		describes: 'No orgs — private docs only, no org sections in the sidebar',
	},
];

/**
 * The persona for a `?as=` value, or `null`. The raw query value is never
 * placed into a JWT — only a persona from the list above is signed.
 *
 * @param {unknown} id
 * @returns {(typeof personas)[number] | null}
 */
export function findPersona(id) {
	if (typeof id !== 'string' || id === '') return null;
	return personas.find((persona) => persona.id === id) ?? null;
}

/**
 * Is `DOCS_UNSAFE_DEMO_LOGIN` set to one of its two documented spellings?
 *
 * Deliberately not a general truthiness check: this flag makes private
 * content world-readable (see wiki/private-docs.md), so `"TRUE"`, `"yes"` and
 * friends stay off rather than being helpfully accepted. The documented
 * values are the only values.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDemoFlagEnabled(value) {
	return value === '1' || value === 'true';
}

/**
 * Is `value` usable as the demo's redirect target — an absolute URL on the
 * same origin as the request?
 *
 * Without this check `/demo-login` is an open redirector that hands a freshly
 * signed handoff token to any site named in the query string. The mock SSO
 * server (`tests/mock-sso/server.mjs`) deliberately skips the equivalent
 * check and says why — it exists to prove the round trip, not to be deployed.
 * This route is deployed, so it validates, and in doing so models what a
 * customer's real endpoint should do: check `redirect_uri` against an
 * allowlist before redirecting to it.
 *
 * @param {unknown} value
 * @param {string} requestOrigin `Astro.url.origin` — the same origin the
 *   middleware built the `redirect_uri` from, so a legitimate round trip
 *   always matches, localhost quirks and all.
 * @returns {boolean}
 */
export function isDemoRedirectUri(value, requestOrigin) {
	if (typeof value !== 'string' || value === '') return false;
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		return false;
	}
	return parsed.origin === requestOrigin;
}
