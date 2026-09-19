# Potluck Docs rebrand — Implementation Plan

**Goal:** Rename the template product from "EkLine docs template" to **Potluck Docs**, and carry the brand through the mark, the favicon and the accent color in both `packages/template/` and `apps/docs/`.

**Architecture:** Six phases, each independently shippable and independently revertable. Phase 0 has already landed (the brand package is committed at `brand/`). Phases 1–5 are the rebrand. Phase 6 is the URL and repository work, deliberately deferred.

**Brand package:** [`brand/`](../../../brand) — marks, favicons, color tokens, and two derived files built for this repo (`brand/derived/`). Read [`brand/README.md`](../../../brand/README.md) first; it carries the usage rules, including the ones about what the coral may not be used for.

---

## Two decisions this plan is built on

**1. EkLine stays as the maintainer.** Potluck Docs is the product name; EkLine is the company that maintains it. The brand package says as much itself — its "Relationship to EkLine" section describes a child brand that sits *beside* the parent mark, not one that replaces it.

In practice: the site title, the logo, the favicon, the colors and all the prose become Potluck Docs. Three things do not change.

| Stays EkLine | Why |
| --- | --- |
| The footer credit, "Maintained by EkLine" | Attribution. `packages/template/CLAUDE.md` already rules that EkLine attribution belongs in attribution-shaped places, and this is the one. |
| `LICENSE` copyright, both copies | The legal holder did not change. |
| `@ekline/starlight-contextual-menu`, `@ekline/docs-site` | The first is a published npm package we do not control. The second is scope-consistent with it. |

**2. Typography does not change.** Both sites keep Inter and JetBrains Mono. The Instrument Sans / Newsreader tokens that shipped in the brand package have been removed from it (Phase 0), so nothing in the repo still proposes them. The rebrand is carried by color and the mark.

---

## Global constraints

- **The accent ramp is derived, not chosen.** `brand/derived/accent-ramp.css` puts `#FF5656` (the mark coral) exactly on `--color-accent-400` and `#D03025` (the text-safe coral) exactly on `--color-accent-600`. This is what makes it safe rather than merely pretty — see the next constraint.
- **Starlight draws every link from one of two stops.** Verified by reading the installed packages, not inferred:
  - `@astrojs/starlight-tailwind@5.0.0` (`tailwind.css` lines 66–82) maps `--sl-color-accent: var(--color-accent-600)` and `--sl-color-accent-high: var(--color-accent-200)`, in both themes.
  - `@astrojs/starlight@0.40.0` (`style/props.css` lines 40, 156) resolves `--sl-color-text-accent` to `--sl-color-accent` in **light** mode and to `--sl-color-accent-high` in **dark**.
  - So light-mode link text is `accent-600` and dark-mode link text is `accent-200`. Pinning `accent-600` to `#D03025` satisfies the brand rule "anything carrying words uses `#D03025`" by construction, and parks the 3.13:1 mark coral at `accent-400`, where no text can reach it.
- **One measured contrast regression, and it has a fix.** The template's own sidebar rule in `global.css` draws the current page as `--sl-color-text-accent` over a 12% tint of itself. Violet clears WCAG AA there at 4.75:1; coral lands at **4.23:1**, under the 4.5:1 minimum. The fix in `brand/derived/accent-ramp.css` moves that one rule to `accent-700` in light mode: **5.55:1**, with the pill's weight unchanged. Thinning the tint instead needs 7% to clear AA, which washes the pill out. Do not skip this override.
- **`npm run check:shipped` after any edit under `packages/template/*.md` or `packages/template/wiki/`.** It catches monorepo paths leaking into a customer's copy. It cannot see framing problems — "this is EkLine's template, which we ship to customers" is wrong in a customer's repo and passes the check — so Phase 4 stays a review question as well as a script run.
- **`brand/` is monorepo-only.** It must never be referenced from shipped prose or from `packages/template/` code. Files travel *into* the template by copy, the way `LICENSE` already does.
- Node 22.x. Every command runs from the repo root unless it says otherwise.

---

## Phase 0 — Land the brand package ✅ done

Committed in this PR.

