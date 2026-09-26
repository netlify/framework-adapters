/**
 * These utils allow vite-ecosystem-ci to run our tests against arbitrary releases of vite/rolldown/vitest/etc.
 */

// vite-ecosystem-ci injects overrides in the root package.json
import rootPkg from '../../../../package.json' with { type: 'json' }

export const COPY_OVERRIDES_TO_FIXTURES = process.env.COPY_OVERRIDES_TO_FIXTURES === 'true'

interface PackageWithOverrides {
  overrides?: Record<string, string>
}

export function getPackageOverrides(): NonNullable<PackageWithOverrides['overrides']> {
  const packageJson = rootPkg as PackageWithOverrides

  if (!COPY_OVERRIDES_TO_FIXTURES) {
    throw new Error('COPY_OVERRIDES_TO_FIXTURES is not set to true, aborting.')
  }
  if (!packageJson.overrides) {
    throw new Error('No overrides found in package.json, aborting.')
  }

  return packageJson.overrides
}
