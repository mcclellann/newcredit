import { expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { migrateDatabase } from '../src/db.js'

it('retains legacy applications, offers and idempotency records during SQLite migration', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(`${readFileSync(new URL('../drizzle/0000_scenario_a.sql', import.meta.url), 'utf8')}\nPRAGMA user_version = 1;`)
    sqlite.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('legacy', 'scenario-a', 'submitted', 2, '{}', '{}', '2026-10-01', '2026-10-01')
    sqlite.prepare('INSERT INTO offers VALUES (?, ?, ?, ?)').run('offer', 'legacy', 'ready', '{}')
    sqlite.prepare('INSERT INTO idempotency_records VALUES (?, ?, ?, ?, ?, ?)').run('submission', 'legacy-key', 'legacy', 200, '{}', '2026-10-01')
    migrateDatabase(sqlite)
    expect(sqlite.prepare('SELECT scenario_id, outcome_snapshot FROM applications').get()).toEqual({ scenario_id: 'scenario-a', outcome_snapshot: '{}' })
    expect(sqlite.prepare('SELECT application_id FROM offers').get()).toEqual({ application_id: 'legacy' })
    expect(sqlite.prepare('SELECT resource_id FROM idempotency_records').get()).toEqual({ resource_id: 'legacy' })
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
  } finally { sqlite.close() }
})