- [x] `brand/` — the full package as delivered: `mark/`, `variants/`, `favicon/`, `color/`, `logo-sheet.html`, `README.md`.
- [x] Font tokens stripped from `brand/color/tokens.css` and `brand/color/tokens.json`, per decision 2.
- [x] `brand/derived/favicon.svg` — one theme-adaptive favicon. The rim stays coral; the well and bars swap under `prefers-color-scheme: dark`, which is the dark treatment the brand README describes. Replaces the two-file approach and matches the shape of the EkLine favicon it displaces, which also carried its own media query.
- [x] `brand/derived/accent-ramp.css` — the eleven stops plus the sidebar-pill override, with the measurements in a comment.
- [x] `brand/README.md` — appended the two decisions above and a table of what `derived/` is for.

---

## Phase 1 — The mark and the favicon

Visual, self-contained, and the phase that makes the rebrand visible.

**Files:**
- Add: `packages/template/src/assets/potluck-mark.svg`, `apps/docs/src/assets/potluck-mark.svg` (from `brand/mark/svg/potluck-mark-light.svg`)
- Modify: `packages/template/public/favicon.svg`, `apps/docs/public/favicon.svg`
- Modify: `packages/template/astro.config.mjs`, `apps/docs/astro.config.mjs`
- Keep untouched: `src/assets/ekline-mark.svg` in both projects, and both `CustomFooter.astro`

- [ ] **Step 1: Replace both favicons**

```bash
cp brand/derived/favicon.svg packages/template/public/favicon.svg
cp brand/derived/favicon.svg apps/docs/public/favicon.svg
```

Nothing else changes. Starlight defaults `favicon` to `/favicon.svg` when the key is unset, and it is unset in both configs, so the file name is load-bearing and must stay `favicon.svg`.

- [ ] **Step 2: Add the mark as a header logo**

Copy `brand/mark/svg/potluck-mark-light.svg` to `src/assets/potluck-mark.svg` in both projects, then add to the `starlight()` config in each:

```js
logo: {
  src: './src/assets/potluck-mark.svg',
  alt: 'Potluck Docs',
},
```

Use the `light` variant, not `light-bg`. The transparent one is the default per the brand README; the filled variants exist only for platforms that will not honor transparency.

Leave `replacesTitle` unset, so the mark sits next to the title text. The site title becomes "Potluck Docs" in Phase 3, and mark-plus-wordmark is the lockup the brand package assumes — it has no wordmark of its own, so the title text *is* the wordmark for now.

- [ ] **Step 3: Confirm the footer is untouched**

```bash
grep -c "Maintained by" packages/template/src/components/CustomFooter.astro apps/docs/src/components/CustomFooter.astro
```

Expected: `1` from each. Per decision 1 the credit stays EkLine. If a future change adds the Potluck mark beside it, `brand/variants/potluck-mark-all-coral-*.svg` is the file for that — it is single-ink specifically so it can sit next to the EkLine mark, which is also single-ink.

- [ ] **Step 4: Build both and look at them**

```bash
npm run template:build && npm run docs:build
```

---

## Phase 2 — Color

**Files:**
- Modify: `packages/template/src/styles/global.css`, `apps/docs/src/styles/global.css`

- [ ] **Step 1: Swap the accent ramp in both files**

In the `@theme` block, replace the eleven `--color-accent-*: var(--color-violet-*)` lines with the literal hex values from `brand/derived/accent-ramp.css`.

Literal hex, not `var(--color-red-*)`. Tailwind's red is not this coral, and an indirection through a Tailwind scale would silently redefine the brand the next time Tailwind retunes its palette.

Update the comment above the block. It currently explains the violet choice; it should now say the ramp is derived from the two brand corals, name which stop each lands on, and point at `brand/README.md` for the rule that `#FF5656` can never carry text.

- [ ] **Step 2: Add the sidebar-pill override**

Append the `:root[data-theme='light'] .sidebar-content a[aria-current='page']` rule from `brand/derived/accent-ramp.css`, next to the existing sidebar block rather than at the end of the file. Carry the measurement into the comment — the next person to see a one-stop-darker rule will otherwise read it as an accident and delete it.

- [ ] **Step 3: Leave the gray ramp alone**

The brand's ink (`#231F20`) and ground (`#F2F1F0`) are warm; Starlight's grays are cool slate. Swapping the gray ramp as well changes every surface on the site, not just the accent, and is a much larger visual diff than this phase is scoped for. Note it as a candidate follow-up and move on.

