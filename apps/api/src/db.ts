import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as schema from './schema.js'

export type ApiDatabase = {
  sqlite: Database.Database
  orm: BetterSQLite3Database<typeof schema>
}

export function createDatabase(filename = process.env.DATABASE_URL ?? 'newcredit.sqlite'): ApiDatabase {
  const sqlite = new Database(filename)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  return { sqlite, orm: drizzle(sqlite, { schema }) }
}

export function migrateDatabase(sqlite: Database.Database): void {
  if (sqlite.pragma('user_version', { simple: true }) === 0) {
    const migration = fileURLToPath(new URL('../drizzle/0000_scenario_a.sql', import.meta.url))
    sqlite.exec(`BEGIN IMMEDIATE;\n${readFileSync(migration, 'utf8')}\nPRAGMA user_version = 1;\nCOMMIT;`)
  }
}
