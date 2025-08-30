import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { profiles, transactions, goals, utils } from '../lib/simple-db';

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

  // Test database connection
  const testConnection = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing connection...');
    addLog('🔍 Testing database connection...');

    try {
      const result = await utils.testConnection();
      if (result.success) {
        addLog('✅ Database connection successful');
      } else {
        addLog('❌ Database connection failed');
      }
    } catch (error) {
      addLog(`❌ Connection test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Test profile operations
  const testProfile = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing profile operations...');
    addLog('👤 Testing profile operations...');

    try {
      // Save profile
      const saveResult = await profiles.save({
        id: user.id,
        full_name: 'Test User',
        phone: '+91 98765 43210',
        monthly_income: 50000
      });

      if (saveResult.error) {
        addLog(`❌ Save profile failed: ${saveResult.error.message}`);
      } else {
        addLog('✅ Profile saved successfully');
      }

      // Get profile
      const getResult = await profiles.get(user.id);
      if (getResult.error) {
        addLog(`❌ Get profile failed: ${getResult.error.message}`);
      } else {
        addLog(`✅ Profile retrieved: ${getResult.data?.full_name}`);
      }
    } catch (error) {
      addLog(`❌ Profile test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Test transaction operations
  const testTransactions = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing transaction operations...');
    addLog('💰 Testing transaction operations...');

    try {
      // Add transaction
      const addResult = await transactions.add({
        user_id: user.id,
        amount: -1500,
        description: 'Test Grocery Shopping',
        category: 'safe',
        date: new Date().toISOString().split('T')[0]
      });

      if (addResult.error) {
        addLog(`❌ Add transaction failed: ${addResult.error.message}`);
      } else {
        addLog('✅ Transaction added successfully');
      }

      // Get all transactions
      const getAllResult = await transactions.getAll(user.id);
      if (getAllResult.error) {
        addLog(`❌ Get transactions failed: ${getAllResult.error.message}`);
      } else {
        addLog(`✅ Retrieved ${getAllResult.data?.length || 0} transactions`);
      }
    } catch (error) {
      addLog(`❌ Transaction test error: ${error}`);
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
      // Add goal
      const addResult = await goals.add({
        user_id: user.id,
        title: 'Test Goal',
        target_amount: 100000,
        target_date: '2025-12-31'
      });

      if (addResult.error) {
        addLog(`❌ Add goal failed: ${addResult.error.message}`);
      } else {
        addLog('✅ Goal added successfully');
      }

      // Get all goals
      const getAllResult = await goals.getAll(user.id);
      if (getAllResult.error) {
        addLog(`❌ Get goals failed: ${getAllResult.error.message}`);
      } else {
        addLog(`✅ Retrieved ${getAllResult.data?.length || 0} goals`);
      }
    } catch (error) {
      addLog(`❌ Goal test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Test spending summary
  const testSpendingSummary = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setStatus('Testing spending summary...');
    addLog('📊 Testing spending summary...');

    try {
      const result = await utils.getSpendingSummary(user.id);
      if (result.error) {
        addLog(`❌ Get spending summary failed: ${result.error.message}`);
      } else {
        addLog(`✅ Spending summary: Safe: ₹${result.data?.safe}, Impulsive: ₹${result.data?.impulsive}, Anxious: ₹${result.data?.anxious}`);
      }
    } catch (error) {
      addLog(`❌ Spending summary test error: ${error}`);
    }

    setStatus('Ready');
  };

  // Run all tests
  const runAllTests = async () => {
    clearLogs();
    addLog('🚀 Starting all database tests...');
    
    await testConnection();
    await testProfile();
    await testTransactions();
    await testGoals();
    await testSpendingSummary();
    
    addLog('🎉 All tests completed!');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Database Test Panel
        </h2>
        
        <div className="mb-4">
          <p className="text-slate-600 dark:text-slate-400">
            Status: <span className="font-medium">{status}</span>
          </p>
          {user && (
            <p className="text-sm text-slate-500 dark:text-slate-500">
              User ID: {user.id}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <button
            onClick={testConnection}
            disabled={!user || status !== 'Ready'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Connection
          </button>
          
          <button
            onClick={testProfile}
            disabled={!user || status !== 'Ready'}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Profile
          </button>
          
          <button
            onClick={testTransactions}
            disabled={!user || status !== 'Ready'}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Transactions
          </button>
          
          <button
            onClick={testGoals}
            disabled={!user || status !== 'Ready'}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Goals
          </button>
          
          <button
            onClick={testSpendingSummary}
            disabled={!user || status !== 'Ready'}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Summary
          </button>
          
          <button
            onClick={runAllTests}
            disabled={!user || status !== 'Ready'}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Run All Tests
          </button>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Test Results
          </h3>
          <button
            onClick={clearLogs}
            className="px-3 py-1 bg-slate-600 text-white rounded-lg hover:bg-slate-700 text-sm"
          >
            Clear Logs
          </button>
        </div>

        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 h-96 overflow-y-auto">
          {testResults.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-8">
              No test results yet. Run a test to see results here.
            </p>
          ) : (
            <div className="space-y-1">
              {testResults.map((result, index) => (
                <div key={index} className="text-sm font-mono text-slate-700 dark:text-slate-300">
                  {result}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 