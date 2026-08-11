# @netlify/skew-protection-unplugin

A bundler-agnostic plugin, built on [unplugin](https://unplugin.unjs.io/), that implements Netlify's
[Skew Protection](https://docs.netlify.com/deploy/deploy-overview#skew-protection) for frameworks not covered by any
Netlify-specific adapter.

Skew protection pins a browser session's JS/CSS asset requests to the deploy that served the initial page, so open tabs
don't hit "loading chunk failed" errors (or a CSS/JS mismatch) when a newer deploy ships mid-session.

## Bundler support

| Bundler                                               | Support                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Vite ≤7 / Rollup                                      | Stamps lazily-loaded chunks (via `renderDynamicImport`) and initial entry tags (via `transformIndexHtml`, Vite only)     |
| Webpack 5                                             | Stamps lazily-loaded JS/CSS chunks (via a runtime module) and initial entry tags (via `html-webpack-plugin`, if present) |
| Vite 8+ (Rolldown), Rolldown, esbuild, Rspack, others | Not supported — see "Known limitations"                                                                                  |

## Installation

```bash
npm install -D @netlify/skew-protection-unplugin
```

## Usage

Each bundler has its own entry point, so you only pull in the code for the bundler you're actually using:

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import skewProtection from '@netlify/skew-protection-unplugin/vite'

export default defineConfig({
  plugins: [skewProtection()],
})
```

### Webpack

```js
// webpack.config.js
const skewProtection = require('@netlify/skew-protection-unplugin/webpack')

module.exports = {
  plugins: [skewProtection()],
}
```

### Rollup

```js
// rollup.config.js
import skewProtection from '@netlify/skew-protection-unplugin/rollup'

export default {
  plugins: [skewProtection()],
}
```

Alternatively, import the default export from the package root and call `.vite()`/`.webpack()`/`.rollup()` on it, useful
if you need to target more than one bundler from the same module:

```ts
import skewProtection from '@netlify/skew-protection-unplugin'

skewProtection.vite()
skewProtection.webpack()
skewProtection.rollup()
```

## How it works

- **Stamping**: lazily loaded JS chunks (via dynamic `import()`), lazily loaded CSS chunks (webpack only), and the
  initial `<script>`/`<link>` tags for your entry point, are requested with a deploy-pinning query parameter
  (`?nfdpl=<token>` by default). This is the only stamping this plugin performs — see "Known limitations" below for
  what's out of scope.
- **Manifest**: a `.netlify/v1/skew-protection.json` file is written per the
  [Frameworks API](https://docs.netlify.com/build/frameworks/frameworks-api/), telling Netlify's CDN to treat that query
  parameter as a skew protection token for URLs matching `patterns`.

The plugin is a **no-op** everywhere (all bundlers) when no token is available, so it's safe to leave enabled for local
development and for sites that haven't provisioned skew protection.

## Configuration options

| Option      | Type       | Default                                     | Description                                                                                                                                                                                                                                                                                                             |
| ----------- | ---------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseDir`   | `string`   | `process.cwd()`                             | The directory the `.netlify/v1/` folder is written into.                                                                                                                                                                                                                                                                |
| `paramName` | `string`   | `'nfdpl'`                                   | The name of the query parameter appended to matching asset URLs to pin them to this deploy. Written into `.netlify/v1/skew-protection.json` as a `query` source.                                                                                                                                                        |
| `patterns`  | `string[]` | `['.*\\.(js\|mjs\|cjs)$', '.*\\.css$']`     | Written verbatim into `.netlify/v1/skew-protection.json` as the URL paths Netlify's CDN should treat as skew-protected. Also gates whether this plugin stamps JS dynamic imports (see "Known limitations" — asset types other than JS/CSS are never actually stamped by this plugin, regardless of what's listed here). |
| `token`     | `string`   | `process.env.NETLIFY_SKEW_PROTECTION_TOKEN` | The skew protection token that identifies the current deploy. Netlify sets this automatically during production builds.                                                                                                                                                                                                 |

## Known limitations

- **Vite 8+ (Rolldown-based Vite) and bare Rolldown are not supported.** Vite 8 switched its bundler engine from Rollup
  to [Rolldown](https://rolldown.rs/), and Rolldown (as of v1.2.3) never invokes the `renderDynamicImport` plugin hook
  this plugin relies on to stamp lazily-loaded chunks. Installing this plugin under Vite 8 would silently no-op
  the chunk-stamping feature even though everything else (build, types) looks fine.
- **Only JS dynamic imports and entry `<script>`/`<link>` tags are stamped.** Images, fonts, and other static assets are
  never stamped, even if you add matching extensions to `patterns` — there's no hook here that rewrites `<img>` tags,
  CSS `url(...)` references, `@font-face`, or preload links.
  [Netlify Frameworks API example](https://docs.netlify.com/build/frameworks/frameworks-api/) includes image extensions
  alongside `js`/`css`, so if your framework needs those protected too, this plugin doesn't cover that case today.
- Vite's `import.meta.glob`/preload helper (`__vitePreload`) embeds asset URLs as string literals for CSS and
  shared-chunk preloads outside of `renderDynamicImport`, those are not currently stamped.
- Rspack and esbuild are not yet supported.
