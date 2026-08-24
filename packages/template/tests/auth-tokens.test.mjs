/**
 * Unit tests for the handoff and session JWT helpers.
 *
 * These two functions are the whole authentication boundary: `classifyPath`
 * decides *which* URLs need a reader, and these decide *who* the reader is. A
 * mistake here does not break a page — it hands an attacker a session. So most
 * of this file is the adversarial set rather than the happy path.
 *
 * Several tests below pin *jose's* behaviour rather than ours, because the
 * implementation leans on it and "jose surely rejects that" is exactly the kind
 * of assumption that silently stops being true across a major version. Each was
 * measured against jose 6.2.9 before being written down. Where a test exists to
 * stop a specific line being deleted (the `algorithms` pin, the audience
 * marker), it says so — those look redundant until someone simplifies the
 * implementation and only this file objects.
 *
 * Run:  node --test tests/auth-tokens.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, base64url, generateKeyPair } from 'jose';

import {
	verifyHandoffToken,
	createSessionToken,
	verifySessionToken,
} from '../src/lib/auth/tokens.mjs';

const SECRET = 'test-sso-secret';
const key = new TextEncoder().encode(SECRET);

function handoff(claims, { expiresIn = '5m', secret = key, alg = 'HS256' } = {}) {
	return new SignJWT(claims)
		.setProtectedHeader({ alg })
		.setSubject(claims.sub ?? 'user-1')
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(secret);
}

/** A JWS with an attacker-chosen header and no real signature. */
function unsigned(header, payload) {
	const part = (o) => base64url.encode(JSON.stringify(o));
	return `${part(header)}.${part(payload)}.`;
}

const FIVE_MIN = () => Math.floor(Date.now() / 1000) + 300;

// ---------------------------------------------------------------------------
// The handoff token — the plan's baseline
// ---------------------------------------------------------------------------

test('valid handoff token yields a session', async () => {
	const token = await handoff({ email: 'r@acme.test', name: 'R', orgs: ['acme'], state: 's1' });
	const session = await verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' });
	assert.deepEqual(session, { sub: 'user-1', email: 'r@acme.test', name: 'R', orgs: ['acme'] });
});

test('missing orgs claim defaults to empty array', async () => {
	const token = await handoff({ state: 's1' });
	const session = await verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' });
	assert.deepEqual(session.orgs, []);
});

