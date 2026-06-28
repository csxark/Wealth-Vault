/**
 * Multi-Tenancy Support Migration
 * 
 * This migration adds multi-tenancy support to the database by:
 * 1. Creating tenants and tenant_members tables
 * 2. Adding tenant_id foreign keys to existing tables
 * 3. Creating indexes for tenant isolation
 */

import db from '../../config/db.js';
import { sql } from 'drizzle-orm';

export async function up() {
  try {
    console.log('🚀 Starting multi-tenancy migration...\n');

    // 1. Create enum for tenant roles
    console.log('📝 Creating tenant_role enum...');
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE tenant_role AS ENUM ('owner', 'admin', 'manager', 'member', 'viewer');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ tenant_role enum created\n');

    // 2. Create tenants table
    console.log('📝 Creating tenants table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        logo TEXT,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status TEXT DEFAULT 'active',
        tier TEXT DEFAULT 'free',
        max_members INTEGER DEFAULT 5,
        max_projects INTEGER DEFAULT 3,
        features JSONB DEFAULT '{"ai": false, "customReports": false, "teamCollaboration": false, "advancedAnalytics": false}'::jsonb,
        settings JSONB DEFAULT '{"currency": "USD", "timezone": "UTC", "language": "en", "theme": "auto"}'::jsonb,
        metadata JSONB DEFAULT '{"createdBy": "system", "lastModified": null, "joinCode": null}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ tenants table created\n');

    // 3. Create tenant_members table
    console.log('📝 Creating tenant_members table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tenant_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role tenant_role DEFAULT 'member',
        permissions JSONB DEFAULT '[]'::jsonb,
        status TEXT DEFAULT 'active',
        invite_token TEXT,
        invite_expires_at TIMESTAMP,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, user_id)
      );
    `);
    console.log('✅ tenant_members table created\n');

    // 4. Add tenant_id to categories
    console.log('📝 Adding tenant_id column to categories...');
    await db.execute(sql`
      ALTER TABLE categories
      ADD COLUMN IF NOT EXISTS tenant_id UUID;
    `);
    
    // Backfill tenant_id: Create a default tenant per user for migration
    console.log('📝 Backfilling tenant_id for existing categories...');
    await db.execute(sql`
      -- For each user without a tenant, create one
      INSERT INTO tenants (id, name, slug, owner_id)
      SELECT 
        gen_random_uuid(),
        u.first_name || ' Tenant',
        (u.id::text || '-' || u.email)::text,
        u.id
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM (SELECT DISTINCT owner_id FROM tenants) t WHERE t.owner_id = u.id
      )
      ON CONFLICT DO NOTHING;
    `);

    // Assign categories to user's tenant
    await db.execute(sql`
      UPDATE categories c
      SET tenant_id = (
        SELECT t.id FROM tenants t
        WHERE t.owner_id = c.user_id
        LIMIT 1
      )
      WHERE c.tenant_id IS NULL;
    `);
    
    // Add FK constraint
    await db.execute(sql`
      ALTER TABLE categories
      ADD CONSTRAINT categories_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    // Make tenant_id NOT NULL
    await db.execute(sql`
      ALTER TABLE categories
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
    console.log('✅ tenant_id added to categories\n');

    // 5. Add tenant_id to expenses
    console.log('📝 Adding tenant_id column to expenses...');
    await db.execute(sql`
      ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS tenant_id UUID;
    `);
    
    // Backfill
    await db.execute(sql`
      UPDATE expenses e
      SET tenant_id = (
        SELECT t.id FROM tenants t
        WHERE t.owner_id = e.user_id
        LIMIT 1
      )
      WHERE e.tenant_id IS NULL;
    `);
    
    // Add FK and constraint
    await db.execute(sql`
      ALTER TABLE expenses
      ADD CONSTRAINT expenses_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.execute(sql`
      ALTER TABLE expenses
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
    console.log('✅ tenant_id added to expenses\n');

    // 6. Add tenant_id to goals
    console.log('📝 Adding tenant_id column to goals...');
    await db.execute(sql`
      ALTER TABLE goals
      ADD COLUMN IF NOT EXISTS tenant_id UUID;
    `);
    
    // Backfill
    await db.execute(sql`
      UPDATE goals g
      SET tenant_id = (
        SELECT t.id FROM tenants t
        WHERE t.owner_id = g.user_id
        LIMIT 1
      )
      WHERE g.tenant_id IS NULL;
    `);
    
    // Add FK and constraint
    await db.execute(sql`
      ALTER TABLE goals
      ADD CONSTRAINT goals_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    
    await db.execute(sql`
      ALTER TABLE goals
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
    console.log('✅ tenant_id added to goals\n');

    // 7. Create indexes for tenant isolation and performance
    console.log('📝 Creating indexes for tenant isolation...');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_user ON tenant_members(tenant_id, user_id);
      
      CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_categories_tenant_user ON categories(tenant_id, user_id);
      
      CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_tenant_user ON expenses(tenant_id, user_id);
      
      CREATE INDEX IF NOT EXISTS idx_goals_tenant_id ON goals(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_goals_tenant_user ON goals(tenant_id, user_id);
      
      CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON tenants(owner_id);
      CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    `);
    console.log('✅ Indexes created\n');

    // 8. Add tenant_id to device_sessions if it exists
    console.log('📝 Adding tenant_id column to device_sessions...');
    try {
      await db.execute(sql`
        ALTER TABLE device_sessions
        ADD COLUMN IF NOT EXISTS tenant_id UUID;
      `);
      
      // Backfill
      await db.execute(sql`
        UPDATE device_sessions ds
        SET tenant_id = (
          SELECT t.id FROM tenants t
          WHERE t.owner_id = ds.user_id
          LIMIT 1
        )
        WHERE ds.tenant_id IS NULL;
      `);
      
      // Add FK and constraint
      await db.execute(sql`
        ALTER TABLE device_sessions
        ADD CONSTRAINT device_sessions_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      `);
      
      await db.execute(sql`
        ALTER TABLE device_sessions
        ALTER COLUMN tenant_id SET NOT NULL;
      `);
      console.log('✅ tenant_id added to device_sessions\n');
    } catch (err) {
      console.log('ℹ️  device_sessions table not found or already updated\n');
    }

    console.log('✨ Multi-tenancy migration completed successfully!\n');
    console.log('📋 Summary:');
    console.log('  ✓ Created tenants table');
    console.log('  ✓ Created tenant_members table');
    console.log('  ✓ Added tenant_id to categories, expenses, goals, device_sessions');
    console.log('  ✓ Created performance indexes');
    console.log('  ✓ Created default tenant per existing user\n');
    
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

export async function down() {
  try {
    console.log('🔄 Rolling back multi-tenancy migration...\n');

    // Drop constraints
    console.log('📝 Dropping constraints...');
    await db.execute(sql`
      ALTER TABLE device_sessions DROP CONSTRAINT IF EXISTS device_sessions_tenant_id_fkey;
      ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_tenant_id_fkey;
      ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_tenant_id_fkey;
      ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_tenant_id_fkey;
    `);

    // Drop columns
    console.log('📝 Dropping tenant_id columns...');
    await db.execute(sql`
      ALTER TABLE device_sessions DROP COLUMN IF EXISTS tenant_id;
      ALTER TABLE goals DROP COLUMN IF EXISTS tenant_id;
      ALTER TABLE expenses DROP COLUMN IF EXISTS tenant_id;
      ALTER TABLE categories DROP COLUMN IF EXISTS tenant_id;
    `);

    // Drop tables
    console.log('📝 Dropping tables...');
    await db.execute(sql`
      DROP TABLE IF EXISTS tenant_members;
      DROP TABLE IF EXISTS tenants;
    `);

    // Drop enum
    console.log('📝 Dropping enum...');
    await db.execute(sql`
      DROP TYPE IF EXISTS tenant_role;
    `);

    console.log('✨ Rollback completed successfully!\n');
    return true;
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
}
