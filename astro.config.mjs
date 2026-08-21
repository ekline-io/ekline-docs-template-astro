// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightContextualMenu from '@ekline/starlight-contextual-menu';
import starlightLlmsTxt from 'starlight-llms-txt';
import tailwindcss from '@tailwindcss/vite';
import { openApiSidebarGroup } from './src/lib/openapi-sidebar.mjs';
import {
	enabledReferences,
	listsOperationsInSidebar,
	routeFor,
} from './src/config/api-reference.mjs';
import { docsSidebarGroups, changelogEntry, privateDocsLink } from './src/config/sidebar.mjs';

// Is signing in configured for this deployment?
//
// `loadEnv`, not `process.env`. Astro does not load `.env` files into
// `process.env` by the time this file runs, so reading it directly reports
// "unconfigured" during local development — the one place sign-in is easiest to
// try. `loadEnv` reads the `.env` files *and* the real environment, so it is
// right in all three cases: nothing configured, a local `.env`, and variables
// exported by Vercel or CI. Measured, after `process.env` got it wrong.
//
// A presence check only. `authConfigured()` in `src/config/auth.mjs` is the
// authoritative version — it also parses the URL and checks the scheme — but it
// imports `astro:env/server`, which this file cannot. The components use that
// one. The two can only disagree on a deployment that is misconfigured rather
// than unconfigured, and both fail towards hiding the affordance.
const { DOCS_SSO_URL, DOCS_SSO_SECRET, DOCS_SESSION_SECRET } = loadEnv(
	process.env.NODE_ENV ?? 'production',
	process.cwd(),
	''
);
const ssoConfigured = Boolean(DOCS_SSO_URL && DOCS_SSO_SECRET && DOCS_SESSION_SECRET);

// One sidebar entry per API reference, generated from its OpenAPI document.
// Regenerated on every build, so swapping in your own document updates the
// sidebar with nothing to change here.
//
// Which references exist, what they are called and which layout each uses lives
// in `src/config/api-reference.mjs`. Edit that, not this. See
// `wiki/api-reference.md`.
//
// A `docs`-layout reference gets a group listing every operation, because its
// route keeps Starlight's sidebar on screen. A `full`-layout one gets a plain
// link: Scalar's own sidebar lists the operations there, and repeating them in
// Starlight's would be two navigation trees for one document.
const apiReferenceSidebar = await Promise.all(
	enabledReferences.map((reference) =>
		listsOperationsInSidebar(reference)
			? openApiSidebarGroup({
					spec: reference.spec,
					base: routeFor(reference),
					label: reference.label,
				})
			: { label: reference.label, link: routeFor(reference) }
	)
);

