
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
// Fallback for development if not set, though it should be set
const defaultUrl = 'postgres://postgres:postgres@localhost:5432/wealth-vault';

if (!connectionString) {
    console.warn('DATABASE_URL is not defined, using default local URL');
}

// Disable prefetch as it is not supported for "Transaction" pool mode in Supabase
const client = postgres(connectionString || defaultUrl, { prepare: false });
const db = drizzle(client, { schema });

export { client };
export default db;
