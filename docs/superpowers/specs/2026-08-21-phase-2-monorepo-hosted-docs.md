# Phase 2 — monorepo and a hosted docs site

**Date:** 2026-08-21 · **Jira:** EK-2373 follow-up · **Status:** design, pre-plan
**Stacked on:** PR #9 (`pa-claude/demo-login-private-docs-e4f30b`), unmerged.

Phase 1's design doc — [`2026-08-21-demo-login-and-monorepo-design.md`](./2026-08-21-demo-login-and-monorepo-design.md)
— settled the shape. This fills in what it deferred, and supersedes its Phase 2
section where the two differ.

## What forces this

Only one thing: a hosted docs site. "Use this template" copies the entire
default branch, so sibling apps in this repo would ship to every customer.
The demo needed no restructure — it is the template with a flag set. The docs
site cannot be anything but a sibling.

## Decisions taken

### The docs site is for customers, not maintainers

Written for people *using* the template: how to configure it, what the
configuration surface is, how to change branding, how to set up the logged-in
experience, how to enable API references and what the layout modes mean. Not a
published copy of the wiki — the wiki is written for whoever is about to edit
`src/middleware.ts`, which is a different reader with a different question.

Both audiences are real, so both are served, in one site with a clear seam:
authored guides for the customer, the wiki rendered as a deeper *Internals*
section for the customer's maintainer. That maintainer is a real person — the
constraints in `wiki/private-docs.md` are what stop them reopening the org
isolation holes PR #8 closed — so the wiki is published rather than hidden.

### Content ownership, so three places do not document one template

| Lives in | Holds | Audience |
| --- | --- | --- |
| `packages/template/README.md` | What this is, the create command, a link to the docs site, and "replace this file with your own" | Someone who just ran the create command and is looking at a directory |
| `apps/docs` | Every configuration guide and reference | Customers |
| `packages/template/wiki/` | The measured constraints that protect the code they sit beside | The customer's maintainer, editing the guts |

The README shrinks. Anything in it that is a *guide* moves to the docs site;
what stays is what a person needs before they have a browser open. The wiki
does not move — those files must travel with the code they describe, and a
customer who forks gets them offline.

### The wiki is rendered in place, never copied

**Verified 2026-08-21:** an Astro content collection reads a directory outside
its own project root. `glob({ pattern: '**/*.md', base: '../<other-worktree>/wiki' })`
loaded all three wiki files from a *different git worktree* and rendered them
in a built page. So `apps/docs` globs `packages/template/wiki/` directly: no
copy step, no sync script, no drift.

One wrinkle to resolve in the plan: the wiki files carry no frontmatter (they
open with an H1), and `docsSchema()` requires a `title`. Preferred fix is a
thin loader wrapper deriving the title from the first H1, leaving the files
untouched — the wiki's in-repo reading experience is for the same person the
file is written for, and prepending a YAML table to satisfy a schema degrades
it. Adding frontmatter is the fallback if the wrapper proves awkward.

### Adoption: the CLI command, not the button

```
npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template
```

Verified 2026-08-21 against this repo. Turn `isTemplate` off when this lands,
so the button cannot offer the monorepo. A CI-published mirror repo to restore
the button stays deferred — only if customers ask for it.

### Deployments

| Site | Vercel project | Root directory | URL |
| --- | --- | --- | --- |
| Demo | the existing one | `packages/template` | unchanged — same domain as today |
| Docs | new | `apps/docs` | its own domain (to be pointed at it) |

The demo keeps its domain and its five env vars; only Root Directory changes.
The docs site needs `DOCS_SITE_URL` set to its own domain for sitemap and
llms-txt absolute URLs.

## Information architecture

Authored for the customer, in the order a customer meets the problems.

- **Get started** — what the template includes; create your site; run it; deploy it
- **Configure**
  - Site basics — title, `site` / `DOCS_SITE_URL`, social links, favicon
  - Branding and theming — colours, fonts, logo, custom CSS
  - Navigation and the sidebar
  - Writing content — where pages live, frontmatter, MDX, the changelog
  - Search
  - AI and LLMs — `llms.txt`, the contextual menu
- **API references**
  - What you get, and adding your OpenAPI document
  - Layout modes: `docs` (embedded, keeps the Starlight sidebar) vs `full`
    (Scalar's own shell) — with both live in the shipped examples
  - What is deliberately switched off, and how to restore each
  - Theming the reference
- **The logged-in experience**
  - The three access levels
  - Setting up sign-in — the handoff, and the one endpoint your product writes
  - Trying it without SSO — the demo login
  - Writing private and per-org content
- **Reference**
  - Environment variables — all of them, one table
  - Configuration files — what lives where
  - Commands
  - Removing what you do not need
- **Internals** — the wiki, rendered in place

## Dogfooding, deliberately

`apps/docs` is built with the template. That is the strongest claim the site
can make, and it means every change to the template is exercised by EkLine
before a customer sees it. It also constrains: the docs site should use the
template's own configuration surface rather than reaching past it, because
anything it needs and cannot express is a gap customers will hit too.

## Out of scope

- The mirror repo (deferred; decision recorded above)
- Migrating the demo to a separate Vercel project — it stays where it is
- Any change to the private-docs security model
