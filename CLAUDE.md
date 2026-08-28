# CLAUDE.md

This is a monorepo. It holds EkLine's docs-site template and, starting in Phase 2b, the sites EkLine hosts on top of it — each as an independent, standalone project rather than an npm workspace.

## Layout

- **`packages/template/`** — the Starlight (Astro) documentation template EkLine ships to customers, via `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template --no-ai`. This is the product. It has its own [`CLAUDE.md`](packages/template/CLAUDE.md), which governs everything under that directory — read it before touching any code there. That file **ships**, so it is written for the customer; the maintainer's half lives here, under [Working in `packages/template`](#working-in-packagestemplate).
- **`apps/docs/`** — the hosted documentation for the template: how to configure it, what every setting does. Live at <https://documentation-ekline-docs-template.vercel.app>. Built with the template itself, and it renders `packages/template/wiki/` in place as its Internals section, so those files have one copy. Has its own `CLAUDE.md` covering the personas it is written for.
- **`docs/superpowers/`** — planning and design history for this repo's own development (specs, plans). It documents how this repo was built and never ships to a customer.
- **`.github/`**, **`.claude/`**, **`.vscode/`** — repo-wide tooling: CI workflows, agent worktrees, editor settings.
- **`LICENSE`** — this repo's own license. `packages/template/LICENSE` is a separate copy, since customers who extract that directory need one of their own.

## Working in `packages/template`

Everything under that directory is copied verbatim into a customer's repository, **its `CLAUDE.md` and `README.md` included**. That makes those two files a shipped surface with a reader who is not you, and it is the reason this section exists rather than living alongside the code it describes.

- **Write shipped prose in the customer's second person.** In their repo, "this directory is EkLine's template, which we ship to customers" is simply false, and an agent that believes it will decline to add the product-specific content that is the whole point of their site. `packages/template/CLAUDE.md` addresses the site's owner; the maintainer framing stays here.
- **Never name a monorepo path in shipped prose.** `apps/`, `.github/`, "a sibling of this directory" — none of these exist once the directory travels. `npm run check:shipped` enforces this and explains the exceptions; run it after editing anything under `packages/template/*.md` or `packages/template/wiki/`. It cannot see framing problems, only paths, so the first rule above stays a review question.
- **Keep it template-shaped.** Content, sidebar entries, and example pages should be obvious placeholders a customer can swap out. EkLine attribution belongs in attribution-shaped places — the footer credit, the LICENSE — and nowhere else. Product-specific EkLine copy or assets do not belong in a customer's docs site.
- **The hosted docs at <https://documentation-ekline-docs-template.vercel.app> are built from `apps/docs/`**, which renders `packages/template/wiki/` in place. Configuration material belongs there rather than in the template's `README.md`, so it has one home.
- **CI is `.github/workflows/ci.yml`** and runs `check`, `test`, `test:visual:ci`, and `check:shipped` on every PR. It lives at this root and so is not part of a customer's copy — which is exactly why shipped docs must not describe it as present.

## Why `packages/` and `apps/` are separate

`packages/` holds what EkLine **ships** — a customer receives a copy of the
directory. `apps/` holds what EkLine **hosts** — nobody receives a copy, they
visit a URL. Today that is one directory each, so the split looks like
ceremony, but it encodes a difference that is load-bearing rather than
stylistic:

| | `packages/*` | `apps/*` |
| --- | --- | --- |
| Must carry its own lockfile | **Yes** — it travels alone (see the next section) | Only for our own CI |
| Must stand alone | **Yes** — no reference to a monorepo it will not be in | No; `apps/docs` reads `../../packages/template/wiki` on purpose |
| Blast radius of a change | Every customer | One site we control |

It was questioned once and kept deliberately: the shipped-versus-hosted line is
real, and a second template is plausible. The known cost is that the adoption
command hardcodes the path, so flattening this later means changing a published
URL rather than a directory name.

Note the convention normally arrives with Turborepo/Nx/pnpm workspaces keying
off it. We have none of that on purpose — see below — so these folders carry
meaning for readers, not for tooling.

## No npm workspaces — deliberate, do not "fix" it

The root `package.json` has no `workspaces` key and no dependencies of its own. It is a thin task runner (`npm run check`, `npm test`, etc., each delegating with `npm --prefix <project> run ...`). Every project under `packages/` and `apps/` is independent: its own `package.json`, its own committed `package-lock.json`, no hoisting.

This is intentional, not an oversight. Customers adopt the template with `npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template`, which copies **only that directory**. Under npm workspaces, the lockfile lives at the repo root, so there would be no `packages/template/package-lock.json` for the create command to copy — every customer would start with an unlocked install. That's not hypothetical: PR #8 recorded that `npm install` without this lockfile resolves an Astro/Vite combination that breaks `@tailwindcss/vite`. Adding a `workspaces` key here would hand every new customer that broken resolution as their first experience.

So: **do not** add a `workspaces` key, hoist dependencies into a root `node_modules/`, or remove `packages/template/package-lock.json` in the name of tidying up the layout — that "fix" is the thing this section exists to prevent. See `docs/superpowers/plans/2026-08-21-monorepo-move.md` for the full reasoning.

## Repo-wide rules

- **Node 22.x** is the verified version across every project in this repo (pinned in the root `package.json`'s `engines` field and in CI).
- **Consult the Starlight docs before making any change to an Astro/Starlight project** — https://starlight.astro.build/ is the source of truth and overrides general training knowledge. Applies to both `packages/template/` and `apps/docs/`.
