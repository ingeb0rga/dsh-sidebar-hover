/**
 * Build both halves of the plugin with esbuild (dev dependency only — the
 * runtime imports are all DSH module-table seeds resolved by `require`):
 *
 *   lib/index.js   node half  — ESM, all bare imports external (the host
 *                               loader maps @deepseek-ai/* to its own copies)
 *   lib/client.js  client half — CJS body wrapped in the __ModuleLoader__
 *                               closure-factory contract, same shape the
 *                               repo's tsdown.client.ts preset emits:
 *                               window.__ModuleLoader__.load({ id, factory: (require) => { … } })
 */
import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const watch = process.argv.includes('--watch')
const pkg = 'dsh-sidebar-hover'

const clientBanner = `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(pkg)},\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n`
const clientFooter = `    return module.exports;\n  }\n});\n`

/** Bare imports stay external everywhere; only relative sources are bundled. */
const externalFilter = (id) => !id.startsWith('.') && !id.startsWith('/')

await mkdir('lib', { recursive: true })

/** @type {import('esbuild').BuildOptions} */
const nodeOptions = {
  entryPoints: ['src/node/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  packages: 'external',
  sourcemap: 'external',
  logLevel: 'info',
}

/** @type {import('esbuild').BuildOptions} */
const clientOptions = {
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  banner: { js: clientBanner },
  footer: { js: clientFooter },
  external: ['@deepseek-ai/*', 'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  sourcemap: 'external',
  logLevel: 'info',
}

if (watch) {
  const nodeCtx = await context(nodeOptions)
  const clientCtx = await context(clientOptions)
  await Promise.all([nodeCtx.watch(), clientCtx.watch()])
  console.log('[dsh-sidebar-hover] watching…')
} else {
  await Promise.all([build(nodeOptions), build(clientOptions)])
}
