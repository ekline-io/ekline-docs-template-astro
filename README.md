# EkLine docs template — monorepo

The home of EkLine's recommended [Astro](https://astro.build/) +
[Starlight](https://starlight.astro.build/) documentation template.

## Are you here to build a docs site?

Then you want the template, not this repository:

```bash
npm create astro@latest -- --template ekline-io/ekline-docs-template-astro/packages/template --no-ai
```

That fetches [`packages/template/`](./packages/template) — the whole product,
lockfile included — and leaves you a plain directory to make your own. Its
[README](./packages/template/README.md) takes it from there.

**Not the "Use this template" button.** The template is a subdirectory here, and
the button copies whole repositories, so it would hand you the build tooling and
EkLine's own sites along with it.

**Live preview:** <https://ekline-docs-template-astro.vercel.app/> — with the
demo login enabled, so you can sign in as a fake reader and see the private and
per-org docs work.

**Documentation:** <https://documentation-ekline-docs-template.vercel.app> —
every setting in the template, what it does, and what happens if you leave it
alone.

## What is in here

| Path | What it is |
| --- | --- |
| [`packages/template/`](./packages/template) | The template EkLine ships. Self-contained: its own `package.json`, its own committed lockfile, its own `CLAUDE.md`. This is what the command above copies. |
| [`apps/docs/`](./apps/docs) | The hosted documentation for the template — how to configure it, what every setting does. Built with the template itself. Live at <https://documentation-ekline-docs-template.vercel.app>. |
| `docs/superpowers/` | Design specs and implementation plans. Development history; never part of what a customer receives. |

## Working in this repo

Each project is independent — there is no npm workspace and no hoisted
`node_modules`. The root `package.json` only delegates:

```bash
npm run check   # type-check the template
npm test        # build it and run the test suite
```

Anything more specific runs from the project itself:

```bash
cd packages/template && npm ci && npm run dev
```

**The missing `workspaces` key is deliberate — please do not add it.** The
template is delivered as a directory copy, so it has to carry its own
`package-lock.json`; under workspaces that file would live at the root and no
customer would ever receive it. An unlocked install is not a theoretical
problem here — it resolves an Astro/Vite combination that breaks
`@tailwindcss/vite`. The reasoning is in [`CLAUDE.md`](./CLAUDE.md).

## License

[MIT](./LICENSE).
