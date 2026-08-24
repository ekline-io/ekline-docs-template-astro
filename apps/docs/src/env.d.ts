/**
 * Types for the Starlight virtual modules this template imports.
 *
 * `CustomHeader.astro` and `CustomSearch.astro` import from
 * `virtual:starlight/*`. That is deliberate, not a shortcut: resolving the
 * children through Starlight's virtual modules means any *other* component
 * override a customer configures in `astro.config.mjs` is still honoured. A
 * direct `@astrojs/starlight/components/Search.astro` import would hard-wire
 * the stock component and silently ignore their override.
 *
 * Starlight ships declarations for these, but in `virtual-internal.d.ts`, which
 * its `exports` map does not expose — so a consumer cannot reference it and
 * `astro check` reports every one of these imports as a missing module. The
 * declarations below mirror upstream's, pointing at the public `./components/*`
 * export instead of Starlight's internal relative paths.
 *
 * Only the modules this template actually imports are declared. If you override
 * another Starlight component and import its virtual module, add it here in the
 * same shape. Upstream reference:
 *   node_modules/@astrojs/starlight/virtual-internal.d.ts
 */

declare module 'virtual:starlight/components/LanguageSelect' {
	const LanguageSelect: typeof import('@astrojs/starlight/components/LanguageSelect.astro').default;
	export default LanguageSelect;
}

declare module 'virtual:starlight/components/Search' {
	const Search: typeof import('@astrojs/starlight/components/Search.astro').default;
	export default Search;
}

declare module 'virtual:starlight/components/SiteTitle' {
	const SiteTitle: typeof import('@astrojs/starlight/components/SiteTitle.astro').default;
	export default SiteTitle;
}

declare module 'virtual:starlight/components/SocialIcons' {
	const SocialIcons: typeof import('@astrojs/starlight/components/SocialIcons.astro').default;
	export default SocialIcons;
}

declare module 'virtual:starlight/components/ThemeSelect' {
	const ThemeSelect: typeof import('@astrojs/starlight/components/ThemeSelect.astro').default;
	export default ThemeSelect;
}

declare module 'virtual:starlight/pagefind-config' {
	export const pagefindUserConfig: Partial<
		Extract<import('@astrojs/starlight/types').StarlightConfig['pagefind'], object>
	>;
}