- [ ] **Step 4: Verify the measured numbers on the built site**

Build, open a page in light mode, and check with the browser's contrast inspector:
- a body link: expect ≥ 5.08:1
- the current sidebar item: expect ≥ 5.55:1, **not** 4.23:1 — 4.23 means Step 2 did not take

Repeat in dark mode; both should be comfortable (12.44:1 and 7.83:1 measured).

---

## Phase 3 — Names in code and config

Mechanical, but three of these have consequences worth knowing before you make them.

**Files:**
- Modify: both `astro.config.mjs`; both `package.json`; root `package.json`
- Modify: both `ThemeSelect.astro`; `packages/template/tests/visual/theme-control.spec.mjs`; `packages/template/tests/visual/api-reference.spec.mjs`
- Modify: both `ThemeProvider.astro`; both `env.d.ts`
- Modify: `packages/template/src/lib/auth/tokens.mjs`
- Modify: four files under `packages/template/src/content/`; `packages/template/tests/private-leaks.test.mjs`; `tests/visual/auth.spec.mjs`; `tests/visual/demo-login.spec.mjs`; `packages/template/wiki/private-docs.md`
- Modify: both `global.css` (the `--ek-*` variables)

- [ ] **Step 1: Site titles and llms-txt**

| File | From | To |
| --- | --- | --- |
| `packages/template/astro.config.mjs` | `title: 'My Docs'` | leave as is — it is a placeholder for the customer, not EkLine branding |
| `packages/template/astro.config.mjs` | `projectName: 'My Docs'` | leave as is, same reason |
| `apps/docs/astro.config.mjs` | `title: 'EkLine docs template'` | `'Potluck Docs'` |
| `apps/docs/astro.config.mjs` | `projectName: 'EkLine docs template'` | `'Potluck Docs'` |
| `apps/docs/astro.config.mjs` | the llms-txt `description` | rewrite naming Potluck Docs |
| `apps/docs/src/content/docs/index.mdx` | frontmatter `title` | `Potluck Docs` |

The template's own `'My Docs'` strings are the placeholder a customer replaces. Renaming them to "Potluck Docs" would ship our brand into their site, which `packages/template/CLAUDE.md` forbids directly.

- [ ] **Step 2: Package names**

| File | From | To |
| --- | --- | --- |
| `package.json` (root) | `ekline-docs-template-monorepo` | `potluck-docs-monorepo` |
| `packages/template/package.json` | `ekline-docs-template-astro` | `potluck-docs-template` |
| `apps/docs/package.json` | `@ekline/docs-site` | unchanged — see decision 1 |

Both renamed packages are private or never published (`packages/template` is fetched as a directory, never installed by name), so no registry entry moves. The lockfiles carry the old `"name"` at their root and will restate it on the next `npm install`; regenerate both rather than hand-editing:

```bash
npm --prefix packages/template install --package-lock-only
npm --prefix apps/docs install --package-lock-only
```

- [ ] **Step 3: The theme-select custom element**

`ekline-theme-select` → `potluck-theme-select`, and the class `EklineThemeSelect` → `PotluckThemeSelect`. Twenty-eight references: twenty-four across the two `ThemeSelect.astro` files, four in the visual specs.

```bash
grep -rn "ekline-theme-select\|EklineThemeSelect" --exclude-dir=node_modules .
```

Must reach zero. A custom element name is global and defined once, so a half-rename does not error — `customElements.define` simply registers a tag nothing uses, and the control silently stops working. Do all of them, then run the visual suite.

**Flag for the changelog:** this is a breaking change for anyone who has already forked the template and written CSS against the old tag name.

- [ ] **Step 4: The `--ek-*` CSS variables**

`--ek-` → `--pl-`, twelve distinct variables across both `global.css` files (`rail-min`, `toc-min`, `rail-items`, `rail-grow`, `rail-gap`, `track-padding`, `track-bg`, `segment`, `index`, `raised-bg`, `raised-border`, `hover-bg`). Purely cosmetic; a missed one falls back to nothing and collapses the layout, so verify:

```bash
grep -rn -- "--ek-" --exclude-dir=node_modules . | grep -v docs/superpowers
```

