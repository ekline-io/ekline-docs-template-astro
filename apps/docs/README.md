# EkLine docs template — documentation site

The source of the hosted documentation for
[`packages/template/`](../../packages/template): how to configure the template,
what every setting does, and how the pieces fit together.

This is not the template. If you are here to build a docs site, run:

```bash
npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template
```

## Running it

```bash
npm ci
npm run dev     # http://localhost:4321
npm run build   # static output in dist/
```

## How it relates to the template

It is the template with the two optional features removed — the logged-in
experience and the Scalar API reference — because this site is public docs and
hosts no API of its own. It was created by following the template's own
*"Don't need private docs?"* instructions, which is also how those instructions
get tested.

That makes this site a customer of the template, deliberately. Anything it
needs and cannot express through the template's own configuration surface is a
gap customers will hit too.

One thing it does that a customer's site would not: the **Internals** section
renders `packages/template/wiki/` from outside this app's root, so those files
have exactly one copy — the one that sits beside the code it describes. See
`src/loaders/wiki.mjs`.

## Deployment

Its own Vercel project (`documentation-ekline-docs-template`), Root Directory
`apps/docs`. No environment variables — `site` is hardcoded in
`astro.config.mjs`, unlike the template's, which is an env var because one
build serves many customers' environments. Here it is one domain we own, so
keeping it in the repo means it is reviewed and cannot be forgotten at deploy
time.
