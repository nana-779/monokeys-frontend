import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const ts = require('typescript')
const output = path.join(root, '.tmp-payments-sdk-tests')
await fs.mkdir(output, { recursive: true })

// 애플리케이션 파일이나 환경변수를 변경하지 않고 순수 초기화 로직만 검사합니다.
for (const name of [
  'widgets-initializer',
  'widgets-initializer.test',
  'test-order-preparation',
  'test-order-preparation.test',
  'order-widget-rendering',
  'order-widget-rendering.test',
  'payment-request',
  'payment-request.test',
  'payment-result',
  'payment-result.test',
  'payment-confirmation',
  'payment-confirmation.test',
  'payment-result-flow',
  'payment-result-flow.test',
  'payment-result-approval.test',
]) {
  let code = await fs.readFile(path.join(root, `src/features/payments/${name}.ts`), 'utf8')
  code = code.replace("'./widgets-initializer'", "'./widgets-initializer.mjs'")
  code = code.replace("'./test-order-preparation'", "'./test-order-preparation.mjs'")
  code = code.replace("'./order-widget-rendering'", "'./order-widget-rendering.mjs'")
  code = code.replace("'./payment-request'", "'./payment-request.mjs'")
  code = code.replace("'./payment-result'", "'./payment-result.mjs'")
  code = code.replace("'./payment-confirmation'", "'./payment-confirmation.mjs'")
  code = code.replace("'./payment-result-flow'", "'./payment-result-flow.mjs'")
  const result = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  await fs.writeFile(path.join(output, `${name}.mjs`), result.outputText)
}

const result = spawnSync(
  process.execPath,
  [
    '--test',
    path.join(output, 'widgets-initializer.test.mjs'),
    path.join(output, 'test-order-preparation.test.mjs'),
    path.join(output, 'order-widget-rendering.test.mjs'),
    path.join(output, 'payment-request.test.mjs'),
    path.join(output, 'payment-result.test.mjs'),
    path.join(output, 'payment-confirmation.test.mjs'),
    path.join(output, 'payment-result-flow.test.mjs'),
    path.join(output, 'payment-result-approval.test.mjs'),
  ],
  {
    stdio: 'inherit',
  },
)
process.exitCode = result.status ?? 1
