# Monorepo Move (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the shipped template into `packages/template/` so a sibling `apps/docs` can exist, with nothing about the template's behaviour, tests or deployment changing.

**Architecture:** A `git mv` of the shipped surface into `packages/template/`, a thin root task-runner, and CI/deploy paths updated to match. **Deliberately not npm workspaces** — see the decision below. Phase 2b adds `apps/docs`; this plan adds no new site.

**Tech Stack:** npm, GitHub Actions, Vercel, Astro 6 + Starlight.

**Spec:** [`docs/superpowers/specs/2026-08-21-phase-2-monorepo-hosted-docs.md`](../specs/2026-08-21-phase-2-monorepo-hosted-docs.md). Read it first.

**Branch:** `pa-claude/monorepo-hosted-docs`, worktree at `.claude/worktrees/monorepo-hosted-docs`. **Stacked on PR #9** — its base is `pa-claude/demo-login-private-docs-e4f30b`, not `main`. Do not rebase onto main.

---

## The decision that shapes everything: no npm workspaces

The obvious move is `workspaces: ["packages/*", "apps/*"]` at the root, one hoisted `node_modules`, one lockfile. **Do not do that**, for one reason that outweighs the convenience:

**The template ships to customers as a directory, and it must carry its own lockfile.** Customers adopt it with `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template`, which copies that directory and nothing else. Under workspaces there is no `packages/template/package-lock.json` to copy — the lockfile lives at the root — so every customer would start with an unlocked install. That is not hypothetical: PR #8 recorded that `npm install` without this lockfile resolves an Astro/Vite combination that breaks `@tailwindcss/vite`. Workspaces would hand every new customer that broken resolution as their first experience.

