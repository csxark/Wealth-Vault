
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runMigrate = async () => {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL is not defined');
    }

    const migrationClient = postgres(connectionString, { max: 1 });
    const db = drizzle(migrationClient);

    console.log('⏳ Running migrations...');

    await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });

    console.log('✅ Migrations completed!');

    await migrationClient.end();
    process.exit(0);
};

runMigrate().catch((err) => {
    console.error('❌ Migration failed!', err);
    process.exit(1);
});

export { runMigrate as migrate };
