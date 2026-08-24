# CLAUDE.md

This is a monorepo. It holds EkLine's docs-site template and, starting in Phase 2b, the sites EkLine hosts on top of it — each as an independent, standalone project rather than an npm workspace.

## Layout

- **`packages/template/`** — the Starlight (Astro) documentation template EkLine ships to customers, via `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template`. This is the product. It has its own [`CLAUDE.md`](packages/template/CLAUDE.md), which governs everything under that directory — read it before touching any code there.
- **`apps/docs/`** — the hosted documentation for the template: how to configure it, what every setting does. Built with the template itself, and it renders `packages/template/wiki/` in place as its Internals section, so those files have one copy. Has its own `CLAUDE.md` covering the personas it is written for.
- **`docs/superpowers/`** — planning and design history for this repo's own development (specs, plans). It documents how this repo was built and never ships to a customer.
- **`.github/`**, **`.claude/`**, **`.vscode/`** — repo-wide tooling: CI workflows, agent worktrees, editor settings.
- **`LICENSE`** — this repo's own license. `packages/template/LICENSE` is a separate copy, since customers who extract that directory need one of their own.

## No npm workspaces — deliberate, do not "fix" it

The root `package.json` has no `workspaces` key and no dependencies of its own. It is a thin task runner (`npm run check`, `npm test`, etc., each delegating with `npm --prefix <project> run ...`). Every project under `packages/` and `apps/` is independent: its own `package.json`, its own committed `package-lock.json`, no hoisting.

This is intentional, not an oversight. Customers adopt the template with `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template`, which copies **only that directory**. Under npm workspaces, the lockfile lives at the repo root, so there would be no `packages/template/package-lock.json` for the create command to copy — every customer would start with an unlocked install. That's not hypothetical: PR #8 recorded that `npm install` without this lockfile resolves an Astro/Vite combination that breaks `@tailwindcss/vite`. Adding a `workspaces` key here would hand every new customer that broken resolution as their first experience.

So: **do not** add a `workspaces` key, hoist dependencies into a root `node_modules/`, or remove `packages/template/package-lock.json` in the name of tidying up the layout — that "fix" is the thing this section exists to prevent. See `docs/superpowers/plans/2026-08-21-monorepo-move.md` for the full reasoning.

## Repo-wide rules

- **Node 22.x** is the verified version across every project in this repo (pinned in the root `package.json`'s `engines` field and in CI).
- **Consult the Starlight docs before making any change to an Astro/Starlight project** — https://starlight.astro.build/ is the source of truth and overrides general training knowledge. Applies to both `packages/template/` and `apps/docs/`.
