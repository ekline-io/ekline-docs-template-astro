/**
 * JWT helpers for the SSO handoff and the docs site's own session.
 *
 * Two tokens pass through here, and they are not variations on one idea:
 *
 * - The **handoff token** is signed by the *customer's product* and arrives in
 *   a URL query parameter. It is foreign input, verified once, and discarded.
 * - The **session cookie** is signed by this site for itself, and presented on
 *   every subsequent request to `/private/**`.
 *
 * Pure by design: secrets always arrive as arguments, so this module never
 * imports `astro:env` and stays testable under `node --test`. `src/config/auth.mjs`
 * is where they come from in the running app.
 *
 * ## The two asymmetries
 *
 * **Failure means different things.** `verifyHandoffToken` THROWS — a bad
 * handoff token is an event worth a message, and `/auth/callback` turns it into
 * an error page with a retry link. `verifySessionToken` returns `null` — an
 * expired or absent cookie is what every reader's browser looks like eventually,
 * and it means "redirect to SSO", not "something went wrong".
 *
 * **Only the session token is marked.** `createSessionToken` stamps an
 * `aud` claim that `verifySessionToken` requires; the handoff token is checked
 * against exactly the claims the design documents and nothing more. Marking one
 * side is enough to make the two non-interchangeable, and it is the side this
 * template controls — requiring a new claim from the customer's product would
 * change an integration contract (a ~20-line endpoint in *their* backend) to
 * buy the same property.
 *
 * ### Why the marker exists at all
 *
 * `DOCS_SSO_SECRET` and `DOCS_SESSION_SECRET` are separate variables, but one
 * operator secret reused everywhere is an ordinary mistake — `.env.example`
 * ships the two with the same development value. Measured with them equal and
 * no marker: a handoff token verifies as a session cookie with its `orgs`
 * intact, so a stolen handoff token could be pasted into the cookie jar
 * directly, skipping the callback and its state check. Worse, *any* token the
 * product signs with that secret for its own purposes — an API token, a
 * password-reset link — verifies as a docs session with `orgs: []`, which is
 * enough to read every shared private page, for as long as that token lives.
 * One `aud` claim ends both. The reverse direction needs nothing: a session
 * token carries no `state`, so it can never satisfy the handoff check.
 *
 * ## Claims are validated, never coerced
 *
 * jose validates the *timestamp* claims' types and leaves the rest alone
 * (measured: `sub: {a: 1}` verifies happily). So every identity claim below is
 * checked before it is believed, and anything of the wrong shape is dropped
 * rather than converted. `String()` on untrusted input invents identities:
 * every object becomes the single `sub` `"[object Object]"`, collapsing distinct
 * users into one, and `String(['acme'])` is the bare string `"acme"` — an org
 * membership the token never actually stated. `orgs` entries are compared
 * byte-for-byte against a URL segment by the middleware, so a fabricated one is
 * a fabricated grant. A claim that does not match its documented shape is
 * absent, which fails closed.
 *
 * `exp` is required on both tokens even though jose does not require it — a JWT
 * with no expiry verifies fine there, and for the handoff token that would be a
 * standing credential sitting in a URL. What is *not* enforced is a maximum
 * lifetime: the design specifies 5 minutes, but how long the product's tokens
 * live is the product's policy, and rejecting a customer's 15-minute token
 * would be this template overruling it. The `exp` requirement catches the
 * pathological case; the length is theirs.
 *
 * ## What the `state` check is, and is not
 *
 * It binds the token to the browser that started the sign-in — CSRF protection,
 * so a token obtained by an attacker cannot be forced through a victim's
 * browser. It is *not* protection against a stolen token being used by the
 * thief: the state it is compared against comes from a cookie, and a cookie in
 * the attacker's own browser is whatever they say it is. What limits that is
 * the token's short expiry (and, if the state cookie is ever made
 * tamper-evident, the middleware is where that belongs — not here).
 *
 * ## Clock tolerance
 *
 * The handoff token gets 60s, because two machines are involved and the
 * customer's product and this site will not agree perfectly about "now".
 * Measured against jose 6.2.9, it widens `exp` and `nbf` in both directions and
 * does not touch `iat` (jose only inspects `iat` when `maxTokenAge` is set).
 * The cost is that the design's 5-minute replay window is really 6.
 *
 * The session cookie gets none: this site signs and verifies it with the same
 * clock, so there is no skew to absorb, and an expired session should send the
 * reader back to SSO the moment it expires.
 */
import { SignJWT, jwtVerify } from 'jose';

/**
 * Marks a token as this site's own session cookie. Its value is arbitrary — it
 * only has to be something the customer's product would never put in a handoff
 * token.
 */
const SESSION_AUDIENCE = 'ekline-docs-session';

