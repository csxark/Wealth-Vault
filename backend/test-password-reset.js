import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

// Test password reset flow
async function testPasswordReset() {
  console.log('🧪 Testing Password Reset Functionality\n');

  try {
    // Test 1: Forgot password request
    console.log('1. Testing forgot password request...');
    const forgotResponse = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com'
      }),
    });

    const forgotResult = await forgotResponse.json();
    console.log('Response:', forgotResult);

    if (forgotResponse.status === 200) {
      console.log('✅ Forgot password request successful');
    } else {
      console.log('❌ Forgot password request failed');
    }

    // Test 2: Reset password (would need a valid token from email)
    console.log('\n2. Testing password reset (simulated)...');
    console.log('Note: In real scenario, token would come from email link');
    console.log('Example reset request structure:');
    console.log(`POST ${API_BASE}/auth/reset-password`);
    console.log('Body:', {
      token: 'reset-token-from-email',
      password: 'NewSecurePassword123!'
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testPasswordReset();