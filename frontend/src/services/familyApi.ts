import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const familyApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
familyApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Children Management
export const createChild = async (childData) => {
  const response = await familyApi.post('/family/children', childData);
  return response.data;
};

export const getChildren = async (vaultId = null) => {
  const params = vaultId ? { vaultId } : {};
  const response = await familyApi.get('/family/children', { params });
  return response.data;
};

export const getChild = async (childId) => {
  const response = await familyApi.get(`/family/children/${childId}`);
  return response.data;
};

export const updateChild = async (childId, childData) => {
  const response = await familyApi.put(`/family/children/${childId}`, childData);
  return response.data;
};

export const deleteChild = async (childId) => {
  const response = await familyApi.delete(`/family/children/${childId}`);
  return response.data;
};

// Allowances Management
export const createAllowance = async (allowanceData) => {
  const response = await familyApi.post('/family/allowances', allowanceData);
  return response.data;
};

export const getAllowances = async (childId = null) => {
  const params = childId ? { childId } : {};
  const response = await familyApi.get('/family/allowances', { params });
  return response.data;
};

export const processAllowancePayment = async (allowanceId) => {
  const response = await familyApi.post(`/family/allowances/${allowanceId}/pay`);
  return response.data;
};

// Spending Limits
export const createSpendingLimit = async (limitData) => {
  const response = await familyApi.post('/family/limits', limitData);
  return response.data;
};

export const getSpendingLimits = async (childId) => {
  const response = await familyApi.get(`/family/children/${childId}/limits`);
  return response.data;
};

// Child Transactions
export const createChildTransaction = async (transactionData) => {
  const response = await familyApi.post('/family/transactions', transactionData);
  return response.data;
};

export const getChildTransactions = async (childId, filters = {}) => {
  const response = await familyApi.get(`/family/children/${childId}/transactions`, { params: filters });
  return response.data;
};

export const approveChildTransaction = async (transactionId, approvalNotes = '') => {
  const response = await familyApi.post(`/family/transactions/${transactionId}/approve`, { approvalNotes });
  return response.data;
};

// Child Tasks/Chores
export const createChildTask = async (taskData) => {
  const response = await familyApi.post('/family/tasks', taskData);
  return response.data;
};

export const getChildTasks = async (childId) => {
  const response = await familyApi.get(`/family/children/${childId}/tasks`);
  return response.data;
};

export const completeChildTask = async (taskId, completedBy) => {
  const response = await familyApi.post(`/family/tasks/${taskId}/complete`, { completedBy });
  return response.data;
};

// Child Savings Goals
export const createChildSavingsGoal = async (goalData) => {
  const response = await familyApi.post('/family/goals', goalData);
  return response.data;
};

export const getChildSavingsGoals = async (childId) => {
  const response = await familyApi.get(`/family/children/${childId}/goals`);
  return response.data;
};

export const contributeToChildSavingsGoal = async (goalId, amount, contributionType = 'child') => {
  const response = await familyApi.post(`/family/goals/${goalId}/contribute`, { amount, contributionType });
  return response.data;
};

// Financial Summary
export const getChildFinancialSummary = async (childId) => {
  const response = await familyApi.get(`/family/children/${childId}/summary`);
  return response.data;
};

export default {
  // Children
  createChild,
  getChildren,
  getChild,
  updateChild,
  deleteChild,
  // Allowances
  createAllowance,
  getAllowances,
  processAllowancePayment,
  // Spending Limits
  createSpendingLimit,
  getSpendingLimits,
  // Transactions
  createChildTransaction,
  getChildTransactions,
  approveChildTransaction,
  // Tasks
  createChildTask,
  getChildTasks,
  completeChildTask,
  // Savings Goals
  createChildSavingsGoal,
  getChildSavingsGoals,
  contributeToChildSavingsGoal,
  // Summary
  getChildFinancialSummary,
};
