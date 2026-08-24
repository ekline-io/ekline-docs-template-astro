/**
 * A stand-in for the customer's product SSO endpoint. Signs a handoff JWT for a
 * fixed test reader (org: acme) and redirects straight back — no login form,
 * because what is under test is the docs site's half of the handshake.
 *
 * Used by the Playwright suite AND as the local-dev login: `npm run dev:sso`
 * plus the values in `.env.example` gives `npm run dev` a working sign-in.
 *
 * It redirects to the `redirect_uri` it was given rather than to a hardcoded
 * callback, and that is deliberate. The round trip is precisely what the auth
 * suite exists to prove: a mock that ignored the parameter would keep passing
 * if the middleware stopped sending one, or started sending one pointing at an
 * origin no browser can reach.
 */
import { createServer } from 'node:http';
import { SignJWT } from 'jose';

// Default matches `.env.example`, so `cp .env.example .env` plus
// `npm run dev:sso` is a working local login with nothing else to configure.
// The Playwright config passes the same value explicitly rather than relying
// on this default, so the suite does not depend on a developer's `.env`.
const secret = new TextEncoder().encode(
	process.env.MOCK_SSO_SECRET ?? 'dev-only-sso-not-a-secret'
);
const port = Number(process.env.MOCK_SSO_PORT ?? 4545);

const server = createServer((req, res) => {
	handle(req, res).catch((error) => {
		// An unhandled rejection inside a request handler takes the whole process
		// down under Node's default `--unhandled-rejections=throw`. This process is
		// a Playwright `webServer`, so that turns one malformed request into "the
		// server failed to start" for the entire run — a failure that points
		// nowhere near its cause. Answer 500 and stay up instead.
		console.error('[mock-sso] request failed:', error);
		if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
		res.end('mock SSO failed');
	});
});

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handle(req, res) {
	const url = new URL(req.url ?? '/', `http://localhost:${port}`);
	if (url.pathname !== '/docs-sso') {
		res.writeHead(404).end('not found');
		return;
	}
	const redirectUri = url.searchParams.get('redirect_uri');
	const state = url.searchParams.get('state');
	if (!redirectUri || !state) {
		res.writeHead(400).end('missing redirect_uri or state');
		return;
	}
	// `redirect_uri` is whatever the caller sent, so parsing it can throw. A real
	// SSO endpoint would check it against an allowlist; the point here is only
	// that a bad value is answered rather than raised — Playwright's readiness
	// probe for this server is a deliberately malformed request (see
	// `playwright.config.mjs`), and a throw would kill the server it is probing.
	let target;
	try {
		target = new URL(redirectUri);
	} catch {
		res.writeHead(400).end('redirect_uri is not an absolute URL');
		return;
	}
	const token = await new SignJWT({
		email: 'reader@acme.test',
		name: 'Test Reader',
		orgs: ['acme'],
		state,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject('user-1')
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(secret);
	target.searchParams.set('token', token);
	res.writeHead(302, { location: target.href }).end();
}

server.listen(port, () => console.log(`mock SSO listening on http://localhost:${port}/docs-sso`));
