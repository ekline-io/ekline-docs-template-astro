// @ts-check
import { defineConfig, envField } from 'astro/config';
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
	// /auth/**. Public pages stay prerendered and CDN-served either way.
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
			// All three are read at runtime (access: 'secret'), so the same build
			// works across environments and no secret is inlined into the bundle.
			// Unset means auth is not configured: /private/** fails closed (404).
			DOCS_SSO_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
			DOCS_SSO_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
			DOCS_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
		},
	},
	integrations: [
		sitemap(),
		starlight({
			title: 'My Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
			customCss: ['./src/styles/global.css'],
			components: {
				Head: './src/components/CustomHead.astro',
				Header: './src/components/CustomHeader.astro',
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
			sidebar: [
				{
					label: 'Get started',
					items: [
						{ label: 'Introduction', slug: 'get-started/introduction' },
						{ label: 'Quickstart', slug: 'get-started/quickstart' },
						{ label: 'Authentication', slug: 'get-started/authentication' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Example guide', slug: 'guides/example' },
						{ label: 'Send your first request', slug: 'guides/send-your-first-request' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'How it works', slug: 'concepts/how-it-works' },
						{ label: 'Glossary', slug: 'concepts/glossary' },
					],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				// Interactive API references, rendered by Scalar. Their routes live
				// in `src/pages/api/` rather than in a Starlight plugin — Scalar
				// renders each whole reference itself, so there are no per-operation
				// pages to autogenerate.
				//
				// Built from the OpenAPI documents (see the import at the top of this
				// file), so they need no maintenance when a document changes.
				...apiReferenceSidebar,
				{
					label: 'Changelog',
					slug: 'changelog',
				},
			],
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
