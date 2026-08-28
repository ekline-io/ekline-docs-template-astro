/**
 * The theme control — the one file to edit.
 *
 * Two settings: what the reader gets to click, and — when they get nothing —
 * which theme the site is pinned to.
 *
 * ## The three controls
 *
 * **`'menu'`** — the default — is a single icon and a caret, with the three
 * choices stacked in a popover on click. About 28px of header width, and the
 * popover is ours to theme rather than an OS-drawn dropdown.
 *
 * **`'segmented'`** shows all three choices at once instead, as a pill with a
 * sliding thumb: one click to any theme and the current one legible without
 * opening anything. It costs about 92px of header width, which is the whole
 * trade-off — take it when the header has room and the extra click is worth
 * saving.
 *
 * **`'none'`** renders no control anywhere and pins the site to `pinnedTheme`.
 * The header, the mobile menu and the keyboard all lose the affordance
 * together; there is no hidden way back in.
 *
 * ## Pinning is a hard pin
 *
 * With `'none'`, `pinnedTheme` wins over anything a reader stored earlier. A
 * reader who chose Dark on a site that later pins Light gets Light — the stored
 * value is ignored rather than cleared, so flipping the config back restores
 * their choice. Everyone sees the same site, which is the point of pinning.
 *
 * `pinnedTheme: 'auto'` pins the site to *the reader's operating system*, not
 * to a fixed colour: it still switches when they switch, and still has no
 * control. That is the honest choice for a site that just does not want to
 * carry a theme switcher.
 *
 * `pinnedTheme` is ignored unless `themeControl` is `'none'`. It is not a
 * "default for first-time readers" — with a control on screen, that default is
 * the reader's own system preference, which is what `auto` means and what they
 * already told their browser.
 *
 * See `src/components/ThemeSelect.astro` for the control and
 * `src/components/ThemeProvider.astro` for how the theme is applied before
 * first paint.
 */

/** @typedef {'segmented' | 'menu' | 'none'} ThemeControl */
/** @typedef {'light' | 'dark' | 'auto'} Theme */

/** @type {ThemeControl} */
export const themeControl = 'menu';

/** @type {Theme} — only read when `themeControl` is `'none'`. */
export const pinnedTheme = 'auto';

/* Validated here, at module load, so a typo fails the build with a sentence
 * that names the file and the legal values.
 *
 * Deliberately unlike `src/config/auth.mjs`, which goes out of its way *not* to
 * throw. That one reads deployment environment variables on the request path,
 * where a throw is a 500 with a stack trace in place of a documented 404. This
 * one reads a literal a developer just typed, on a path that runs at build
 * time. Failing loudly is the fast feedback; falling back to a default would
 * ship a site whose theme control silently is not the one that was asked for. */
const CONTROLS = ['segmented', 'menu', 'none'];
const THEMES = ['light', 'dark', 'auto'];

if (!CONTROLS.includes(themeControl)) {
	throw new Error(
		`src/config/theme.mjs: themeControl is ${JSON.stringify(themeControl)}, ` +
			`but must be one of ${CONTROLS.map((value) => `'${value}'`).join(', ')}.`
	);
}

if (!THEMES.includes(pinnedTheme)) {
	throw new Error(
		`src/config/theme.mjs: pinnedTheme is ${JSON.stringify(pinnedTheme)}, ` +
			`but must be one of ${THEMES.map((value) => `'${value}'`).join(', ')}.`
	);
}

/**
 * The theme forced on every reader, or `null` when readers choose for
 * themselves.
 *
 * One derived value rather than two checks at every call site: "is the control
 * hidden" and "which theme is pinned" are the same question, and answering it
 * in one place is what stops a component rendering a control while the provider
 * ignores it.
 */
export const forcedTheme = themeControl === 'none' ? pinnedTheme : null;
