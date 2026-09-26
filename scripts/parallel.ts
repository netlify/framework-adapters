import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import pkg from '../package.json' with { type: 'json' }

const args = process.argv.slice(2)
if (!args.length) {
  console.error('Usage: npm run parallel <command>')
  throw new Error('No command provided')
}
const cmd = args.join(' ')
const { FORCE_COLOR: forceColor } = process.env
const FORCE_COLOR = forceColor !== undefined && ['0', 'false', ''].includes(forceColor) ? undefined : '1'
await Promise.all(
  pkg.workspaces.map((cwd, index) => {
    const name = cwd.split('/').pop()
    const actor = spawn(cmd, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR },
    })
    const color = `\x1b[${String(31 + (index % 6))}m`
    const reset = '\x1b[0m'
    const prefix = `${color}[${name ?? cwd}]${reset} `

    createInterface({ input: actor.stdout }).on('line', (line) => {
      process.stdout.write(`${prefix}${line}\n`)
    })
    createInterface({ input: actor.stderr }).on('line', (line) => {
      process.stderr.write(`${prefix}${line}\n`)
    })

    return new Promise<void>((resolve, reject) => {
      actor.on('error', reject)
      actor.on('close', (code, signal) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`${cmd} failed in ${cwd} (${signal ?? `exit code ${String(code)}`})`))
        }
      })
    })
  }),
)
