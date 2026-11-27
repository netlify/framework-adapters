export type BuildTarget = 'function' | 'edge' | 'server'

export interface BuildPluginOptions {
  /**
   * Where the server build deploys: a Netlify Function, Edge Function or
   * Server (default: `'function'`).
   */
  target?: BuildTarget
  /**
   * A display name for the serverless function or edge function deployed to Netlify
   * (default: `@netlify/vite-plugin server handler`).
   */
  displayName?: string
}
