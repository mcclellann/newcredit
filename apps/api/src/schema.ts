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
  outcomeSnapshot: text('outcome_snapshot').notNull(),
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