/**
 * A usable identifier — the shape `sub` and every `orgs` entry must have.
 * Empty strings are rejected along with the wrong types: an empty org can never
 * match a URL segment, and an empty `sub` is not a user.
 *
 * Typed as a predicate so `orgs.filter(isIdentifier)` narrows to `string[]`
 * rather than leaving the org list as `any[]` for every downstream caller.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
const isIdentifier = (value) => typeof value === 'string' && value !== '';

/**
 * A missing secret is a deployment fault, not a rejected token, so it fails
 * loudly here rather than deeper in.
 *
 * Without this check `new TextEncoder().encode(undefined)` produces an *empty*
 * key and jose throws `DOMException: Zero-length key is not supported` — which
 * `verifySessionToken`'s catch would report as "no session", turning a missing
 * environment variable into an endless redirect to SSO with nothing in the logs
 * to say why.
 *
 * @param {unknown} secret
 * @param {string} name The env var to name in the error.
 */
function keyFrom(secret, name) {
	if (!isIdentifier(secret)) {
		throw new Error(
			`[auth] the ${name} secret is missing or empty — set it before serving ` +
				`private docs (see .env.example).`
		);
	}
	return new TextEncoder().encode(secret);
}

/**
 * Shape a verified payload into a session. Callers validate `sub` and `exp`
 * first, because they disagree about what an invalid one means.
 *
 * @param {import('jose').JWTPayload} payload
 * @returns {{ sub: string, email: string | null, name: string | null, orgs: string[] }}
 */
function sessionFrom(payload) {
	return {
		sub: /** @type {string} */ (payload.sub),
		email: typeof payload.email === 'string' ? payload.email : null,
		name: typeof payload.name === 'string' ? payload.name : null,
		orgs: Array.isArray(payload.orgs) ? payload.orgs.filter(isIdentifier) : [],
	};
}

/**
 * Verify a handoff token from the customer's SSO endpoint. Throws on failure —
 * the callback turns the reason into an error page.
 *
 * @param {string} token
 * @param {{ secret: unknown, expectedState: unknown, clockTolerance?: number }} options
 */
export async function verifyHandoffToken(token, { secret, expectedState, clockTolerance = 60 }) {
	const key = keyFrom(secret, 'DOCS_SSO_SECRET');
	// Pinning the algorithm is not decoration: without it jose accepts HS384
	// and HS512 signed with these same secret bytes, widening what this
	// function will take beyond what any SSO endpoint should ever send.
	const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], clockTolerance });

	if (typeof payload.exp !== 'number') throw new Error('handoff token has no exp claim');
	if (!isIdentifier(payload.sub)) throw new Error('handoff token has no usable sub claim');
	// Both sides must be present and identical. An `expectedState` the caller
	// could not supply is a lost or unreadable state cookie, and the safe
	// reading of that is "start over", not "waive the check" — note that a
	// token with no `state` would otherwise match a missing one.
	if (!isIdentifier(expectedState) || payload.state !== expectedState) {
		throw new Error('handoff token state does not match the state cookie');
	}

	return sessionFrom(payload);
}

/**
 * Sign the docs site's own session cookie value.
 *
 * @param {{ sub: string, email: string | null, name: string | null, orgs: string[] }} session
 * @param {{ secret: unknown, ttlSeconds: number }} options
 */
export async function createSessionToken(session, { secret, ttlSeconds }) {
	const key = keyFrom(secret, 'DOCS_SESSION_SECRET');
	return new SignJWT({ email: session.email, name: session.name, orgs: session.orgs })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(session.sub)
		.setAudience(SESSION_AUDIENCE)
		.setIssuedAt()
		// Absolute epoch seconds. `setExpirationTime` also accepts strings like
		// '8h', but a number keeps a negative TTL meaningful (the tests issue
		// already-expired cookies with one).
		.setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
		.sign(key);
}

/**
 * Verify a session cookie value. Returns the session, or `null` if the cookie
 * is invalid, expired, absent-shaped or simply junk — all everyday states that
 * mean "send this reader to SSO".
 *
 * A missing secret still throws: that is the one failure here that is the
 * deployment's fault rather than the cookie's, and reporting it as a logged-out
 * reader would hide it behind a redirect loop.
 *
 * @param {string} token
 * @param {{ secret: unknown }} options
 */
export async function verifySessionToken(token, { secret }) {
	const key = keyFrom(secret, 'DOCS_SESSION_SECRET');
	try {
		const { payload } = await jwtVerify(token, key, {
			algorithms: ['HS256'],
			audience: SESSION_AUDIENCE,
		});
		if (!isIdentifier(payload.sub) || typeof payload.exp !== 'number') return null;
		return sessionFrom(payload);
	} catch {
		return null;
	}
}
