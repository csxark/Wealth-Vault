#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Wealth Vault Database Verification');
console.log('=====================================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found!');
  console.log('Please run "npm run setup" first to configure your environment variables.\n');
  process.exit(1);
}

// Read and parse .env file
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};

envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value && !key.startsWith('#')) {
    envVars[key.trim()] = value.trim();
  }
});

// Check required environment variables
const requiredVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missingVars = requiredVars.filter(varName => !envVars[varName]);

if (missingVars.length > 0) {
  console.log('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.log(`   - ${varName}`));
  console.log('\nPlease run "npm run setup" to configure these variables.\n');
  process.exit(1);
}

console.log('✅ Environment variables configured');
console.log(`   Supabase URL: ${envVars.VITE_SUPABASE_URL.substring(0, 30)}...`);
console.log(`   Anon Key: ${envVars.VITE_SUPABASE_ANON_KEY.substring(0, 20)}...\n`);

// Check if schema file exists
const schemaPath = path.join(__dirname, 'supabase-schema.sql');
if (!fs.existsSync(schemaPath)) {
  console.log('❌ Database schema file not found!');
  console.log('Please ensure supabase-schema.sql exists in the frontend directory.\n');
  process.exit(1);
}

console.log('✅ Database schema file found');
console.log('   Run the contents of supabase-schema.sql in your Supabase SQL editor\n');

// Check package.json for required dependencies
const packagePath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packagePath)) {
  console.log('❌ package.json not found!');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const requiredDeps = ['@supabase/supabase-js'];
const missingDeps = requiredDeps.filter(dep => !packageJson.dependencies[dep]);

if (missingDeps.length > 0) {
  console.log('❌ Missing required dependencies:');
  missingDeps.forEach(dep => console.log(`   - ${dep}`));
  console.log('\nPlease run "npm install" to install dependencies.\n');
  process.exit(1);
}

console.log('✅ Required dependencies installed\n');

console.log('🎯 Next Steps:');
console.log('1. Go to your Supabase dashboard');
console.log('2. Navigate to SQL Editor');
console.log('3. Copy and paste the contents of supabase-schema.sql');
console.log('4. Run the SQL script');
console.log('5. Start the app with "npm run dev"');
console.log('\n�� Happy coding!'); 