- [ ] **Step 5: The `EkTheme` JavaScript globals**

`window.EkTheme` → `window.PotluckTheme`, and the `define:vars` binding `ekForcedTheme` → `potluckForcedTheme`. Sixteen references across six files: both `ThemeProvider.astro`, both `ThemeSelect.astro`, and both `env.d.ts` (which declares `EkTheme?:` on `Window`).

Read the comment above the `define:vars` line before renaming it. The prefix is deliberate: `define:vars` becomes a `const` at global scope, which classic inline scripts share, so a generic name collides with any analytics or consent snippet a customer adds — and that parse error takes the theme script down with it, leaving the site unthemed. `potluckForcedTheme` is as distinctive as `ekForcedTheme`; a tidier-looking `forcedTheme` is not, and is the one rename to refuse here.

Miss the `env.d.ts` declaration and `npm run check` fails on `window.PotluckTheme` — which is the good outcome. Miss a `window.EkTheme?.apply()` call and the optional chain swallows it silently: the theme stops re-applying after a view transition, with no error.

- [ ] **Step 6: The session audience — read this before changing it**

`packages/template/src/lib/auth/tokens.mjs` sets `SESSION_AUDIENCE = 'ekline-docs-session'`. Its own doc comment says the value is arbitrary, so `'potluck-docs-session'` is safe by design.

**It is not free.** The string is an audience claim inside the signed session cookie, and `jwtVerify` rejects a cookie whose audience does not match. Changing it logs out every reader with a live session on any deployment that carries private docs — once, at deploy. That is acceptable for the template's own demo site. Anyone running a real site from this template should be told, which means it belongs in `packages/template/CHANGELOG.md`, not just in a commit.

- [ ] **Step 7: The private-docs leak sentinel**

`EKLINE-PRIVATE-SENTINEL-DO-NOT-LEAK` → `POTLUCK-PRIVATE-SENTINEL-DO-NOT-LEAK`, across eight files:

```bash
grep -rln "EKLINE-PRIVATE-SENTINEL" --exclude-dir=node_modules packages/
```

Four content files, one wiki page, and three test files. The two visual specs match on the shorter `EKLINE-PRIVATE-SENTINEL` prefix, so they change too.

These must move together. `private-leaks.test.mjs` asserts the sentinel is *present* in the source before it searches the build output for a leak — rename the tests without the content and the first assertion fails; rename the content without the tests and the leak search silently looks for a string that no longer exists, which is a passing test that checks nothing. The second is the dangerous one.

- [ ] **Step 8: Run everything**

```bash
npm run check && npm test
cd packages/template && npm run test:visual
```

---

## Phase 4 — Prose

The largest file count, the lowest risk, and the one place the shipped/hosted distinction bites.

**Files:**
- Modify: root `README.md`, root `CLAUDE.md`
- Modify: `packages/template/README.md` (33 references), `packages/template/CLAUDE.md`, `packages/template/CHANGELOG.md`
- Modify: `apps/docs/README.md`, and the content under `apps/docs/src/content/docs/`
- Modify: `packages/template/wiki/` (3 files)

- [ ] **Step 1: The two shipped files first, most carefully**

`packages/template/README.md` and `packages/template/CLAUDE.md` are copied verbatim into every customer's repository. Two rules from the root `CLAUDE.md` apply and neither is enforced by a script:

- Write in the customer's second person. `packages/template/CLAUDE.md` line 7 currently reads "generated from EkLine's Starlight (Astro) template" — that becomes "generated from the Potluck Docs template", and must not become "this is our template, which we ship to customers", which is false in their repo.
- Never name a monorepo path. `brand/` is now one of those paths. Do not cite it in either file.

`packages/template/README.md` line 1 (`# EkLine docs template`) and line 205 (`Maintained by [EkLine](https://ekline.io).`) pull in opposite directions and both are correct: the title is the product, the footer is the maintainer.

- [ ] **Step 2: The hosted docs**

`apps/docs/src/content/docs/` — 17 pages. `branding.md` needs the most attention: it documents where colors and the logo live, and Phase 2 has just changed both. Its worked example should use the new coral ramp.

- [ ] **Step 3: The wiki**

`packages/template/wiki/` renders in place as the hosted docs' Internals section, so those three files have one copy and two readers. `private-docs.md` carries the sentinel rename from Phase 3 Step 7.

