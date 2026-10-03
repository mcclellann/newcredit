import type { FastifyInstance } from 'fastify'
import { loadScenarioDocumentData, type ScenarioId } from '@newcredit/test-fixtures'

export function multipart(content: Buffer, filename: string, type = 'application/pdf') {
  const boundary = 'newcredit-test-boundary'
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`), content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
  }
}

export async function uploadPack(app: FastifyInstance, applicationId: string, scenarioId: ScenarioId) {
  const fixture = await loadScenarioDocumentData(scenarioId)
  for (const document of fixture.documents) {
    const response = await app.inject({ method: 'POST', url: `/api/v1/applications/${applicationId}/documents`, ...multipart(document.bytes, document.file) })
    if (response.statusCode !== 201) throw new Error(`Upload failed: ${response.statusCode} ${response.body}`)
  }
  return fixture
}

export async function processPack(app: FastifyInstance, applicationId: string, scenarioId: ScenarioId) {
  const fixture = await loadScenarioDocumentData(scenarioId)
  let response
  for (const documentType of ['drivers_licence', 'payslip', 'bank_statement'] as const) {
    const documents = fixture.documents.filter((document: any) => document.document_type === documentType)
    if (documents.length === 0) continue
    for (const document of documents) {
      const upload = await app.inject({ method: 'POST', url: `/api/v1/applications/${applicationId}/documents?documentType=${documentType}`, ...multipart(document.bytes, document.file) })
      if (upload.statusCode !== 201) throw new Error(`Upload failed: ${upload.statusCode} ${upload.body}`)
    }
    response = await app.inject({ method: 'POST', url: `/api/v1/applications/${applicationId}/document-processing?documentType=${documentType}` })
    if (response.statusCode !== 200) throw new Error(`Processing failed: ${response.statusCode} ${response.body}`)
  }
  if (!response) throw new Error('Scenario has no document requirements')
  return response
}
