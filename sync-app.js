import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Wealth Vault App Synchronization Script\n');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Function to run commands
function runCommand(command, args, cwd, name) {
  return new Promise((resolve, reject) => {
    log(`🔄 Running: ${command} ${args.join(' ')}`, 'cyan');
    
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ ${name} completed successfully`, 'green');
        resolve();
      } else {
        log(`❌ ${name} failed with code ${code}`, 'red');
        reject(new Error(`${name} failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      log(`❌ ${name} error: ${error.message}`, 'red');
      reject(error);
    });
  });
}

// Function to check if file exists
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

// Function to create environment files
function createEnvFiles() {
  log('📝 Creating environment files...', 'yellow');
  
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
    if (!fileExists(backendEnvPath)) {
      fs.writeFileSync(backendEnvPath, backendEnvContent);
      log('✅ Backend .env file created', 'green');
    } else {
      log('ℹ️  Backend .env file already exists', 'blue');
    }

    // Create frontend .env
    const frontendEnvPath = path.join(__dirname, 'frontend', '.env');
    if (!fileExists(frontendEnvPath)) {
      fs.writeFileSync(frontendEnvPath, frontendEnvContent);
      log('✅ Frontend .env file created', 'green');
    } else {
      log('ℹ️  Frontend .env file already exists', 'blue');
    }
  } catch (error) {
    log(`❌ Error creating environment files: ${error.message}`, 'red');
    throw error;
  }
}

// Function to install dependencies
async function installDependencies() {
  log('📦 Installing dependencies...', 'yellow');
  
  try {
    // Install backend dependencies
    await runCommand('npm', ['install'], path.join(__dirname, 'backend'), 'Backend dependencies');
    
    // Install frontend dependencies
    await runCommand('npm', ['install'], path.join(__dirname, 'frontend'), 'Frontend dependencies');
    
    log('✅ All dependencies installed successfully', 'green');
  } catch (error) {
    log(`❌ Error installing dependencies: ${error.message}`, 'red');
    throw error;
  }
}

// Function to test API connection
async function testAPIConnection() {
  log('🧪 Testing API connection...', 'yellow');
  
  try {
    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await fetch('http://localhost:5000/api/health');
    const data = await response.json();
    
    if (response.ok) {
      log(`✅ API Health Check: ${data.message}`, 'green');
      return true;
    } else {
      log(`❌ API Health Check failed: ${data.message}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ API connection test failed: ${error.message}`, 'red');
    return false;
  }
}

// Main synchronization function
async function syncApp() {
  try {
    // Step 1: Create environment files
    createEnvFiles();
    
    // Step 2: Install dependencies
    await installDependencies();
    
    log('\n🎉 Synchronization completed successfully!', 'green');
    log('\n📋 Next steps:', 'bright');
    log('1. Start MongoDB (if not already running)', 'yellow');
    log('2. Start backend: cd backend && npm run dev', 'yellow');
    log('3. Start frontend: cd frontend && npm run dev', 'yellow');
    log('4. Test API: node test-api.js', 'yellow');
    log('\n🌐 Frontend will be available at: http://localhost:3000', 'cyan');
    log('🔗 Backend API will be available at: http://localhost:5000/api', 'cyan');
    
  } catch (error) {
    log(`\n❌ Synchronization failed: ${error.message}`, 'red');
    log('\n💡 Troubleshooting tips:', 'yellow');
    log('1. Make sure Node.js and npm are installed', 'yellow');
    log('2. Check if ports 3000 and 5000 are available', 'yellow');
    log('3. Ensure you have proper permissions to create files', 'yellow');
    log('4. Try running the commands manually', 'yellow');
    process.exit(1);
  }
}

// Run the synchronization
syncApp();