Two lesser reasons point the same way: hoisting can mask a dependency missing from `packages/template/package.json` (CI would pass, a customer's extracted copy would not), and Vercel's Root Directory handling is trivial when each project is self-contained.

So: **each project is independent, with its own `package.json` and its own committed `package-lock.json`.** The root `package.json` is a task runner with no dependencies and no `workspaces` key.

---

### Task 1: Move the template into `packages/template/`

**Files:**
- Move: `.env.example`, `.env.test`, `CHANGELOG.md`, `README.md`, `astro.config.mjs`, `package.json`, `package-lock.json`, `playwright.config.mjs`, `public/`, `src/`, `tests/`, `tsconfig.json`, `vercel.json`, `wiki/` → `packages/template/`
- Copy: `LICENSE` → `packages/template/LICENSE` (the root keeps its own; the shipped directory needs one of its own, since customers receive only that directory)

Everything else stays at the repo root: `.claude/`, `.github/`, `.vscode/`, `docs/`, `LICENSE`, `.gitignore`, `CLAUDE.md`.

- [ ] **Step 1: Move, with `git mv` so history follows**

```bash
mkdir -p packages/template
git mv .env.example .env.test CHANGELOG.md README.md astro.config.mjs \
        package.json package-lock.json playwright.config.mjs \
        public src tests tsconfig.json vercel.json wiki \
        packages/template/
cp LICENSE packages/template/LICENSE
git add packages/template/LICENSE
```

- [ ] **Step 2: Confirm history followed the move**

Run: `git log --oneline --follow -3 -- packages/template/src/middleware.ts`
Expected: the v2.0.0 commits, not a single "add file" commit. If history did not follow, the move was done with `mv` rather than `git mv` — undo and redo.

- [ ] **Step 3: Verify the template still works entirely on its own**

```bash
cd packages/template
npm ci
npm run check
npm test
```

Expected: `check` reports 0 errors / 0 warnings / 0 hints; `npm test` reports 99 passing. **`npm ci`, not `npm install`** — it must prove the moved lockfile is intact and complete.

- [ ] **Step 4: Verify the browser suite from the new location**

```bash
cd packages/template
npx playwright install chromium   # if not already present
npm run test:visual
```

Expected: 82 passed, 20 skipped. This exercises `playwright.config.mjs`'s relative paths (`./tests/helpers/test-servers.mjs`, `.env.test`, `./dist/server/entry.mjs`) from the new root. If any path broke, it broke here — fix it in this task rather than later.

Note: the suite serves on port 4331 by default; set `DOCS_TEST_PORT` if that is taken.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move the shipped template into packages/template/ (EK-2373)"
```

---

### Task 2: The root task runner

A `package.json` at the root that delegates. No dependencies, no `workspaces` key — see the decision above.

**Files:**
- Create: `package.json` (repo root)

- [ ] **Step 1: Write it**

```json
{
  "name": "ekline-docs-template-monorepo",
  "private": true,
  "type": "module",
  "description": "Task runner for the repo. Each project under packages/ and apps/ is independent, with its own package.json and its own committed lockfile — see docs/superpowers/plans/2026-08-21-monorepo-move.md for why this is not an npm workspace.",
  "scripts": {
    "template:check": "npm --prefix packages/template run check",
    "template:test": "npm --prefix packages/template test",
    "template:test:visual": "npm --prefix packages/template run test:visual",
    "template:test:visual:ci": "npm --prefix packages/template run test:visual:ci",
    "template:dev": "npm --prefix packages/template run dev",
    "template:build": "npm --prefix packages/template run build",
    "check": "npm run template:check",
    "test": "npm run template:test",
    "install:all": "npm --prefix packages/template ci"
  },
  "engines": { "node": "22.x" }
}
```

`npm --prefix`, not `cd &&`: it works identically on every platform and keeps each script a single command. `check` and `test` alias the template's for now; Phase 2b extends them to cover `apps/docs` too.

- [ ] **Step 2: Verify delegation works from the repo root**

```bash
cd <repo root>
npm run check
npm test
```

Expected: identical output to running them inside `packages/template` — 0/0/0 and 99 passing. If `npm --prefix` reports "Missing script", the prefix path is wrong.

- [ ] **Step 3: Confirm the root has no `node_modules` and needs none**

Run: `ls node_modules 2>&1`
Expected: "No such file or directory". The root `package.json` declares no dependencies; if something installed here, a dependency crept in that should not have.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: root task runner delegating to packages/template (EK-2373)"
```

---

### Task 3: CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a working directory and fix the install**

The job currently runs `npm ci`, `npm run check`, `npm test`, `npm run test:visual:ci` from the checkout root, and resolves the Playwright version with `require('@playwright/test/package.json')`. All four now need to happen inside `packages/template`.

Add a job-level default immediately after `timeout-minutes: 10`:

```yaml
    defaults:
      run:
        # Every step runs inside the shipped template. The repo root has no
        # dependencies of its own — each project under packages/ and apps/ is
        # independent and carries its own lockfile, so that a customer who
        # extracts packages/template/ gets a locked install. See
        # docs/superpowers/plans/2026-08-21-monorepo-move.md.
        working-directory: packages/template
```

- [ ] **Step 2: Fix the two paths that a working directory does not cover**

`actions/setup-node`'s npm cache and `actions/upload-artifact`'s path are action inputs, not shell commands, so `defaults.run` does not apply to them. Change:

```yaml
      - uses: actions/setup-node@v7
        with:
          node-version: 22.x
          cache: npm
          # `defaults.run.working-directory` does not reach action inputs, so
          # the cache needs the lockfile's path spelled out.
          cache-dependency-path: packages/template/package-lock.json
```

and:

```yaml
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: packages/template/playwright-report/
          retention-days: 7
```

- [ ] **Step 3: Reproduce every CI step locally, in order**

```bash
cd packages/template
npm ci
npm run check
npm test
node -p "require('@playwright/test/package.json').version"
npx playwright install --with-deps chromium   # or plain `install` on macOS
npm run test:visual:ci
```

Expected: all succeed; the version prints a real version string; the visual run reports 81 passed / 19 skipped. Paste the real output in your report.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the suite inside packages/template (EK-2373)"
```

---

### Task 4: `.gitignore`, split

The root `.gitignore` covers paths that no longer exist at the root.

**Files:**
- Modify: `.gitignore` (repo root)
- Create: `packages/template/.gitignore`

- [ ] **Step 1: Give the template its own**

The shipped directory needs the ignores that belong to it, because a customer who extracts it gets only that directory. Create `packages/template/.gitignore` with the build, dependency, env and Playwright entries from the current root file — everything except the editor/OS entries, which stay at the root and apply repo-wide.

Read the current root `.gitignore` and split it; do not guess at its contents. Keep every comment: several of them explain a non-obvious exclusion (the Vercel adapter output, and which Playwright artifacts are committed).

- [ ] **Step 2: Trim the root to what is repo-wide**

Keep `node_modules/`, `.DS_Store`, the logs, and the editor entries. Keep `dist/`, `.astro/` and `.vercel/` too — they are cheap insurance against a stray build at the root, and Phase 2b adds `apps/docs` which will produce its own.

- [ ] **Step 3: Verify nothing that should be ignored is now tracked, and nothing tracked is now ignored**

```bash
cd packages/template && npm run build >/dev/null 2>&1
cd <repo root>
git status --short
```

Expected: clean. If `dist/` or `.astro/` appears, the template's `.gitignore` is missing an entry.

Then confirm no previously-tracked file became ignored:

```bash
git ls-files --ignored --exclude-standard -c
```

Expected: empty output. Anything listed is a tracked file the new ignore rules now match — a real mistake, since it would silently stop receiving updates.

- [ ] **Step 4: Commit**

```bash
git add .gitignore packages/template/.gitignore
git commit -m "chore: split .gitignore between the repo and the shipped template (EK-2373)"
```

---

### Task 5: `CLAUDE.md`, split

`CLAUDE.md` is instructions for agents working in this repo, and it currently describes a single-project layout throughout.

**Files:**
- Modify: `CLAUDE.md` (repo root)
- Create: `packages/template/CLAUDE.md`

- [ ] **Step 1: Move the template-specific content down**

`packages/template/CLAUDE.md` takes everything that is about the template itself: project intent, the authoritative-references rule, working principles, commands, architecture, installed plugins, the API reference section. Adjust any path that was root-relative and is now relative to `packages/template/` — but note most were already written as repo-relative paths like `wiki/private-docs.md`, which are still correct *from inside the template*.

- [ ] **Step 2: Write the root `CLAUDE.md` as a map**

It should say, briefly: this is a monorepo; `packages/template/` is the product EkLine ships and has its own `CLAUDE.md` that governs work inside it; `apps/` holds sites EkLine hosts (Phase 2b adds the docs site); `docs/superpowers/` is development history and never ships to a customer. Include the no-workspaces decision and its reason — an agent that "fixes" the missing `workspaces` key would break every customer's lockfile, and that is exactly the kind of tidy-up this file exists to prevent.

Also carry across the repo-wide rules that are not template-specific: the Node version, and the instruction to consult the Starlight docs before making changes.

- [ ] **Step 3: Verify the split covers everything**

Read the original `CLAUDE.md` from git (`git show HEAD~4:CLAUDE.md`, or find the right ref) and check every section landed in one of the two files. Report any you deliberately dropped and why.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md packages/template/CLAUDE.md
git commit -m "docs: split CLAUDE.md between the repo and the template (EK-2373)"
```

---

### Task 6: Full verification from both roots

No new files — the gate before the PR.

- [ ] **Step 1: From inside the template**

```bash
cd packages/template
npm run check && npm test && npm run test:visual
```
Expected: 0/0/0 · 99 passing · 82 passed, 20 skipped.

- [ ] **Step 2: From the repo root**

```bash
cd <repo root>
npm run check && npm test
```
Expected: identical results, delegated.

- [ ] **Step 3: Prove the template is genuinely self-contained**

This is the property the whole no-workspaces decision exists to protect, so test it rather than assume it:

```bash
rm -rf /tmp/extract-probe && mkdir -p /tmp/extract-probe
cp -R packages/template/. /tmp/extract-probe/
cd /tmp/extract-probe
rm -rf node_modules dist .astro
npm ci
npm run check
npm test
```

Expected: all succeed. `npm ci` proves the lockfile travelled and is complete; if it errors with "can only install with an existing package-lock.json", the lockfile did not move in Task 1.

Clean up: `rm -rf /tmp/extract-probe`.

- [ ] **Step 4: Confirm the diff is a move, not a rewrite**

```bash
cd <repo root>
git diff --stat pa-claude/demo-login-private-docs-e4f30b...HEAD -M
```

Expected: the moved files appear as renames (`R`), not as delete+add pairs. A rewrite would mean the review has to re-read every file. If `git diff` shows adds and deletes, add `-M` / raise `--find-renames` and check again before concluding.

- [ ] **Step 5: Fix anything failing, commit, re-run until green.**

---

### Task 7: PR, stacked on #9

- [ ] **Step 1: Push and open the PR against #9's branch, not `main`**

```bash
git push -u origin pa-claude/monorepo-hosted-docs
gh pr create \
  --base pa-claude/demo-login-private-docs-e4f30b \
  --title "EK-2373 refactor: move the template into packages/template/ (Phase 2a)" \
  --body "$(cat <<'EOF'
**Stacked on #9** — base is `pa-claude/demo-login-private-docs-e4f30b`, not `main`, so this diff shows only the move. GitHub retargets it to `main` when #9 merges.

Groundwork for a hosted docs site: `apps/docs` cannot exist while "Use this template" copies the whole default branch, so the shipped template moves into `packages/template/` first. **Nothing about the template's behaviour, tests or deployment changes** — this is a move plus the path updates it forces.

## Not an npm workspace, deliberately

The template ships to customers as a directory, copied by `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template`. Under workspaces there would be no `packages/template/package-lock.json` to copy, so every customer would start unlocked — and #8 recorded that `npm install` without this lockfile resolves an Astro/Vite combination that breaks `@tailwindcss/vite`. Each project is independent with its own committed lockfile instead; the root `package.json` is a task runner with no dependencies.

Verified by extracting `packages/template/` to a scratch directory and running `npm ci && npm run check && npm test` there.

## Verification

- From `packages/template`: `npm run check` 0/0/0 · `npm test` 99 passing · `npm run test:visual` 82 passed / 20 skipped
- From the repo root: delegated `check` and `test`, identical results
- Extracted-copy probe: `npm ci` clean, suite green
- Every CI step reproduced locally in order

## Before merging

The Vercel project's **Root Directory** must be set to `packages/template`, or the deploy builds an empty repo root. Nothing else about that project changes — same domain, same five env vars.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Confirm the PR's base**

Run: `gh pr view --json baseRefName -q .baseRefName`
Expected: `pa-claude/demo-login-private-docs-e4f30b`. If it says `main`, the stack is wrong — fix with `gh pr edit --base pa-claude/demo-login-private-docs-e4f30b`.

- [ ] **Step 3: Report to the human** that the Vercel Root Directory change is theirs to make, and that it must happen before this merges to `main` or production builds an empty root.
