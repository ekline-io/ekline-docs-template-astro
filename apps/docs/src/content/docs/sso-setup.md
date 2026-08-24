---
title: Setting it up
description: The three environment variables and the one endpoint your product implements — with a working sample.
---

## Configure the site

Set three environment variables (full list, and what leaving one unset
does, on [Environment variables](/environment-variables/)):

```
DOCS_SSO_URL=https://your-product.example.com/docs-sso
DOCS_SSO_SECRET=<shared with your product>
DOCS_SESSION_SECRET=<shared with nobody>
```

Leave any of the three unset and the logged-in tier turns itself off: the
**Log in** control disappears and `/private/**` answers a plain 404.

If you're self-hosting on `@astrojs/node` rather than Vercel, also set
`security.allowedDomains` — see [Deploy](/deploy/). Without it the SSO
round trip never completes on that target.

## Implement the endpoint

Your product signs a short-lived JWT and redirects back. In Express, with
[`jose`](https://github.com/panva/jose):

```js
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.DOCS_SSO_SECRET);

// requireYourProductLogin is your own auth middleware — see "If the reader
// isn't signed in yet" below for why it's doing more work than it looks.
app.get('/docs-sso', requireYourProductLogin, async (req, res) => {
	const token = await new SignJWT({
		email: req.user.email,
		name: req.user.name,
		orgs: [req.user.orgSlug], // must match the slugified folder names under src/content/org-docs/
		state: req.query.state,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(req.user.id)
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(secret);

	// Redirect to the redirect_uri you were given, not a hardcoded URL.
	const target = new URL(req.query.redirect_uri);
	target.searchParams.set('token', token);
	res.redirect(target.href);
});
```

Five things about it are load-bearing:

- **Honor `redirect_uri`.** It's the docs site telling you where its
  callback lives, and it moves with the deployment. Check it against an
  allowlist of your own docs domains before redirecting — a hardcoded
  callback works right up until it doesn't.
- **Echo `state` back unchanged.** It binds the token to the browser that
  started the sign-in; the callback rejects a token whose `state` doesn't
  match.
- **Sign with HS256, explicitly.** The callback pins the algorithm, so a
  library that picks one for you will fail here — some choose HS512 from a
  512-bit key, and the token is then rejected. In `jose` that is
  `.setProtectedHeader({ alg: 'HS256' })`.
- **Always set `sub`.** A token without a non-empty `sub` is rejected. It is
  your product's user id, and it becomes the session's identity.
- **Keep `exp` short.** The token travels in a URL, so five minutes, as
  above, is the mitigation. Nothing in the template caps it — that would
  mean overruling your own token policy.

`tests/mock-sso/server.mjs` in the template is a working reference
implementation of this same endpoint, and doubles as a local dev login:
copy `.env.example` to `.env`, run `npm run dev:sso` in one terminal and
`npm run dev` in another.

## If the reader isn't signed in yet

Most readers arrive already signed in — they clicked a link from inside
your product, so their session cookie comes with them and the whole round
trip is invisible. When they haven't, `requireYourProductLogin` sends them
to your ordinary login page. The docs site has no part in that: no form, no
password field, nothing to configure here.

The one thing that has to work is the trip back: **your login flow must
return the reader to the full original URL, `redirect_uri` and `state`
intact.** Most login systems do this by default. If yours doesn't, the
reader signs in successfully and lands somewhere else entirely — nothing
errors, and nothing shows up in this site's logs, so from the outside it
just looks like "sign-in doesn't work."

Test this deliberately: open the site in a private window with no product
session, click a private link, and confirm you land back on the page you
asked for.

Next: [try it before your endpoint exists](/demo-login/).
