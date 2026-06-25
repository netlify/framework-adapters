# @netlify/skew-protection-webpack-plugin

Pin a webpack SPA's JavaScript and CSS requests to the Netlify deploy they were built from, so that an already-open tab
keeps loading the chunks it expects after a newer deploy ships, eliminating "Loading chunk failed" version-skew errors.

## How it works

On a Netlify production build, the platform hands the build a signed deploy token via the
`NETLIFY_SKEW_PROTECTION_TOKEN` environment variable. This plugin:

1. **Appends `?nfdpl=<token>` to dynamically-loaded chunk URLs** by wrapping the webpack runtime's chunk-URL functions:
   `__webpack_require__.u` for JS chunks and `__webpack_require__.k` for async CSS chunks (mini-css-extract).
2. **Appends the same query to entry/initial `<script>`/`<link>` tags** emitted by `html-webpack-plugin`.
3. **Emits `.netlify/v1/skew-protection.json`**
   ([Frameworks API](https://docs.netlify.com/build/frameworks/frameworks-api/#netlifyv1skew-protectionjson)) declaring
   the `nfdpl` query source and the asset path patterns, so the Netlify edge reroutes matching requests to the pinned
   deploy.

When `NETLIFY_SKEW_PROTECTION_TOKEN` is absent or `"0"` (local dev, CLI deploys, unprovisioned sites), the plugin is a
complete no-op.

> **Note:** the query param is intentionally placed on **asset URLs only**, never a cookie. A cookie would ride every
> same-origin request and pin your API/XHR traffic to a stale deploy. The default `patterns` limit rerouting to JS and
> CSS files.

## Usage

```ts
import { NetlifySkewProtectionPlugin } from '@netlify/skew-protection-webpack-plugin'

export default {
  // ...
  plugins: [
    new HtmlWebpackPlugin({
      /* ... */
    }),
    new NetlifySkewProtectionPlugin(),
  ],
}
```

### Options

| Option      | Default                                     | Description                                                                                                  |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `token`     | `process.env.NETLIFY_SKEW_PROTECTION_TOKEN` | Deploy token baked into URLs. Plugin no-ops if absent/`"0"`.                                                 |
| `paramName` | `"nfdpl"`                                   | Query param name. Must match the emitted manifest's source.                                                  |
| `patterns`  | `[".*\\.(js\|css)$"]`                       | PCRE path patterns the edge reroutes on.                                                                     |
| `baseDir`   | `process.cwd()`                             | Where `.netlify/v1/` is written. Defaults to the build base dir; override only if your build runs elsewhere. |

## Requirements

- webpack 5
- `html-webpack-plugin` 5 (optional, only needed to pin entry/initial tags)
- The Netlify site must have skew protection provisioned, i.e. `NETLIFY_SKEW_PROTECTION_TOKEN` is populated in the
  production build env.
