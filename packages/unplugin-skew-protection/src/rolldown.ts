import { createRolldownPlugin } from 'unplugin'

import { unpluginFactory } from './main.js'

export type { ResolvedSkewProtectionOptions, SkewProtectionOptions } from './lib/options.js'
export type { SkewProtectionManifest } from './lib/manifest.js'

export default createRolldownPlugin(unpluginFactory)
