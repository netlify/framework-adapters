# @netlify/vite-plugin

Vite plugin that emulates Netlify's platform features within your Vite dev server.

## Feature Support

| Feature                | Supported |
| ---------------------- | --------- |
| Functions              | ✅ Yes    |
| Edge Functions         | ✅ Yes    |
| Blobs                  | ✅ Yes    |
| Cache API              | ✅ Yes    |
| AI Gateway             | ✅ Yes    |
| Database               | ✅ Yes    |
| Redirects and Rewrites | ✅ Yes    |
| Headers                | ✅ Yes    |
| Environment Variables  | ✅ Yes    |
| Image CDN              | ✅ Yes    |

> This module is **not** intended to be a full replacement for the Netlify CLI.

## Installation

```bash
npm install -D @netlify/vite-plugin
```

## Usage

Add the plugin to your `vite.config.js` or `vite.config.ts`:

```js
import { defineConfig } from 'vite'
import netlify from '@netlify/vite-plugin'

export default defineConfig({
  plugins: [netlify()],
})
```

## Configuration options

The plugin accepts the following options:

- `middleware` (boolean, default: `true`): Attach a Vite middleware that intercepts requests and handles them in the
  same way as the Netlify production environment
- `blobs`: Configure blob storage functionality
- `edgeFunctions`: Configure edge functions
- `functions`: Configure serverless functions
- `headers`: Configure response headers
- `images`: Configure Image CDN functionality
- `redirects`: Configure URL redirects
- `staticFiles`: Configure static file serving

### EXPERIMENTAL: Building your app for deployment

The `build` options prepare your app's server build for deployment to Netlify, so you don't need a framework-specific
adapter or plugin. They're currently supported for TanStack Start and SolidStart 2 projects.

- `build.enabled` (boolean, default: `false`): Prepare the server build for deployment to Netlify
- `build.displayName` (string, default: `@netlify/vite-plugin server handler`): A display name for the serverless
  function or edge function deployed to Netlify

```js
import { defineConfig } from 'vite'
import netlify from '@netlify/vite-plugin'

export default defineConfig({
  plugins: [netlify({ build: { enabled: true } })],
})
```
