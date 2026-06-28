-- Migration: Add Smart Expense Categorization & Merchant Recognition Tables
-- Issue #639: Smart Expense Categorization & Merchant Recognition

-- Enhance merchants table with additional fields
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS logo_url_hd TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3, 2) DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS category_primary TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS category_secondary TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_subscription_service BOOLEAN DEFAULT FALSE;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS subscription_frequency TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS merchant_type TEXT DEFAULT 'general'; -- 'retail', 'subscription', 'bill', 'restaurant', etc.
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS merchant_aliases JSONB DEFAULT '[]'::jsonb; -- Store alternative names
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS merchant_keywords JSONB DEFAULT '[]'::jsonb; -- Keywords for matching
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS global_metadata JSONB DEFAULT '{}'; -- Store global merchant data

-- Create merchant ratings table
CREATE TABLE IF NOT EXISTS merchant_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating NUMERIC(2, 1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    feedback_type TEXT, -- 'positive', 'negative', 'neutral'
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(merchant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_ratings_user ON merchant_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_ratings_merchant ON merchant_ratings(merchant_id);

-- Create expense corrections table for training loop
CREATE TABLE IF NOT EXISTS expense_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    corrected_category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    confidence_before NUMERIC(5, 4),
    confidence_after NUMERIC(5, 4),
    reason TEXT, -- 'user_correction', 'ai_suggestion', 'rule_applied'
    feedback TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_corrections_user ON expense_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_corrections_expense ON expense_corrections(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_corrections_date ON expense_corrections(created_at);

-- Create OCR results table
CREATE TABLE IF NOT EXISTS ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
    receipt_file_url TEXT NOT NULL,
    extracted_merchant TEXT,
    extracted_amount NUMERIC(12, 2),
    extracted_date TIMESTAMP,
    extracted_description TEXT,
    ocr_confidence NUMERIC(5, 4),
    extraction_raw JSONB, -- Raw OCR output
    validation_status TEXT DEFAULT 'pending', -- 'pending', 'valid', 'invalid', 'requires_review'
    validation_notes TEXT,
    processed_by TEXT DEFAULT 'tesseract', -- OCR engine used
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_expense ON ocr_results(expense_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_status ON ocr_results(validation_status);
CREATE INDEX IF NOT EXISTS idx_ocr_results_date ON ocr_results(created_at);

-- Create category suggestions table
CREATE TABLE IF NOT EXISTS category_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggested_category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    confidence_score NUMERIC(5, 4) NOT NULL,
    suggestion_source TEXT NOT NULL, -- 'merchant_pattern', 'ml_model', 'rule_based', 'historical'
    alternative_predictions JSONB, -- Store top-3 alternatives with scores
    was_accepted BOOLEAN DEFAULT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_category_suggestions_user ON category_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_category_suggestions_expense ON category_suggestions(expense_id);
CREATE INDEX IF NOT EXISTS idx_category_suggestions_confidence ON category_suggestions(confidence_score);

-- Create merchant logos table
CREATE TABLE IF NOT EXISTS merchant_logos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    logo_url TEXT NOT NULL,
    logo_url_hd TEXT,
    color_primary TEXT,
    color_secondary TEXT,
    logo_source TEXT DEFAULT 'user', -- 'user', 'system', 'external_api'
    is_verified BOOLEAN DEFAULT FALSE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_logos_merchant ON merchant_logos(merchant_id);

-- Create receipt metadata table
CREATE TABLE IF NOT EXISTS receipt_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ocr_result_id UUID NOT NULL REFERENCES ocr_results(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    file_name TEXT,
    file_size INTEGER,
    file_type TEXT, -- 'pdf', 'jpg', 'png', etc.
    image_width INTEGER,
    image_height INTEGER,
    image_quality TEXT, -- 'poor', 'fair', 'good', 'excellent'
    detected_language TEXT DEFAULT 'en',
    has_qr_code BOOLEAN DEFAULT FALSE,
    qr_code_value TEXT,
    store_location TEXT,
    payment_method_detected TEXT,
    currency_detected TEXT,
    items_detected JSONB, -- Array of detected items
    tax_amount NUMERIC(12, 2),
    total_amount NUMERIC(12, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_metadata_ocr ON receipt_metadata(ocr_result_id);
CREATE INDEX IF NOT EXISTS idx_receipt_metadata_expense ON receipt_metadata(expense_id);

-- Add columns to categorization_rules for enhanced functionality
ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS rule_type TEXT DEFAULT 'custom'; -- 'custom', 'system', 'learned'
ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS matching_algorithm TEXT DEFAULT 'exact'; -- 'exact', 'fuzzy', 'regex', 'semantic'
ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS is_machine_learned BOOLEAN DEFAULT FALSE;
ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS accuracy_score NUMERIC(5, 4);
ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS false_positive_count INTEGER DEFAULT 0;
ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;
ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;

-- Enhance categorization_patterns table
ALTER TABLE categorization_patterns ADD COLUMN IF NOT EXISTS pattern_type TEXT DEFAULT 'merchant'; -- 'merchant', 'keyword', 'amount', 'hybrid'
ALTER TABLE categorization_patterns ADD COLUMN IF NOT EXISTS false_positive_count INTEGER DEFAULT 0;
ALTER TABLE categorization_patterns ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMP;
ALTER TABLE categorization_patterns ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE categorization_patterns ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Add columns to expenses for tracking smart categorization
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS auto_categorized BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS categorization_score NUMERIC(5, 4);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS merchant_recognized BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_prediction JSONB; -- Store recurring prediction data
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ocr_result_id UUID REFERENCES ocr_results(id) ON DELETE SET NULL;

-- Create training data snapshot table for ML model improvement
CREATE TABLE IF NOT EXISTS categorization_training_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    total_expenses_used INTEGER,
    total_corrections INTEGER,
    model_accuracy NUMERIC(5, 4),
    model_precision NUMERIC(5, 4),
    model_recall NUMERIC(5, 4),
    f1_score NUMERIC(5, 4),
    top_categories JSONB, -- Categories with most volume
    improvements_made TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_training_snapshots_user ON categorization_training_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_training_snapshots_date ON categorization_training_snapshots(snapshot_date);

-- Create merchant frequency table for recurring detection
CREATE TABLE IF NOT EXISTS merchant_frequency_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    frequency_type TEXT NOT NULL, -- 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
    average_days_between NUMERIC(8, 2),
    average_amount NUMERIC(12, 2),
    last_occurrence_date TIMESTAMP,
    next_predicted_date TIMESTAMP,
    confidence_score NUMERIC(5, 4),
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_frequency_user ON merchant_frequency_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_frequency_merchant ON merchant_frequency_patterns(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_frequency_type ON merchant_frequency_patterns(frequency_type);
