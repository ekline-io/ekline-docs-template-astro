---
title: Customizing the API reference
description: What the template turns off by default — the AI agent, the Open API Client link, the Powered by Scalar links, the platform toolbar — the one-line restore for each, and theming through --scalar-* properties.
---

Four of Scalar's own product surfaces are off by default, in
`src/components/ScalarApiReference.astro`. Each is one line to turn back on.

| Surface | Why it's off | Restore |
| --- | --- | --- |
| **Ask AI agent** | Uploads your OpenAPI document to Scalar's servers and asks the reader to accept Scalar's terms — not something a template can agree to on your behalf. | Delete the `agent: { disabled: true }` line. |
| **Open API Client link** | Opens scalar.com's hosted client in a new tab; the URL carries `utm_source` / `utm_medium` / `utm_campaign`. | Set `hideClientButton: false`. |
| **Powered by Scalar** | Two links to scalar.com — the sidebar footer and the request client's empty state. | Delete the `a[href*='scalar.com']` rule near the bottom of the file. |
| **Platform toolbar** ("Developer Tools" / "Configure" / "Share" / "Deploy") | Scalar's own product chrome. Shows on `localhost` by default — exactly while someone is evaluating the template locally. | Delete the `showToolbar` and `showDeveloperTools` lines to fall back to Scalar's own defaults. |

The embedded request client stays on either way: **Test Request** still
opens it in place, which is the part readers actually want. Turning off the
AI agent also removes its "Generate MCP" button — same feature.

:::note
Scalar is MIT licensed, which requires its copyright notice to travel with
the source (it does, in `node_modules`) — not an attribution badge in
rendered output. Removing the "Powered by Scalar" links is within the
license.
:::

## Theming

Nothing Scalar-specific to touch for an ordinary rebrand. The component maps
Scalar's documented `--scalar-*` custom properties onto Starlight's
`--sl-color-*` variables, so a palette change in `src/styles/global.css`
(see [Branding and theming](/branding/)) carries into the reference on its
own — background, text, borders, accent color, and the font stack.

For something Scalar-specific that Starlight's tokens don't cover — corner
radius, for instance — add more `--scalar-*` declarations in the same file:

```css
.ek-scalar .scalar-app.scalar-app {
	--scalar-radius: 0.75rem;
}
```

Style only through `--scalar-*` custom properties; Scalar's internal class
names aren't a stable API and can change on any upgrade.

:::caution
Match the template's own selector, `.ek-scalar .scalar-app.scalar-app`, when
overriding a property it already sets. Scalar injects its own stylesheet
into `<head>` at runtime, after the site's — a plainer selector like
`.ek-scalar` alone can lose to it.
:::
