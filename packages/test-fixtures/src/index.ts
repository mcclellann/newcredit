import { readFile } from 'node:fs/promises'

export type ScenarioId = 'scenario-a' | 'scenario-b' | 'scenario-c' | 'scenario-h'

/** Sample PDFs are input data only; never load expected outcomes into an application. */
export async function loadScenarioDocumentData(scenarioId: ScenarioId) {
  const root = new URL(`../../../data/synthetic/scenarios/${scenarioId}/`, import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('documents/manifest.json', root), 'utf8'))
  const documents = await Promise.all(manifest.documents.map(async (document: any) => ({
    ...document,
    bytes: await readFile(new URL(document.file, root)),
  })))
  return { manifest, documents }
}
