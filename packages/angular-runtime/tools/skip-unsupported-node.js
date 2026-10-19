import process from 'node:process'

import { satisfies } from 'semver'

import pkg from '../package.json' with { type: 'json' }

/**
 * Decides whether this package's tests should run on the Node version in use.
 *
 * Exits 0 when they should be *skipped* and non-zero when they should run, so a caller can
 * short-circuit with `node tools/skip-unsupported-node.js || <command>` and still report
 * success on a skip. The inverted-looking exit code is deliberate: `&&` would make a skip
 * indistinguishable from a test failure, and `!` negation is not available in the cmd.exe
 * shell npm uses on Windows.
 *
 * This package needs a newer Node than the rest of the monorepo, so it opts itself out of
 * the older CI matrix entries here. That keeps the workflow free of a hand-maintained list
 * of workspaces to run, which would silently go stale as packages are added or their
 * supported Node ranges change.
 */
if (satisfies(process.version, pkg.engines.node)) {
  process.exitCode = 1
} else {
  console.log(`Skipping tests: ${pkg.name} requires Node ${pkg.engines.node}, but ${process.version} is running.`)
}