test('state mismatch is rejected', async () => {
	const token = await handoff({ state: 'other' });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('wrong secret is rejected', async () => {
	const token = await handoff({ state: 's1' }, { secret: new TextEncoder().encode('wrong') });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('expired handoff token is rejected', async () => {
	// -10m is beyond the 60s clock tolerance.
	const token = await handoff({ state: 's1' }, { expiresIn: '-10m' });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('handoff token without exp is rejected', async () => {
	// jose accepts a token with no `exp` (measured) — absence is not expiry to
	// it. This check is ours, and this test is what keeps it.
	const token = await new SignJWT({ state: 's1' })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject('user-1')
		.sign(key);
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

// ---------------------------------------------------------------------------
// The session cookie — the plan's baseline
// ---------------------------------------------------------------------------

test('session token round-trips', async () => {
	const session = { sub: 'user-1', email: 'r@acme.test', name: 'R', orgs: ['acme'] };
	const token = await createSessionToken(session, { secret: SECRET, ttlSeconds: 60 });
	assert.deepEqual(await verifySessionToken(token, { secret: SECRET }), session);
});

test('tampered or expired session tokens verify to null, not a throw', async () => {
	const session = { sub: 'user-1', email: null, name: null, orgs: [] };
	const good = await createSessionToken(session, { secret: SECRET, ttlSeconds: 60 });
	assert.equal(await verifySessionToken(good + 'x', { secret: SECRET }), null);
	assert.equal(await verifySessionToken(good, { secret: 'other' }), null);
	const expired = await createSessionToken(session, { secret: SECRET, ttlSeconds: -60 });
	assert.equal(await verifySessionToken(expired, { secret: SECRET }), null);
});

test('a session cookie that is not a JWT at all verifies to null', async () => {
	// Cookie jars carry junk: a stale value from another app, a truncated
	// cookie, an empty string. None of that is an error worth a stack trace.
	for (const junk of ['', 'not-a-jwt', 'a.b.c', '...', '{}']) {
		assert.equal(await verifySessionToken(junk, { secret: SECRET }), null, junk);
	}
});

// ---------------------------------------------------------------------------
// Algorithm confusion
// ---------------------------------------------------------------------------

test('alg:none is rejected by both verifiers', async () => {
	// The signature-free forgery. jose refuses `none` outright (it is only
	// reachable through its separate UnsecuredJWT API), so this passes with or
	// without our `algorithms` pin — the pin is proven by the HS512 test below.
	const token = unsigned(
		{ alg: 'none' },
		{ sub: 'attacker', state: 's1', orgs: ['acme'], exp: FIVE_MIN() }
	);
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
	assert.equal(await verifySessionToken(token, { secret: SECRET }), null);
});

test('an RS256-signed token is rejected', async () => {
	const { privateKey } = await generateKeyPair('RS256');
	const token = await handoff({ state: 's1', orgs: ['acme'] }, { secret: privateKey, alg: 'RS256' });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
	assert.equal(await verifySessionToken(token, { secret: SECRET }), null);
});

test('the HS256 pin is enforced: HS512 on the same secret is refused', async () => {
	// This is the test that fails if someone deletes `algorithms: ['HS256']`.
	// Measured: without the pin, jose happily verifies an HS512 token signed
	// with these same secret bytes, so the two functions would accept a family
	// of tokens they never issue. Everything else in this section is rejected
	// by jose's own structure and would keep passing.
	const token = await handoff({ state: 's1', orgs: ['acme'] }, { alg: 'HS512' });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
	assert.equal(await verifySessionToken(token, { secret: SECRET }), null);
});

// ---------------------------------------------------------------------------
// Claim type confusion
//
// jose validates the *timestamp* claims' types and nothing else (measured:
// `sub: {a: 1}` verifies fine). Every identity claim is therefore attacker- or
// bug-shaped until this module checks it.
// ---------------------------------------------------------------------------

test('a non-string sub is rejected rather than coerced', async () => {
	// `String(sub)` would turn every object into the single identity
	// "[object Object]" — two different users collapsing to one — and
	// `String(['acme'])` into the bare string "acme". `App.Locals.session.sub`
	// is typed `string`; make the token prove it is one.
	for (const sub of [123, true, { id: 'x' }, ['user-1'], null]) {
		const token = await new SignJWT({ sub, state: 's1', exp: FIVE_MIN() })
			.setProtectedHeader({ alg: 'HS256' })
			.sign(key);
		await assert.rejects(
			() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }),
			`sub = ${JSON.stringify(sub)}`
		);
		assert.equal(await verifySessionToken(token, { secret: SECRET }), null);
	}
});

test('an empty-string sub is rejected', async () => {
	const token = await new SignJWT({ sub: '', state: 's1', exp: FIVE_MIN() })
		.setProtectedHeader({ alg: 'HS256' })
		.sign(key);
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('non-string org entries are dropped, not coerced into org names', async () => {
	// The org list is compared byte-for-byte against a URL path segment, so a
	// coerced entry is a fabricated identity: `String(null)` is "null" and
	// `String(['acme'])` is "acme" — the second inventing an org the token
	// never actually named. Dropping is the only safe reading of a claim that
	// does not match its documented shape.
	const token = await handoff({ state: 's1', orgs: ['acme', null, 42, {}, ['globex'], '', 'x'] });
	const session = await verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' });
	// The empty string goes too: an org name has the same shape as a `sub`, and
	// "" is not a name. It could never match a URL segment anyway — one less
	// piece of junk to reason about downstream.
	assert.deepEqual(session.orgs, ['acme', 'x']);
});

test('an orgs claim that is not an array yields no orgs', async () => {
	// `orgs: "acme"` is the plausible product bug — a single org sent unwrapped.
	// It must not become membership of anything, and must not iterate as the
	// characters of the string either.
	for (const orgs of ['acme', 42, { acme: true }, null]) {
		const token = await handoff({ state: 's1', orgs });
		const session = await verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' });
		assert.deepEqual(session.orgs, [], JSON.stringify(orgs));
	}
});

test('non-string email and name become null rather than junk strings', async () => {
	const token = await handoff({ state: 's1', email: 42, name: { first: 'R' } });
	const session = await verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' });
	assert.equal(session.email, null);
	assert.equal(session.name, null);
});

// ---------------------------------------------------------------------------
// The state check
// ---------------------------------------------------------------------------

test('a handoff token with no state claim is rejected', async () => {
	const token = await handoff({ orgs: ['acme'] });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

test('an absent or empty expectedState rejects every token, including a matching one', async () => {
	// Fail closed if the caller lost the state cookie. The dangerous shape is a
	// token with no `state` meeting an `expectedState` of `undefined`: under a
	// loose `==`-style comparison those two "match" and the CSRF binding
	// evaporates exactly when it is already broken.
	const noState = await handoff({ orgs: ['acme'] });
	const withState = await handoff({ state: 's1' });
	for (const expectedState of [undefined, null, '']) {
		await assert.rejects(
			() => verifyHandoffToken(noState, { secret: SECRET, expectedState }),
			`no-state token vs ${JSON.stringify(expectedState)}`
		);
		await assert.rejects(
			() => verifyHandoffToken(withState, { secret: SECRET, expectedState }),
			`stated token vs ${JSON.stringify(expectedState)}`
		);
	}
});

test('state is compared by exact type and value', async () => {
	// The state cookie is parsed from JSON, so a non-string `state` on either
	// side is reachable. `1` and `'1'` are different nonces.
	const token = await handoff({ state: 1 });
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: '1' }));

	// And a non-string `expectedState` is refused outright rather than compared.
	// This is the case a truthiness test (`!expectedState`) waves through: `1`
	// is truthy, so `1 !== 1` decides the check and a number becomes a valid
	// nonce. The real ones are `crypto.randomUUID()` strings; anything else
	// means the caller did not read a state cookie this site wrote.
	for (const expectedState of [1, true, {}, []]) {
		const matching = await handoff({ state: expectedState });
		await assert.rejects(
			() => verifyHandoffToken(matching, { secret: SECRET, expectedState }),
			`expectedState = ${JSON.stringify(expectedState)}`
		);
	}
});

// ---------------------------------------------------------------------------
// Cross-token replay
//
// One operator secret reused for both DOCS_SSO_SECRET and DOCS_SESSION_SECRET is
// the ordinary production slip — `.env.example` ships two deliberately different
// development values so the template does not model it. Every test below signs
// with a single secret precisely to stand in for the deployment that did.
// ---------------------------------------------------------------------------

test('a handoff token cannot be replayed as a session cookie', async () => {
	// Measured: with the secrets equal and no audience marker, this token
	// verifies as a session, orgs intact — letting a stolen handoff token be
	// pasted straight into the cookie jar, skipping the callback and its state
	// check entirely.
	const token = await handoff({ state: 's1', orgs: ['acme'] });
	assert.equal(await verifySessionToken(token, { secret: SECRET }), null);
});

test('an unrelated token signed with the same secret is not a session', async () => {
	// The serious shape of the same mistake: an operator reuses one secret for
	// the product's own long-lived tokens. Without the audience marker this
	// 30-day API token becomes an 8-hour docs session with `orgs: []` — which
	// is enough to read every shared private page.
	const token = await new SignJWT({ scope: 'api', role: 'admin' })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject('user-9')
		.setExpirationTime('30d')
		.sign(key);
	assert.equal(await verifySessionToken(token, { secret: SECRET }), null);
});

test('a session cookie cannot be replayed as a handoff token', async () => {
	// The other direction, blocked by the state claim rather than the audience:
	// this module issues session tokens and they never carry a `state`.
	const token = await createSessionToken(
		{ sub: 'user-1', email: null, name: null, orgs: ['acme'] },
		{ secret: SECRET, ttlSeconds: 60 }
	);
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

test('a missing or unusable secret throws instead of reading as "logged out"', async () => {
	// Belt and braces for a caller that skips `authConfigured()` — the planned
	// ones all gate on it, so this is about the next one. Without the check,
	// `new TextEncoder().encode(undefined)` is an empty key, jose throws
	// "Zero-length key is not supported", and a bare `catch { return null }`
	// reports a configuration error as an ordinary logged-out reader. A secret
	// that is not there is a deployment fault, and should read as one.
	const token = await createSessionToken(
		{ sub: 'user-1', email: null, name: null, orgs: [] },
		{ secret: SECRET, ttlSeconds: 60 }
	);
	for (const secret of [undefined, null, '', 0, {}]) {
		await assert.rejects(
			() => verifySessionToken(token, { secret }),
			/secret/i,
			`verify with ${JSON.stringify(secret)}`
		);
		await assert.rejects(
			() => verifyHandoffToken(token, { secret, expectedState: 's1' }),
			/secret/i,
			`handoff with ${JSON.stringify(secret)}`
		);
		await assert.rejects(
			() =>
				createSessionToken(
					{ sub: 'u', email: null, name: null, orgs: [] },
					{ secret, ttlSeconds: 60 }
				),
			/secret/i,
			`create with ${JSON.stringify(secret)}`
		);
	}
});

// ---------------------------------------------------------------------------
// Clock tolerance
// ---------------------------------------------------------------------------

test('clock tolerance covers small skew but is not a second expiry', async () => {
	// 60s exists so a customer's product and this site disagreeing slightly
	// about "now" does not reject good tokens. Its cost is that the design's
	// 5-minute replay window is really 6, which is the trade-off being pinned
	// here rather than an accident.
	const nearlyExpired = await handoff({ state: 's1' }, { expiresIn: '-30s' });
	await verifyHandoffToken(nearlyExpired, { secret: SECRET, expectedState: 's1' });

	const wellExpired = await handoff({ state: 's1' }, { expiresIn: '-90s' });
	await assert.rejects(() =>
		verifyHandoffToken(wellExpired, { secret: SECRET, expectedState: 's1' })
	);

	// Callers can tighten it.
	await assert.rejects(() =>
		verifyHandoffToken(nearlyExpired, { secret: SECRET, expectedState: 's1', clockTolerance: 0 })
	);

	// The session cookie gets no tolerance at all, deliberately: this site both
	// signs and verifies it, so there are no two clocks to disagree. An expired
	// session should mean "sign in again" the moment it expires.
	const staleSession = await createSessionToken(
		{ sub: 'user-1', email: null, name: null, orgs: [] },
		{ secret: SECRET, ttlSeconds: -30 }
	);
	assert.equal(await verifySessionToken(staleSession, { secret: SECRET }), null);
});

test('a not-yet-valid handoff token is rejected', async () => {
	// jose enforces `nbf` when present (measured), and the 60s tolerance
	// applies to it too — so only skew beyond the tolerance is refused.
	const token = await new SignJWT({ state: 's1' })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject('user-1')
		.setNotBefore(Math.floor(Date.now() / 1000) + 600)
		.setExpirationTime('20m')
		.sign(key);
	await assert.rejects(() => verifyHandoffToken(token, { secret: SECRET, expectedState: 's1' }));
});

// ---------------------------------------------------------------------------
// Session issuance
// ---------------------------------------------------------------------------

test('the session cookie carries only the claims the app reads', async () => {
	// A session cookie is readable by anyone holding it (signed, not
	// encrypted), so it should not accumulate claims nobody consumes.
	const token = await createSessionToken(
		{ sub: 'user-1', email: 'r@acme.test', name: 'R', orgs: ['acme'] },
		{ secret: SECRET, ttlSeconds: 60 }
	);
	const payload = JSON.parse(new TextDecoder().decode(base64url.decode(token.split('.')[1])));
	assert.deepEqual(
		Object.keys(payload).sort(),
		['aud', 'email', 'exp', 'iat', 'name', 'orgs', 'sub'].sort()
	);
});

test('a session token is issued with the requested lifetime', async () => {
	const before = Math.floor(Date.now() / 1000);
	const token = await createSessionToken(
		{ sub: 'user-1', email: null, name: null, orgs: [] },
		{ secret: SECRET, ttlSeconds: 8 * 60 * 60 }
	);
	const { exp } = JSON.parse(new TextDecoder().decode(base64url.decode(token.split('.')[1])));
	// Absolute epoch seconds, not a "+8h" string — `setExpirationTime` accepts
	// both and silently means different things.
	assert.ok(exp >= before + 8 * 60 * 60, `exp ${exp} too early`);
	assert.ok(exp <= before + 8 * 60 * 60 + 5, `exp ${exp} too late`);
});
