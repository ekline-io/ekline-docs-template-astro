// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightContextualMenu from '@ekline/starlight-contextual-menu';
import starlightLlmsTxt from 'starlight-llms-txt';
import tailwindcss from '@tailwindcss/vite';
import { openApiSidebarGroup } from './src/lib/openapi-sidebar.mjs';
import { apiReference, defaultView, routeFor } from './src/config/api-reference.mjs';

// Every operation in the OpenAPI document, as Starlight sidebar links pointing
// into the rendered reference. Regenerated on every build, so swapping in your
// own document updates the sidebar with nothing to change here.
//
// Everything about the reference — the document, which views are built, what
// they are called — lives in `src/config/api-reference.mjs`. Edit that, not
// this. See `wiki/api-reference.md`.
const apiReferenceSidebar = await openApiSidebarGroup({
	spec: apiReference.spec,
	// The default view: the one served at `/api/`, and the only one guaranteed
	// to exist whatever a customer has enabled.
	base: routeFor(defaultView),
	label: apiReference.sidebarLabel,
	badges: apiReference.sidebarBadges,
});

// https://astro.build/config
export default defineConfig({
	// TODO: replace with your deployed site URL. Required for sitemap and llms-txt
	// to emit absolute URLs.
	site: 'https://example.com',
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
				// Interactive API reference, rendered by Scalar from
				// `public/openapi.yaml`. The routes live in `src/pages/api/` rather
				// than in a Starlight plugin — Scalar renders the whole reference
				// itself, so there are no per-operation pages to autogenerate.
				//
				// The group below is generated from the spec (see the import at the
				// top of this file), so it lists every operation grouped by tag and
				// needs no maintenance when the document changes. Readers switch
				// between views from the control on the page itself, so the other
				// views are deliberately not repeated here.
				apiReferenceSidebar,
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