// https://astro.build/config
export default defineConfig({
	// TODO: replace with your deployed site URL. Required for sitemap and llms-txt
	// to emit absolute URLs.
	site: 'https://example.com',
	// The logged-in experience needs a server runtime for /private/** and
	// /auth/**. Public pages stay prerendered either way (CDN-served on Vercel;
	// served from disk by the standalone Node server otherwise).
	//
	// Vercel builds set VERCEL=1 and need the Vercel adapter; everywhere else
	// (local dev, `npm test`, `npm run preview`, self-hosting) uses the Node
	// adapter — the Vercel adapter does not support `astro preview`, and both
	// test suites run against the build output. See wiki/private-docs.md.
	//
	// `@astrojs/node` is held at an exact `10.1.1` in package.json rather than a
	// `^` range, and that is load-bearing. 10.1.2 moved to an `astro/app/node`
	// export (`createRequestFromNodeRequest`) that Astro only ships from 6.4 on,
	// but kept declaring a peer of `astro: ^6.3.0` — so npm resolves 10.1.4
	// against this project's Astro 6.3.1 with no peer warning at all, and the
	// build then dies deep in Rollup on a missing export. Raise the adapter and
	// Astro together, or neither.
	adapter: process.env.VERCEL ? vercel() : node({ mode: 'standalone' }),
	env: {
		schema: {
			// Every entry here is read at runtime (access: 'secret'), so the same
			// build works across environments and no secret is inlined into the
			// bundle. Unset means auth is not configured: /private/** fails
			// closed (404).
			DOCS_SSO_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
			DOCS_SSO_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
			DOCS_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
			// Turns /demo-login into a working sign-in that accepts ANYONE. For the
			// template's own demo deployment and for staging sites evaluating the
			// feature — never for a site with real private content. The name is the
			// warning; the attack it abbreviates is in wiki/private-docs.md.
			//
			// `string`, not `boolean`, and that is load-bearing in both directions.
			// Only `1` and `true` count (`isDemoFlagEnabled` in
			// `src/lib/demo-login.mjs`), so `TRUE`, `yes` and `on` stay off rather
			// than being helpfully coerced on. Astro's boolean field would make
			// this worse, not simpler: it accepts only `true`/`false`, so the `1`
			// the deploy config uses becomes an *invalid* value and throws
			// `EnvInvalidVariables` at `astro:env/server` module init — and a
			// literal `true` would arrive as a boolean, which `isDemoFlagEnabled`
			// rejects, taking the demo silently dark with the flag set.
			DOCS_UNSAFE_DEMO_LOGIN: envField.string({ context: 'server', access: 'secret', optional: true }),
		},
	},
	integrations: [
		// Sitemaps advertise URLs to crawlers, and nothing under /private/ should
		// be advertised: reaching it needs a session, so a crawler can only ever
		// collect a redirect, and the URL itself names an org.
		//
		// This is not belt-and-braces. `@astrojs/sitemap` never consults
		// `isPrerendered` — its only filters are `type !== 'page'` and a defined
		// `pathname`, and `pathname` is undefined for `[dynamic]` and `[...spread]`
		// routes. So an on-demand route is listed like any other unless it happens
		// to be dynamic. Every route this template puts under /private/ is a spread
		// route, which is why nothing leaked before this line existed; adding one
		// plain `src/pages/private/welcome.astro` would publish it. Measured twice
		// on real builds, not inferred. See wiki/private-docs.md.
		sitemap({ filter: (page) => !page.includes('/private/') }),
		starlight({
			title: 'My Docs',
			// TODO: point this at your own repository. It ships aimed at the
			// template so the live preview links somewhere useful — it was the
			// Starlight starter's own repo until now, which is not what a reader
			// of your docs is looking for.
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/ekline-io/ekline-docs-template-astro',
				},
			],
			customCss: ['./src/styles/global.css'],
			components: {
				Head: './src/components/CustomHead.astro',
				Header: './src/components/CustomHeader.astro',
				// The header's right-hand cluster is hidden below `md`, so the Log in /
				// Log out control has to be repeated here or phones get no way to sign
				// in — the same reason Starlight repeats theme and language controls.
				MobileMenuFooter: './src/components/CustomMobileMenuFooter.astro',
				Hero: './src/components/CustomHero.astro',
				Footer: './src/components/CustomFooter.astro',
				// Re-init Pagefind after every Astro view-transition swap — the
				// upstream component only initializes on `DOMContentLoaded`,
				// which doesn't fire on subsequent <ClientRouter /> navigations.
				Search: './src/components/CustomSearch.astro',
			},
			plugins: [
				// Adds a "Copy / View / Open in Claude / Open in ChatGPT" dropdown to
				// each page heading. `injectMarkdownRoutes: true` generates a `.md`
				// route per page so the View / Claude / ChatGPT actions can deep-link
				// to raw markdown.
				starlightContextualMenu({
					actions: ['copy', 'view', 'claude', 'chatgpt'],
					injectMarkdownRoutes: true,
				}),
				starlightLlmsTxt({
					projectName: 'My Docs',
					description:
						'A documentation site built with Astro Starlight. Replace this description with a one-paragraph summary of your project.',
				}),
			],
			// The nav groups, the changelog entry and the login link are declared in
			// `src/config/sidebar.mjs`. Edit that, not this — the sidebar shown on
			// logged-in pages is assembled from the same exports.
			sidebar: [
				...docsSidebarGroups,
				// Interactive API references, rendered by Scalar. Their routes live
				// in `src/pages/api/` rather than in a Starlight plugin — Scalar
				// renders each whole reference itself, so there are no per-operation
				// pages to autogenerate.
				//
				// Built from the OpenAPI documents (see the import at the top of this
				// file), so they need no maintenance when a document changes.
				...apiReferenceSidebar,
				changelogEntry,
				// Hidden by CSS until the reader signs in, and absent from the
				// build entirely when this deployment has no SSO configured, so
				// nobody is offered a section that can only answer 404. The
				// Log in / Log out control itself lives in the header.
				...(ssoConfigured ? [privateDocsLink] : []),
			],
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
