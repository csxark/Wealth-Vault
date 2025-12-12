import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Setting up Wealth Vault Environment Files...\n');

// Backend .env configuration
const backendEnvContent = `# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/wealth-vault

# JWT Configuration
JWT_SECRET=wealth-vault-super-secret-jwt-key-2024
JWT_EXPIRE=30d

# CORS Configuration
FRONTEND_URL=http://localhost:3000
`;

// Frontend .env configuration
const frontendEnvContent = `# Supabase Configuration (for future use)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# API Configuration
VITE_API_URL=http://localhost:5000/api

# Optional: Enable debug mode
VITE_DEBUG=false
`;

try {
  // Create backend .env
  const backendEnvPath = path.join(__dirname, 'backend', '.env');
  fs.writeFileSync(backendEnvPath, backendEnvContent);
  console.log('✅ Backend .env file created');

  // Create frontend .env
  const frontendEnvPath = path.join(__dirname, 'frontend', '.env');
  fs.writeFileSync(frontendEnvPath, frontendEnvContent);
  console.log('✅ Frontend .env file created');

  console.log('\n🎉 Environment setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Start MongoDB (if not already running)');
  console.log('2. Run: cd backend && npm install && npm run dev');
  console.log('3. Run: cd frontend && npm install && npm run dev');
  console.log('4. Test API connection with: node test-api.js');

} catch (error) {
  console.error('❌ Error setting up environment:', error.message);
  process.exit(1);
}
