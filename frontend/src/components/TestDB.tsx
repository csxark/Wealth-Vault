import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authAPI, expensesAPI, categoriesAPI, goalsAPI, healthAPI } from '../services/api';

export const TestDB: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<string>('Ready');
  const [testResults, setTestResults] = useState<string[]>([]);

  const addLog = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const clearLogs = () => {
    setTestResults([]);
  };

  // Test API connection
  const testConnection = async () => {
    setStatus('Testing connection...');
    addLog('🔍 Testing API connection...');

    try {
      const result = await healthAPI.check();
      if (result.status === 'OK') {
        addLog('✅ API connection successful');
      } else {
        addLog('❌ API connection failed');
      }
    } catch (error) {
      addLog(`❌ Connection test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Test user profile operations
  const testProfile = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing profile operations...');
    addLog('👤 Testing profile operations...');

    try {
      // Get current user profile
      const getResult = await authAPI.getProfile();
      if (getResult.success) {
        addLog(`✅ Profile retrieved: ${getResult.data.user.firstName} ${getResult.data.user.lastName}`);
      } else {
        addLog('❌ Get profile failed');
      }

      // Update profile
      const updateResult = await authAPI.updateProfile({
        monthlyIncome: 50000,
        monthlyBudget: 40000
      });

      if (updateResult.success) {
        addLog('✅ Profile updated successfully');
      } else {
        addLog('❌ Update profile failed');
      }
    } catch (error) {
      addLog(`❌ Profile test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Test expense operations
  const testExpenses = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing expense operations...');
    addLog('💰 Testing expense operations...');

    try {
      // Get all expenses
      const getAllResult = await expensesAPI.getAll();
      if (getAllResult.success) {
        addLog(`✅ Retrieved ${getAllResult.data.expenses.length} expenses`);
      } else {
        addLog('❌ Get expenses failed');
      }

      // Add test expense
      const addResult = await expensesAPI.create({
        amount: 1500,
        currency: 'INR',
        description: 'Test Grocery Shopping',
        category: 'Food & Dining',
        date: new Date().toISOString(),
        paymentMethod: 'cash',
        status: 'completed'
      });

      if (addResult.success) {
        addLog('✅ Test expense added successfully');
        
        // Get expense statistics
        const statsResult = await expensesAPI.getStats();
        if (statsResult.success) {
          addLog(`✅ Expense stats: Total ${statsResult.data.summary.total}, Count ${statsResult.data.summary.count}`);
        }
      } else {
        addLog('❌ Add expense failed');
      }
    } catch (error) {
      addLog(`❌ Expense test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Test category operations
  const testCategories = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing category operations...');
    addLog('🏷️ Testing category operations...');

    try {
      // Get all categories
      const getAllResult = await categoriesAPI.getAll();
      if (getAllResult.success) {
        addLog(`✅ Retrieved ${getAllResult.data.categories.length} categories`);
      } else {
        addLog('❌ Get categories failed');
      }

      // Add test category
      const addResult = await categoriesAPI.create({
        name: 'Test Category',
        description: 'A test category for testing purposes',
        color: '#FF6B6B',
        icon: 'tag',
        type: 'expense',
        isDefault: false,
        isActive: true,
        budget: {
          monthly: 5000,
          yearly: 60000
        },
        spendingLimit: 5000,
        priority: 1
      });

      if (addResult.success) {
        addLog('✅ Test category added successfully');
      } else {
        addLog('❌ Add category failed');
      }
    } catch (error) {
      addLog(`❌ Category test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Test goal operations
  const testGoals = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing goal operations...');
    addLog('🎯 Testing goal operations...');

    try {
      // Get all goals
      const getAllResult = await goalsAPI.getAll();
      if (getAllResult.success) {
        addLog(`✅ Retrieved ${getAllResult.data.goals.length} goals`);
      } else {
        addLog('❌ Get goals failed');
      }

      // Add test goal
      const addResult = await goalsAPI.create({
        title: 'Test Savings Goal',
        description: 'A test goal for testing purposes',
        targetAmount: 100000,
        currency: 'INR',
        type: 'savings',
        priority: 'medium',
        deadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
        isPublic: false
      });

      if (addResult.success) {
        addLog('✅ Test goal added successfully');
        
        // Get goals summary
        const summaryResult = await goalsAPI.getSummary();
        if (summaryResult.success) {
          addLog(`✅ Goals summary: Total ${summaryResult.data.summary.total}, Active ${summaryResult.data.summary.active}`);
        }
      } else {
        addLog('❌ Add goal failed');
      }
    } catch (error) {
      addLog(`❌ Goal test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Run all tests
  const runAllTests = async () => {
    addLog('🚀 Starting comprehensive API tests...');
    await testConnection();
    await testProfile();
    await testExpenses();
    await testCategories();
    await testGoals();
    addLog('✅ All tests completed!');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">API Testing Panel</h1>
          
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Test the Wealth Vault API endpoints and database operations.
            </p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={runAllTests}
                disabled={status !== 'Ready'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🚀 Run All Tests
              </button>
              
              <button
                onClick={testConnection}
                disabled={status !== 'Ready'}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔍 Test Connection
              </button>
              
              <button
                onClick={testProfile}
                disabled={status !== 'Ready' || !user}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                👤 Test Profile
              </button>
              
              <button
                onClick={testExpenses}
                disabled={status !== 'Ready' || !user}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💰 Test Expenses
              </button>
              
              <button
                onClick={testCategories}
                disabled={status !== 'Ready' || !user}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🏷️ Test Categories
              </button>
              
              <button
                onClick={testGoals}
                disabled={status !== 'Ready' || !user}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🎯 Test Goals
              </button>
              
              <button
                onClick={clearLogs}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                🗑️ Clear Logs
              </button>
            </div>
            
            <div className="text-sm text-gray-500">
              Status: <span className="font-medium">{status}</span>
              {!user && <span className="ml-2 text-red-500">⚠️ Please log in to test user-specific operations</span>}
            </div>
          </div>
          
          <div className="bg-gray-100 rounded-lg p-4 h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Test Results:</h3>
            {testResults.length === 0 ? (
              <p className="text-gray-500">No test results yet. Click a test button to start.</p>
            ) : (
              <div className="space-y-1">
                {testResults.map((result, index) => (
                  <div key={index} className="text-sm font-mono bg-white p-2 rounded border">
                    {result}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 