import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const demoSessions = sqliteTable('demo_sessions', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
})

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  status: text('status').notNull(),
  version: integer('version').notNull(),
  snapshot: text('snapshot').notNull(),
  outcomeSnapshot: text('outcome_snapshot'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const offers = sqliteTable('offers', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => applications.id),
  status: text('status').notNull(),
  snapshot: text('snapshot').notNull(),
}, (table) => [uniqueIndex('offers_application_id_unique').on(table.applicationId)])

export const disbursements = sqliteTable('disbursements', {
  id: text('id').primaryKey(),
  offerId: text('offer_id').notNull().references(() => offers.id),
  status: text('status').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('disbursements_offer_id_unique').on(table.offerId)])

export const idempotencyRecords = sqliteTable('idempotency_records', {
  operation: text('operation').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  resourceId: text('resource_id').notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: text('response_body').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [primaryKey({ columns: [table.operation, table.idempotencyKey] })])

export const applicationCorrections = sqliteTable('application_corrections', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => applications.id),
  field: text('field').notNull(), originalValue: text('original_value').notNull(),
  currentValue: text('current_value').notNull(), applicationVersion: integer('application_version').notNull(),
  createdAt: text('created_at').notNull(),
})

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(), applicationId: text('application_id').notNull().references(() => applications.id),
  sourceHash: text('source_hash').notNull(), mediaType: text('media_type').notNull(), storageKey: text('storage_key').notNull(),
  originalName: text('original_name').notNull(), documentType: text('document_type').notNull(), issuer: text('issuer').notNull(),
  periodStart: text('period_start'), periodEnd: text('period_end'), status: text('status').notNull(),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('documents_application_hash_unique').on(table.applicationId, table.sourceHash)])

export const documentChecks = sqliteTable('document_checks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: text('application_id').notNull().references(() => applications.id),
  documentId: text('document_id').references(() => documents.id),
  checkName: text('check_name').notNull(), status: text('status').notNull(),
  details: text('details').notNull(), data: text('data').notNull(),
})

export const extractedFields = sqliteTable('extracted_fields', {
  id: text('id').primaryKey(), applicationId: text('application_id').notNull().references(() => applications.id),
  documentId: text('document_id').notNull().references(() => documents.id), fieldName: text('field_name').notNull(),
  rawValue: text('raw_value').notNull(), normalizedValue: text('normalized_value'), confidence: text('confidence').notNull(),
  sourceLocation: text('source_location').notNull(), reviewRequired: integer('review_required').notNull().default(0),
})

export const applicationAuditEvents = sqliteTable('application_audit_events', {
  id: text('id').primaryKey(), applicationId: text('application_id').notNull().references(() => applications.id),
  sequence: integer('sequence').notNull(), type: text('type').notNull(), at: text('at').notNull(), details: text('details').notNull(),
}, (table) => [uniqueIndex('application_audit_events_sequence_unique').on(table.applicationId, table.sequence)])

export const documentExtractions = sqliteTable('document_extractions', {
  documentId: text('document_id').primaryKey().references(() => documents.id, { onDelete: 'cascade' }),
  parsed: text('parsed').notNull(),
})
