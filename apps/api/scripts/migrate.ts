import { createDatabase, migrateDatabase } from '../src/db.js'

const database = createDatabase()
migrateDatabase(database.sqlite)
database.sqlite.close()
process.stdout.write('Database migrations are up to date.\n')
