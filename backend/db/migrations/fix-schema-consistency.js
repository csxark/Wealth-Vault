import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL is required for migration');
  process.exit(1);
}

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client);

/**
 * Migration to fix database schema inconsistencies
 * Run this script to update existing data to match new schema
 */
async function runMigration() {
  console.log('🚀 Starting database schema consistency migration...');

  try {
    // 1. Fix currency inconsistency - Update expenses with INR to use user's currency
    console.log('📝 Fixing currency inconsistencies...');
    await client`
      UPDATE expenses 
      SET currency = users.currency 
      FROM users 
      WHERE expenses.user_id = users.id 
      AND expenses.currency = 'INR'
    `;

    // 2. Standardize metadata structure for expenses
    console.log('📝 Standardizing metadata structure...');
    await client`
      UPDATE expenses 
      SET metadata = jsonb_build_object(
        'createdBy', 'migration',
        'lastModified', NOW(),
        'version', 1,
        'flags', '[]'::jsonb,
        'legacy', COALESCE(metadata, '{}'::jsonb)
      )
      WHERE metadata IS NULL OR NOT (metadata ? 'version')
    `;

    // 3. Update categories metadata to match standard structure
    await client`
      UPDATE categories 
      SET metadata = jsonb_build_object(
        'createdBy', 'system',
        'lastModified', NOW(),
        'version', 1,
        'flags', '[]'::jsonb,
        'usageCount', COALESCE((metadata->>'usageCount')::int, 0),
        'lastUsed', metadata->>'lastUsed',
        'averageAmount', COALESCE((metadata->>'averageAmount')::numeric, 0)
      )
      WHERE metadata IS NOT NULL
    `;

    // 4. Update goals metadata to match standard structure
    await client`
      UPDATE goals 
      SET metadata = jsonb_build_object(
        'createdBy', 'user',
        'lastModified', NOW(),
        'version', 1,
        'flags', '[]'::jsonb,
        'lastContribution', metadata->>'lastContribution',
        'totalContributions', COALESCE((metadata->>'totalContributions')::int, 0),
        'averageContribution', COALESCE((metadata->>'averageContribution')::numeric, 0),
        'streakDays', COALESCE((metadata->>'streakDays')::int, 0)
      )
      WHERE metadata IS NOT NULL
    `;

    // 5. Add indexes for better performance
    console.log('📝 Adding performance indexes...');
    await client`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC)`;
    await client`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_category ON expenses(category_id) WHERE category_id IS NOT NULL`;
    await client`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goals_user_status ON goals(user_id, status)`;
    await client`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categories_user_type ON categories(user_id, type)`;

    // 6. Add check constraints for data validation
    console.log('📝 Adding data validation constraints...');
    await client`
      ALTER TABLE expenses 
      ADD CONSTRAINT IF NOT EXISTS chk_expenses_amount_positive 
      CHECK (amount > 0)
    `;

    await client`
      ALTER TABLE goals 
      ADD CONSTRAINT IF NOT EXISTS chk_goals_target_positive 
      CHECK (target_amount > 0)
    `;

    await client`
      ALTER TABLE goals 
      ADD CONSTRAINT IF NOT EXISTS chk_goals_current_non_negative 
      CHECK (current_amount >= 0)
    `;

    console.log('✅ Migration completed successfully!');
    console.log('📊 Summary:');
    console.log('  - Fixed currency inconsistencies');
    console.log('  - Standardized metadata structure');
    console.log('  - Added performance indexes');
    console.log('  - Added data validation constraints');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log('🎉 Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { runMigration };