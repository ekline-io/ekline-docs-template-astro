// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightLlmsTxt from 'starlight-llms-txt';
import tailwindcss from '@tailwindcss/vite';

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
				Footer: './src/components/CustomFooter.astro',
			},
			plugins: [
				starlightLlmsTxt({
					projectName: 'My Docs',
					description:
						'A documentation site built with Astro Starlight. Replace this description with a one-paragraph summary of your project.',
				}),
			],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'guides/example' },
					],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
			],
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
