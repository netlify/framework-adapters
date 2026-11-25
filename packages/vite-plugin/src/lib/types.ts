export type BuildTarget = 'function' | 'edge' | 'server'

export type BuildTargetOptions =
  | {
      /**
       * Where the server build deploys: a Netlify Function, Edge Function or
       * Server (default: `'function'`).
       */
      target?: BuildTarget
      edgeSSR?: never
    }
  | {
      target?: never
      /**
       * Deploy SSR handler to Netlify Edge Functions instead of Netlify Functions (default: false).
       *
       * @deprecated Use `target: 'edge'` instead.
       */
      edgeSSR?: boolean
    }

export type BuildPluginOptions = BuildTargetOptions & {
  /**
   * A display name for the serverless function or edge function deployed to Netlify
   * (default: `@netlify/vite-plugin server handler`).
   */
  displayName?: string
}
