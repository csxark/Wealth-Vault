#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 Wealth Vault Setup Wizard');
console.log('=============================\n');

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, 'env.example');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists!');
  rl.question('Do you want to overwrite it? (y/N): ', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      runSetup();
    } else {
      console.log('Setup cancelled. Existing .env file preserved.');
      rl.close();
    }
  });
} else {
  runSetup();
}

function runSetup() {
  console.log('\n📋 Please provide your Supabase credentials:');
  console.log('You can find these in your Supabase project dashboard under Settings > API\n');

  rl.question('Supabase Project URL: ', (supabaseUrl) => {
    if (!supabaseUrl.trim()) {
      console.log('❌ Supabase URL is required!');
      rl.close();
      return;
    }

    rl.question('Supabase Anon Key: ', (supabaseKey) => {
      if (!supabaseKey.trim()) {
        console.log('❌ Supabase Anon Key is required!');
        rl.close();
        return;
      }

      rl.question('Enable debug mode? (y/N): ', (debugMode) => {
        const debug = debugMode.toLowerCase() === 'y' || debugMode.toLowerCase() === 'yes';
        
        // Create .env content
        const envContent = `# Supabase Configuration
VITE_SUPABASE_URL=${supabaseUrl.trim()}
VITE_SUPABASE_ANON_KEY=${supabaseKey.trim()}

# Optional: Enable debug mode
VITE_DEBUG=${debug}
`;

        try {
          fs.writeFileSync(envPath, envContent);
          console.log('\n✅ .env file created successfully!');
          console.log('\n📝 Next steps:');
          console.log('1. Run the database schema setup in your Supabase SQL editor');
          console.log('2. Copy the contents of supabase-schema.sql');
          console.log('3. Run: npm run dev');
          console.log('\n🎉 Happy coding!');
        } catch (error) {
          console.error('❌ Error creating .env file:', error.message);
        }

        rl.close();
      });
    });
  });
}

rl.on('close', () => {
  process.exit(0);
}); 