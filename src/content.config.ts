import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	// The logged-in experience. Kept OUTSIDE `docs` on purpose: Starlight never
	// prerenders these, so Pagefind, llms.txt, the sitemap and the `.md` routes
	// cannot leak them structurally. Rendered by src/pages/private/. Uses
	// docsSchema() so frontmatter is identical to public docs.
	privateDocs: defineCollection({
		// `orgs/` is reserved: /private/orgs/** is the org-docs URL space, so a
		// same-named folder here would be unreachable. Content placed there is
		// dropped from this collection rather than shadowing a real org route.
		loader: glob({ pattern: ['**/[^_]*.{md,mdx}', '!orgs/**'], base: './src/content/private-docs' }),
		schema: docsSchema(),
	}),
	// One folder per org; folder name = org slug in the SSO token's `orgs` claim.
	orgDocs: defineCollection({
		loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/org-docs' }),
		schema: docsSchema(),
	}),
};
