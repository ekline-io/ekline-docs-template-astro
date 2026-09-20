# Potluck Docs rebrand — Implementation Plan

**Goal:** Brand the hosted documentation site as **Potluck Docs** — mark, favicon, coral accent, naming — and rename the product in prose. The template a customer receives keeps its own neutral appearance.

**Scope, decided after the first draft of this plan:** the rebrand applies to `apps/docs/` (what EkLine hosts). `packages/template/` (what EkLine ships) changes in **prose only** — its README and CLAUDE.md name the product, nothing else moves. See [Why the template is out of scope](#why-the-template-is-out-of-scope).

**The repository itself is renamed in a separate, later task.** Phase 5 is its inventory.

**Brand package:** [`brand/`](../../../brand) — marks, favicons, color tokens, and two derived files built for this repo (`brand/derived/`). Read [`brand/README.md`](../../../brand/README.md) first; it carries the usage rules, including what the coral may not be used for.

---

## Why the template is out of scope

`packages/template/` is copied verbatim into a customer's repository. Putting the Potluck mark, the coral palette or the Potluck favicon in there would ship EkLine's brand into every customer's docs site as their default — which is the thing `packages/template/CLAUDE.md` already forbids for EkLine's own branding:

> EkLine attribution belongs in attribution-shaped places — the footer credit, the LICENSE — and nowhere else. Product-specific EkLine copy or assets do not belong in a customer's docs site.

The same rule applies to Potluck. So the template keeps the neutral placeholders it ships today: the `My Docs` title, the violet accent ramp, its existing favicon, and the "Maintained by EkLine" footer credit. A customer replaces those with their own brand, which is the template's whole point.

The one exception is prose. The template's README and CLAUDE.md tell a customer what they have just adopted, and "the EkLine docs template" stops being its name. Those two files get the new name and nothing else.

**What this removes from the original plan**, all of it template-side and all of it risky:

| Dropped | Why it mattered |
| --- | --- |
| Renaming `SESSION_AUDIENCE` | Would have logged out every reader with a live session, once, at deploy. |
| Renaming the `EKLINE-PRIVATE-SENTINEL` leak sentinel | Had to move across four content files and three test files in lockstep, or the leak test silently checks nothing. |
| Renaming the `ekline-theme-select` custom element | Breaking for anyone who had already forked and written CSS against the tag. |
| Renaming `--ek-*` CSS variables and the `EkTheme` globals | Churn across six files for no reader-visible gain. |
| Regenerating the Playwright screenshot baseline | `tests/visual/` is template-side and now untouched, so `sidebar-operations.png` stays valid on both platforms. This was also the one item the earlier verification run could not confirm. |
| Renaming the three `package.json` names | Not dropped — **moved to Phase 5**. They carry the repository's name, so they should move when it does, in one change rather than two. |

---

## Global constraints

- **The accent ramp is derived, not chosen.** `brand/derived/accent-ramp.css` puts `#FF5656` (the mark coral) exactly on `--color-accent-400` and `#D03025` (the text-safe coral) exactly on `--color-accent-600`.
- **Starlight draws every link from one of two stops.** Read from the installed packages, not inferred:
  - `@astrojs/starlight-tailwind@5.0.0` (`tailwind.css` lines 66–82) maps `--sl-color-accent: var(--color-accent-600)` and `--sl-color-accent-high: var(--color-accent-200)`, in both themes.
  - `@astrojs/starlight@0.40.0` (`style/props.css` lines 40, 156) resolves `--sl-color-text-accent` to `--sl-color-accent` in **light** mode and to `--sl-color-accent-high` in **dark**.
  - So light-mode link text is `accent-600` and dark-mode link text is `accent-200`. Pinning `accent-600` to `#D03025` satisfies the brand rule "anything carrying words uses `#D03025`" by construction, and parks the 3.13:1 mark coral at `accent-400`, where no text can reach it.
- **One measured contrast regression, and it has a fix.** `apps/docs/src/styles/global.css` draws the current sidebar item as `--sl-color-text-accent` over a 12% tint of itself. Violet measures 4.83:1 there; coral lands at **4.23:1**, under the 4.5:1 minimum. The `accent-700` override in `brand/derived/accent-ramp.css` measures **5.55:1** and keeps the pill's weight. Thinning the tint instead needs 7% to clear AA, which washes the pill out. Do not skip it.
- **The two `global.css` files now diverge.** They were near-identical, and `apps/docs` is built with the template, so the temptation to keep them in sync is real. After Phase 2 the accent block and the pill override are deliberately different. A future sync must not copy the accent block in either direction.
- **`brand/` is monorepo-only.** Never referenced from shipped prose or from `packages/template/` code.
- **`npm run check:shipped`** after any edit under `packages/template/*.md`. It cannot see framing problems, only paths, so Phase 4 stays a review question too.
- Node 22.x. Commands run from the repo root unless stated.

---

## Phase 0 — Land the brand package ✅ done

- [x] `brand/` — the package as delivered, plus `derived/favicon.svg` (one theme-adaptive file: coral rim fixed, well and bars swap on `prefers-color-scheme`) and `derived/accent-ramp.css` (eleven stops plus the pill override, measurements in a comment).
- [x] Font tokens stripped from `brand/color/tokens.*` — both sites keep Inter and JetBrains Mono.
- [x] `brand/preview/` — screenshots from the verification run below.

---

## Verification

Phases 1–3 were applied to a working copy, `apps/docs` built, contrast measured in Chromium, and the result screenshotted; the code was then reverted. The screenshots are in [`brand/preview/`](../../../brand/preview) and the numbers below come from that run.

| | measured | |
| --- | --- | --- |
| light, body link | 5.08:1 | pass |
| light, current sidebar item *(with the `accent-700` override)* | 5.55:1 | pass |
| dark, body link | 12.50:1 | pass |
| dark, current sidebar item | 7.65:1 | pass |

Also established: both logo files are served correctly per theme (`data-theme="light"` serves `potluck-mark-light.svg`, `dark` serves the dark one); the favicon's media query fires and the mark stays legible at 16px; and `packages/template` is untouched — still the violet ramp, still its own favicon, `git status` clean under `packages/`.

Two things worth carrying forward:

- **Read colors through a canvas** (`fillStyle` + `getImageData`), not by parsing `getComputedStyle().backgroundColor` as text. Tailwind v4 emits `oklch()` and `color-mix()`, whose computed values are `color(srgb …)` with 0–1 channels; a naive `rgb()` parser produces garbage. That mistake was made here first.
- **The dark ground is `#0F172B`**, not Starlight's stock `#17181C` — the site replaces Starlight's gray ramp with Tailwind slate.

---

## Phase 1 — The mark and the favicon

**Files:** `apps/docs/public/favicon.svg`, `apps/docs/src/assets/potluck-mark-{light,dark}.svg`, `apps/docs/astro.config.mjs`

- [ ] **Step 1: Replace the favicon**

```bash
cp brand/derived/favicon.svg apps/docs/public/favicon.svg
```

Starlight defaults `favicon` to `/favicon.svg` when the key is unset, and it is unset, so the file name is load-bearing and must stay `favicon.svg`.

- [ ] **Step 2: Add the mark as the header logo**

Copy **both** marks from `brand/mark/svg/` into `apps/docs/src/assets/`, then in the `starlight()` config:

```js
logo: {
  light: './src/assets/potluck-mark-light.svg',
  dark: './src/assets/potluck-mark-dark.svg',
  alt: 'Potluck Docs',
},
```

**Two files, not one — measured.** A single `src:` was tried first and put the light mark, whose well is paper, on the dark header, where it reads as a white disc. That is the brand README's own first "Do not". Starlight's `light`/`dark` pair emits both and toggles them on `data-theme`.

Use the transparent variants, not `*-bg`. The filled ones exist only for platforms that will not honor transparency.

Leave `replacesTitle` unset: the brand package has no wordmark, so the title text is the wordmark for now.

- [ ] **Step 3: Leave the footer alone**

"Maintained by EkLine" and `src/assets/ekline-mark.svg` stay. EkLine is still the maintainer. If the Potluck mark is ever added beside it, `brand/variants/potluck-mark-all-coral-*.svg` is the file — single-ink, so it sits correctly next to the single-ink EkLine mark.

---

## Phase 2 — Color

**Files:** `apps/docs/src/styles/global.css`

- [ ] **Step 1: Swap the accent ramp**

Replace the eleven `--color-accent-*: var(--color-violet-*)` lines in the `@theme` block with the literal hex from `brand/derived/accent-ramp.css`.

Literal hex, not `var(--color-red-*)`. An indirection through a Tailwind scale would silently redefine the brand the next time Tailwind retunes its palette.

Rewrite the comment above the block: say the ramp is derived from the two brand corals, name which stop each lands on, point at `brand/README.md`, and note that this file now differs from the template's on purpose.

- [ ] **Step 2: Add the sidebar-pill override**

Add the `:root[data-theme='light'] .sidebar-content a[aria-current='page']` rule from `brand/derived/accent-ramp.css`, next to the existing sidebar block. Carry the measurement into the comment — a one-stop-darker rule with no explanation reads as an accident and gets deleted.

- [ ] **Step 3: Leave the gray ramp alone**

The brand's ink (`#231F20`) and ground (`#F2F1F0`) are warm; the site's grays are Tailwind slate. Swapping those too changes every surface, not just the accent. Candidate follow-up, not this change.

- [ ] **Step 4: Verify against the table in [Verification](#verification)**

4.23:1 on the light sidebar pill means Step 2 did not take.

---

## Phase 3 — Naming

**Files:** `apps/docs/astro.config.mjs`, four files under `apps/docs/`, root `README.md` and `CLAUDE.md`

- [ ] **Step 1: The docs site's own name**

| File | From | To |
| --- | --- | --- |
| `apps/docs/astro.config.mjs` | `title: 'EkLine docs template'` | `'Potluck Docs'` |
| `apps/docs/astro.config.mjs` | `projectName: 'EkLine docs template'` | `'Potluck Docs'` |
| `apps/docs/astro.config.mjs` | the llms-txt `description` | rewrite naming Potluck Docs |
| `apps/docs/src/content/docs/index.mdx` | `title: EkLine docs template` | `Potluck Docs` |
| `apps/docs/src/content/docs/deploy.md` | `description: Deploying the EkLine docs template to …` | `the Potluck Docs template` |
| `apps/docs/src/content/docs/quickstart.mdx` | `description: Create a site from the EkLine docs template,` | `the Potluck Docs template` |
| `apps/docs/README.md` | `# EkLine docs template — documentation site` | `# Potluck Docs — documentation site` |

- [ ] **Step 2: What in `apps/docs/` must NOT change**

Two traps, both of which make the docs wrong rather than merely stale:

- **`branding.md` documents the template's theming.** The template keeps violet. Rewriting that page to describe the coral ramp would document a site the reader does not have. Same for the logo section: the template ships no `logo` key, and that stays true.
- **`site-basics.md` describes the template's favicon.** Also unchanged, so that page is already correct.

Leave alone too: `removing-features.md:110` ("when EkLine built this documentation site") is accurate history, and `search-and-ai.md:59` names the `@ekline/starlight-contextual-menu` package.

- [ ] **Step 3: Root `README.md` and `CLAUDE.md`**

Not shipped, so the customer-framing rule does not apply. Rename the product, and add `brand/` to the layout table in `CLAUDE.md` next to `.github/` and `.claude/`, noting it is monorepo-only and travels into a project by copy.

`CLAUDE.md` should also record the scope rule from [Why the template is out of scope](#why-the-template-is-out-of-scope) — that Potluck branding stops at `apps/`. It is exactly the kind of thing the next agent would otherwise "fix".

- [ ] **Step 4:**

```bash
npm run check && npm test
```

---

## Phase 4 — The template's prose

The only thing that changes under `packages/template/`. Two lines and a changelog entry.

**Files:** `packages/template/README.md`, `packages/template/CLAUDE.md`, `packages/template/CHANGELOG.md`

- [ ] **Step 1: The product name**

| File | From | To |
| --- | --- | --- |
| `README.md` line 1 | `# EkLine docs template` | `# Potluck Docs template` |
| `CLAUDE.md` line 7 | "generated from EkLine's Starlight (Astro) template" | "generated from the Potluck Docs template" |

Both files ship into a customer's repo, so write in their second person. "This directory is EkLine's template, which we ship to customers" is false there and no script catches it.

Everything else in these two files that says `ekline` is a URL or a repo path — 20 links to `documentation-ekline-docs-template`, 4 to `ekline-io/ekline-docs-template-astro`. Those are Phase 5. `README.md` line 149 (EkLine built its own site from this template) is history and line 205 (`Maintained by [EkLine](https://ekline.io)`) is attribution; both stay.

- [ ] **Step 2: `packages/template/wiki/` needs nothing**

Checked: every `ekline` in those three files is either a hosted-docs URL (Phase 5) or the leak sentinel (now out of scope). No edits.

- [ ] **Step 3: Changelog**

One entry. The product a customer adopted changed name; the code did not. Say exactly that, so nobody goes looking for a diff to pull.

- [ ] **Step 4:**

```bash
npm run check:shipped
```

Then re-read both files as if you had just run `npm create astro` and received them.

---

## Phase 5 — The repository rename (confirmed, a later task)

Not deferred indefinitely: the repository will be renamed to Potluck Docs in a
separate task. This phase is its inventory, gathered now while the surface is
fresh.

**Scope:** 62 occurrences across 23 tracked files. `git grep` is authoritative —
`dist/` carries hundreds more and is untracked, so a plain `grep -r` overcounts
by an order of magnitude and sends you editing build output:

```bash
git grep -c -e "ekline-docs-template-astro" -e "ekline-docs-template-monorepo" \
             -e "documentation-ekline-docs-template" -e "@ekline/docs-site" \
          -- . ':!docs/superpowers' ':!brand'
```

`docs/superpowers/` is excluded on purpose: those are dated records of how this
repo was built, and rewriting them to match a later rename makes them less
accurate, not more.

### What changes, and what each one breaks

| What | Where | What breaks |
| --- | --- | --- |
| The adoption command's path | root `README.md`, `packages/template/README.md` ×2, `apps/docs` quickstart and README | `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template` is published. A repo rename leaves a GitHub redirect for the web UI; **verify `create-astro` follows it** before relying on that — this is the one item that breaks for people who are not us. |
| The GitHub repo URL | both `astro.config.mjs` social links, `apps/docs/src/loaders/wiki.mjs` (`REPO_BLOB`), `packages/template/README.md`, `.github/workflows/ci.yml` | `apps/docs/tests/wiki-collection.test.mjs` line 174 asserts on this URL with a regex, so a half-rename fails loudly — the right behavior. |
| `documentation-ekline-docs-template.vercel.app` | ~20 links in `packages/template/README.md`, plus `CLAUDE.md`, `wiki/` ×3, and `apps/docs` content | Every "see the hosted docs" link. |
| `ekline-docs-template-astro.vercel.app` | live-preview links in both READMEs | Same. |
| The two Vercel project slugs | `.github/workflows/ci.yml` lines 280–284 | The deployment smoke test picks a project by matching the environment name. Rename the projects and the job hits its `*)` branch and fails, deliberately. Update in the same commit. |
| Three `package.json` names | root `ekline-docs-template-monorepo`, `packages/template` `ekline-docs-template-astro`, `apps/docs` `@ekline/docs-site` | Nothing published — the template is fetched as a directory and the other two are private. Cosmetic, but they are the repo's name in three places. |
| Two `package-lock.json` root names | `packages/template/`, `apps/docs/` | See the warning below. |
| `packages/template/CHANGELOG.md` | 4 references | History entries. Change the forward-looking prose; leave past entries describing what was true then. |

### Regenerating the lockfiles: `--package-lock-only`, nothing more

A lockfile's root `"name"` tracks its `package.json`, so both need updating. Do
it with:

```bash
npm --prefix packages/template install --package-lock-only
npm --prefix apps/docs install --package-lock-only
```

**Do not take the opportunity to re-resolve dependencies.** The root
`CLAUDE.md` records that a from-scratch resolve here has produced an
Astro/Vite combination that breaks `@tailwindcss/vite`, and `packages/template`'s
lockfile is the one every customer receives — an unlocked or badly resolved
install is their first experience of the product. A name change should move one
line per file; check `git diff --stat` and be suspicious of anything larger.

Hand-editing the name instead is also fine and arguably safer, since it cannot
re-resolve anything. What is not fine is `npm install` without the flag.

### Sequence

1. Rename the GitHub repo. Confirm `create-astro` follows the redirect before
   anything depends on it.
2. Rename the two Vercel projects **together with** the CI matcher, in one
   commit — they fail as a pair otherwise.
3. Then the prose links, once the new domains are live.

Prose first leaves the docs pointing at 404s for the length of the migration.

---

## What this plan does not do

- **Does not brand the template.** See the section at the top. The customer's copy stays neutral.
- **Does not change typography.** Both sites keep Inter and JetBrains Mono; the Instrument Sans / Newsreader tokens are already removed from the brand package.
- **Does not change the gray ramp.** Warm brand ink against cool slate is a real mismatch and a much larger diff. Follow-up.
- **Does not add a wordmark.** The brand package has no type treatment, by its own statement.
- **Does not touch `docs/superpowers/`.** Dated records of how this repo was built; they say EkLine because that was true when written.
