// Simple API connectivity test script
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000/api';

async function testAPI() {
  console.log('🧪 Testing Wealth Vault API Connectivity...\n');

  try {
    // Test health endpoint
    console.log('1. Testing Health Endpoint...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health Check:', healthData.message);
    } else {
      console.log('❌ Health Check Failed:', healthData);
    }

    // Test auth test endpoint
    console.log('\n2. Testing Auth Test Endpoint...');
    const authResponse = await fetch(`${API_BASE}/auth/test`);
    const authData = await authResponse.json();
    
    if (authResponse.ok) {
      console.log('✅ Auth Test:', authData.message);
    } else {
      console.log('❌ Auth Test Failed:', authData);
    }

    // Test CORS preflight
    console.log('\n3. Testing CORS Preflight...');
    const corsResponse = await fetch(`${API_BASE}/health`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    if (corsResponse.ok) {
      console.log('✅ CORS Preflight:', corsResponse.status, corsResponse.statusText);
    } else {
      console.log('❌ CORS Preflight Failed:', corsResponse.status, corsResponse.statusText);
    }

    console.log('\n🎉 API Connectivity Test Complete!');
    
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    console.log('\n💡 Troubleshooting Tips:');
    console.log('1. Ensure backend is running on port 5000');
    console.log('2. Check if MongoDB is running');
    console.log('3. Verify .env file exists in backend folder');
    console.log('4. Check backend console for errors');
  }
}

// Run the test
testAPI();
