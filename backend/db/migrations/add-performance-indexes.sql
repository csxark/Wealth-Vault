-- Migration: Add Performance Indexes
-- Description: Optimize database queries by adding indexes for commonly queried fields
-- Date: 2026-03-01

-- Expenses table indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_user_status_date ON expenses(user_id, status, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON expenses(payment_method);

-- Categories table indexes
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_user_active ON categories(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_category_id);

-- Goals table indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_tenant_id ON goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goals_category_id ON goals(category_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_deadline ON goals(deadline);
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_user_deadline ON goals(user_id, deadline);

-- Tenants table indexes
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Tenant Members table indexes
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_status ON tenant_members(status);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_user ON tenant_members(tenant_id, user_id);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);

-- Device Sessions table indexes
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_refresh_token ON device_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_device_sessions_is_active ON device_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_device_sessions_expires_at ON device_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_active ON device_sessions(user_id, is_active);

-- Token Blacklist table indexes
CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);

-- Full-text search indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_expenses_description_gin ON expenses USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_categories_name_gin ON categories USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_goals_title_gin ON goals USING gin(to_tsvector('english', title));

-- Composite indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_expenses_analytics ON expenses(user_id, date DESC, status, category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_analytics ON expenses(tenant_id, date DESC, status);

-- JSONB indexes for metadata queries (GIN indexes for JSONB)
CREATE INDEX IF NOT EXISTS idx_expenses_tags_gin ON expenses USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_goals_tags_gin ON goals USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_categories_metadata_gin ON categories USING gin(metadata);

-- Comments explaining the indexes
COMMENT ON INDEX idx_expenses_user_date IS 'Optimizes user expense listing queries with date sorting';
COMMENT ON INDEX idx_expenses_analytics IS 'Optimizes analytics and reporting queries';
COMMENT ON INDEX idx_expenses_description_gin IS 'Full-text search on expense descriptions';
COMMENT ON INDEX idx_categories_user_active IS 'Optimizes active category lookups per user';
COMMENT ON INDEX idx_goals_user_status IS 'Optimizes goal filtering by user and status';
