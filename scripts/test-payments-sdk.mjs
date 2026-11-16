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
for (const name of ['widgets-initializer', 'widgets-initializer.test']) {
  let code = await fs.readFile(path.join(root, `src/features/payments/${name}.ts`), 'utf8')
  code = code.replace("'./widgets-initializer'", "'./widgets-initializer.mjs'")
  const result = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  await fs.writeFile(path.join(output, `${name}.mjs`), result.outputText)
}

const result = spawnSync(
  process.execPath,
  ['--test', path.join(output, 'widgets-initializer.test.mjs')],
  {
    stdio: 'inherit',
  },
)
process.exitCode = result.status ?? 1
