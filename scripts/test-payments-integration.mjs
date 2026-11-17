import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url), ts = require('typescript')
const output = path.join(root, '.tmp-payments-integration-tests')
await fs.mkdir(output, { recursive: true })
const names = ['test-order-preparation', 'order-widget-rendering', 'payment-request', 'payment-result', 'payment-confirmation', 'payment-result-flow', 'payment-flow-integration.test']
for (const name of names) {
  let code = await fs.readFile(path.join(root, `src/features/payments/${name}.ts`), 'utf8')
  for (const dependency of names) code = code.replaceAll(`'./${dependency}'`, `'./${dependency}.mjs'`)
  await fs.writeFile(path.join(output, name + '.mjs'), ts.transpileModule(code,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
}
// Requires backend clean build first, which emits build/stage10/contract.json. No network access.
const result = spawnSync(process.execPath, ['--test', path.join(output, 'payment-flow-integration.test.mjs')], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