- [ ] **Step 4: Root README and CLAUDE.md**

Both describe the repo from the maintainer's side, so the framing constraint does not apply. Add `brand/` to the layout table in `CLAUDE.md`, next to `.github/` and `.claude/`, and state that it is monorepo-only and travels into the template by copy.

- [ ] **Step 5: Changelog**

One `packages/template/CHANGELOG.md` entry covering the rename, the new accent palette, and the breaking changes from Phase 3 (the custom element tag, the `EkTheme` globals, the session audience).

- [ ] **Step 6:**

```bash
npm run check:shipped
```

Then re-read the two shipped files as if you had just run `npm create astro` and received them. The script cannot do this part.

---

## Phase 5 — Baselines and CI

- [ ] **Step 1: Refresh the visual baseline**

One baseline exists: `packages/template/tests/visual/__screenshots__/darwin/sidebar-operations.png`. It captures the API-reference sidebar, where the method badges and the active-item pill both carry accent color, so Phase 2 invalidates it.

```bash
cd packages/template && npm run test:visual:update
```

The committed baseline is `darwin` only, and CI runs Linux. Check how `playwright.config.mjs` and the CI job handle the platform split before assuming a macOS regeneration is enough — `packages/template/README.md` line 184 claims baselines ship for both.

- [ ] **Step 2: Leave the CI deployment matcher alone**

`.github/workflows/ci.yml` lines 280–284 match on Vercel *environment names* — `*documentation-ekline-docs-template*` and `*ekline-docs-template-astro*`. Those are the live project slugs. They change in Phase 6 and not before; editing them now breaks the deployment smoke test on the next deploy.

- [ ] **Step 3: `.claude/settings.json`**

`WebFetch(domain:ekline.io)` stays. EkLine remains the maintainer and the footer still links there.

---

## Phase 6 — URLs, repository, deployments (deferred)

Explicitly out of scope for now. Recorded so the deferral is a decision rather than an oversight.

Each item below changes a published address, and the first one changes the command every prospective user runs.

| What | Where it appears | What breaks |
| --- | --- | --- |
| The adoption command's path | root `README.md`, `packages/template/README.md` ×2, `apps/docs` quickstart | `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template` is published. A repo rename leaves a GitHub redirect for the web UI, but verify `create-astro` follows it before relying on that. |
| The GitHub repo URL | both `astro.config.mjs` social links, `apps/docs/src/loaders/wiki.mjs` (`REPO_BLOB`), `packages/template/README.md`, `apps/docs/tests/wiki-collection.test.mjs` | `wiki-collection.test.mjs` line 174 asserts on the URL with a regex, so it fails loudly — which is the right behavior. |
| `documentation-ekline-docs-template.vercel.app` | ~20 links across `packages/template/README.md`, `packages/template/CLAUDE.md`, `apps/docs/` | Every "see the hosted docs" link. Renaming the Vercel project changes the domain. |
| `ekline-docs-template-astro.vercel.app` | the live-preview links | Same. |
| The two Vercel project slugs | `.github/workflows/ci.yml` lines 280–284 | The deployment smoke test picks which project's assertions to run by matching the environment name. Rename the projects and this job hits its `*)` branch and fails — deliberately, per the comment above it. Update in the same change. |
| `@ekline/docs-site` | `apps/docs/package.json` | Only if decision 1 is revisited. |

**Sequence when you do it:** rename the GitHub repo first and confirm `create-astro` follows the redirect; then the Vercel projects together with the CI matcher in one commit; then the prose links last, when the new domains are live. Doing prose first leaves the docs pointing at 404s for the length of the migration.

---

## What this plan does not do

- **Does not change the gray ramp.** The brand's warm ink and ground against Starlight's cool slate is a real mismatch and a much larger diff. Follow-up.
- **Does not add a wordmark.** The brand package has no type treatment, by its own statement. The site title is the wordmark until one exists.
- **Does not touch `docs/superpowers/`.** Those are dated historical records of how this repo was built. They say EkLine because that was true when they were written; rewriting history to match a later rename makes them less accurate, not more.
- **Does not rename `@ekline/starlight-contextual-menu`.** A published package on someone else's registry entry.
