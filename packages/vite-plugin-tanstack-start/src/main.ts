import type { Plugin } from 'vite'
import createNetlifyPlugin, { type BuildTarget, type NetlifyPluginOptions } from '@netlify/vite-plugin'

type DevOptions = Omit<NetlifyPluginOptions, 'build' | 'middleware'>

export interface PluginOptions {
  /**
   * Where the server build deploys: a Netlify Function, Edge Function or
   * Server (default: `'function'`).
   */
  target?: BuildTarget
  /**
   * Optional configuration of Netlify dev features
   * @see {link https://www.npmjs.com/package/@netlify/vite-plugin}
   */
  dev?: DevOptions
}

export default function createNetlifyTanstackStartPlugin(options: PluginOptions = {}): Plugin[] {
  const netlifyPlugin = createNetlifyPlugin({
    build: {
      enabled: true,
      target: options.target,
    },
    ...options.dev,
  }) as Plugin[]
  return netlifyPlugin
}
