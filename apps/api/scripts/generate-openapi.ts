import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../src/app.js'

const app = await buildApp({ databaseUrl: ':memory:', migrate: true })
const output = fileURLToPath(new URL('../openapi.json', import.meta.url))
await writeFile(output, `${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()
process.stdout.write(`Wrote ${output}\n`)
