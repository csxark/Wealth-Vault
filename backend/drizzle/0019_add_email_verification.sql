-- Add email verification fields to users table
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN email_verification_token TEXT;
ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP;

-- Create index for email verification token for faster lookups
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token) WHERE email_verification_token IS NOT NULL;

-- Create index for email verification expires for cleanup
CREATE INDEX idx_users_email_verification_expires ON users(email_verification_expires) WHERE email_verification_expires IS NOT NULL;