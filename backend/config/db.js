
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
let dbWarningShown = false;

if (!connectionString && !dbWarningShown) {
    console.warn('⚠️ DATABASE_URL not found, using default local connection');
    console.log('📝 Please set DATABASE_URL in your .env file for production');
    dbWarningShown = true;
}

// Use fallback for development
const dbUrl = connectionString || 'postgres://postgres:password@localhost:5432/wealth_vault';

// Test database connection (non-blocking, one time)
let connectionTested = false;
const testConnection = async () => {
    if (connectionTested) return;
    connectionTested = true;
    
    try {
        const testClient = postgres(dbUrl, { prepare: false });
        await testClient`SELECT 1`;
        console.log('✅ Database connection successful');
        await testClient.end();
    } catch (error) {
        console.warn('⚠️ Database connection failed - Server will continue but database operations may fail');
    }
};

// Test connection without blocking startup
setTimeout(testConnection, 1000);

const client = postgres(dbUrl, { prepare: false });
const db = drizzle(client, { schema });

export { client, db };
export default db;
