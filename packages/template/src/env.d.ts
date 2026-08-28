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

/**
 * The theme applier, defined by `src/components/ThemeProvider.astro` as an
 * inline script in <head> so it runs before first paint.
 *
 * `src/components/ThemeSelect.astro` calls it after storing a choice: the
 * select owns what the reader picked, the provider owns what the document
 * shows. Optional because a customer can override `ThemeProvider` back to
 * Starlight's, which defines `StarlightThemeProvider` instead.
 */
interface Window {
	EkTheme?: {
		/** Re-read the preference (or the pin) and write `html[data-theme]`. */
		apply(): void;
		/** `'light' | 'dark' | 'auto'` — what the site is honouring. */
		preference(): string;
		/** The `localStorage` key the preference is stored at. */
		storageKey: string;
		/** The pinned theme, or `null` when the reader chooses. */
		forced: string | null;
	};
}

declare module 'virtual:starlight/pagefind-config' {
	export const pagefindUserConfig: Partial<
		Extract<import('@astrojs/starlight/types').StarlightConfig['pagefind'], object>
	>;
}

declare namespace App {
	interface Locals {
		/**
		 * The signed-in reader, set by `src/middleware.ts` on authenticated
		 * requests under `/private/**`. Absent everywhere else — public pages
		 * are prerendered and identical for every visitor by design.
		 *
		 * Optional, and it has to stay that way: `Astro.locals` is typed for
		 * every route, and a required field would make `astro check` believe
		 * public pages have a session too.
		 *
		 * Not to be confused with Astro's own `context.session`, which the
		 * Node adapter enables automatically (it logs "Enabling sessions with
		 * filesystem storage" on every build). That is server-side key/value
		 * storage this template does not use; this is the JWT the SSO handoff
		 * produced. Two different things named "session" — read the type, not
		 * the name.
		 */
		session?: {
			sub: string;
			email: string | null;
			name: string | null;
			orgs: string[];
		};
	}
}
