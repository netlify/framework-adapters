# Netlify Framework Adapters

Netlify framework adapters for Nuxt, Vite, and TanStack Start

## Installation

This monorepo uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces/).

Start by installing the dependencies:

```sh
npm install
```

You can then build all the packages:

```sh
npm run build --workspaces=true
```

When working on the packages, it can be helpful to have them rebuild on change:

```sh
npm run dev
```

## Packages

| Name                                                                          | Description                                                   | Version                                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 🚀 [@netlify/nuxt](packages/nuxt-module)                                      | Nuxt module with a local emulation of the Netlify environment | [![npm version](https://img.shields.io/npm/v/@netlify/nuxt.svg)](https://www.npmjs.com/package/@netlify/nuxt)                              |
| 🔌 [@netlify/vite-plugin](packages/vite-plugin)                               | Vite plugin with a local emulation of the Netlify environment | [![npm version](https://img.shields.io/npm/v/@netlify/vite-plugin.svg)](https://www.npmjs.com/package/@netlify/vite-plugin)                |
| 🔌 [@netlify/vite-plugin-tanstack-start](packages/vite-plugin-tanstack-start) | Vite plugin for TanStack Start on Netlify                     | [![npm version](https://img.shields.io/npm/v/@netlify/vite-plugin.svg)](https://www.npmjs.com/package/@netlify/vite-plugin-tanstack-start) |
