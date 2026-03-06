import React, { useState } from 'react';
import { Plus, Trash2, Check, AlertCircle, Loader } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';

/**
 * Category Rule Builder Component
 * Allows users to create and manage categorization rules
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */
const CategoryRuleBuilder = ({ onRuleAdded }) => {
  const [mode, setMode] = useState('view'); // 'view', 'create', 'template'
  const [formData, setFormData] = useState({
    categoryId: '',
    conditionType: 'text_match',
    keywords: [],
    minAmount: '',
    maxAmount: '',
    notes: '',
    priority: 0
  });
  const [newKeyword, setNewKeyword] = useState('');

  // Fetch user's categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await fetch('/api/categories', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    }
  });

  // Fetch user's rules
  const { data: rules, refetch: refetchRules } = useQuery({
    queryKey: ['categorizationRules'],
    queryFn: async () => {
      const response = await fetch('/api/smart-categorization/rules', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch rules');
      return response.json();
    }
  });

  // Fetch rule templates
  const { data: templates } = useQuery({
    queryKey: ['ruleTemplates'],
    queryFn: async () => {
      const response = await fetch('/api/smart-categorization/rules/templates/available', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    }
  });

  // Create rule mutation
  const createRuleMutation = useMutation({
    mutationFn: async (ruleData) => {
      const conditionConfig =
        ruleData.conditionType === 'text_match'
          ? { keywords: ruleData.keywords }
          : { min: parseFloat(ruleData.minAmount), max: parseFloat(ruleData.maxAmount) };

      const response = await fetch('/api/smart-categorization/rules', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          categoryId: ruleData.categoryId,
          conditionType: ruleData.conditionType,
          conditionConfig,
          notes: ruleData.notes,
          priority: ruleData.priority,
          isActive: true
        })
      });

      if (!response.ok) throw new Error('Failed to create rule');
      return response.json();
    },
    onSuccess: () => {
      refetchRules();
      onRuleAdded?.();
      resetForm();
      setMode('view');
    }
  });

  // Create from template mutation
  const createFromTemplateMutation = useMutation({
    mutationFn: async ({ templateKey, categoryId, notes }) => {
      const response = await fetch(`/api/smart-categorization/rules/templates/${templateKey}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ categoryId, notes })
      });

      if (!response.ok) throw new Error('Failed to create rule from template');
      return response.json();
    },
    onSuccess: () => {
      refetchRules();
      onRuleAdded?.();
      setMode('view');
    }
  });

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId) => {
      const response = await fetch(`/api/smart-categorization/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });

      if (!response.ok) throw new Error('Failed to delete rule');
      return response.json();
    },
    onSuccess: () => {
      refetchRules();
    }
  });

  const resetForm = () => {
    setFormData({
      categoryId: '',
      conditionType: 'text_match',
      keywords: [],
      minAmount: '',
      maxAmount: '',
      notes: '',
      priority: 0
    });
    setNewKeyword('');
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim()) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, newKeyword.trim()]
      }));
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (index) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index)
    }));
  };

  const handleCreateRule = () => {
    if (!formData.categoryId || formData.keywords.length === 0) {
      alert('Please fill in all required fields');
      return;
    }
    createRuleMutation.mutate(formData);
  };

  const userRules = rules?.data || [];
  const categoryList = categories?.data || [];
  const templateList = templates?.data || [];

  return (
    <div className="w-full space-y-4">
      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('view')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'view'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
          }`}
        >
          View Rules
        </button>
        <button
          onClick={() => setMode('create')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            mode === 'create'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
          }`}
        >
          <Plus className="w-4 h-4" />
          Create Rule
        </button>
        <button
          onClick={() => setMode('template')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'template'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
          }`}
        >
          Use Template
        </button>
      </div>

      {/* View Rules Mode */}
      {mode === 'view' && (
        <div className="space-y-3">
          {userRules.length === 0 ? (
            <div className="p-4 text-center bg-gray-50 rounded-lg text-gray-600">
              No rules created yet. Create your first rule!
            </div>
          ) : (
            userRules.map(rule => (
              <div
                key={rule.id}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{rule.notes || 'Rule'}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Condition: {rule.conditionType}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Matched: {rule.matchCount} times
                    </p>
                  </div>
                  <button
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                    disabled={deleteRuleMutation.isPending}
                    className="text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Rule Mode */}
      {mode === 'create' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Category *
            </label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a category</option>
              {categoryList.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Condition Type *
            </label>
            <select
              value={formData.conditionType}
              onChange={(e) => setFormData({...formData, conditionType: e.target.value})}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="text_match">Text Match (Keywords)</option>
              <option value="amount_range">Amount Range</option>
            </select>
          </div>

          {formData.conditionType === 'text_match' && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Keywords *
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                  placeholder="Add keyword and press Enter"
                  className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddKeyword}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.keywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-blue-100 text-blue-900 rounded-full flex items-center gap-2"
                  >
                    {kw}
                    <button
                      onClick={() => handleRemoveKeyword(idx)}
                      className="text-blue-700 hover:text-blue-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {formData.conditionType === 'amount_range' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Min Amount
                </label>
                <input
                  type="number"
                  value={formData.minAmount}
                  onChange={(e) => setFormData({...formData, minAmount: e.target.value})}
                  placeholder="0"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Max Amount
                </label>
                <input
                  type="number"
                  value={formData.maxAmount}
                  onChange={(e) => setFormData({...formData, maxAmount: e.target.value})}
                  placeholder="999999"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Rule Name (Optional)
            </label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="e.g., Coffee Shop Expenses"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCreateRule}
              disabled={createRuleMutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {createRuleMutation.isPending && <Loader className="w-4 h-4 animate-spin" />}
              Create Rule
            </button>
            <button
              onClick={() => {
                resetForm();
                setMode('view');
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template Mode */}
      {mode === 'template' && (
        <div className="space-y-3">
          {templateList.length === 0 ? (
            <div className="p-4 text-center bg-gray-50 rounded-lg text-gray-600">
              No templates available
            </div>
          ) : (
            templateList.map(template => (
              <div
                key={template.key}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-gray-900">{template.name}</p>
                    <p className="text-sm text-gray-600">{template.conditionType}</p>
                  </div>
                  <button
                    onClick={() => {
                      // Simple template usage - user selects category
                      const selectedCategory = window.prompt('Select category ID');
                      if (selectedCategory) {
                        createFromTemplateMutation.mutate({
                          templateKey: template.key,
                          categoryId: selectedCategory,
                          notes: template.name
                        });
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryRuleBuilder;
