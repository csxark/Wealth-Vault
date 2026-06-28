import React, { useState, useEffect } from 'react';
import { ChevronDown, Loader, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

/**
 * Smart Category Selector Component
 * Displays auto-suggested category with alternatives
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */
const SmartCategorySelector = ({ 
  expenseId, 
  onCategorySelect, 
  currentCategory,
  confidence = 0 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(currentCategory);

  // Fetch category suggestions
  const { data: suggestions, isLoading, error } = useQuery({
    queryKey: ['categorySuggestions', expenseId],
    queryFn: async () => {
      const response = await fetch(
        `/api/smart-categorization/suggestions/${expenseId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      return response.json();
    },
    enabled: !!expenseId
  });

  const topSuggestion = suggestions?.data?.topSuggestion;
  const alternatives = suggestions?.data?.suggestions || [];

  const handleSelectCategory = (categoryId) => {
    setSelectedCategory(categoryId);
    onCategorySelect?.(categoryId);
    setIsOpen(false);
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 0.85) return 'text-green-600';
    if (conf >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (conf) => {
    if (conf >= 0.85) return 'High Confidence';
    if (conf >= 0.6) return 'Medium Confidence';
    return 'Low Confidence';
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
        <Loader className="w-4 h-4 animate-spin text-blue-600" />
        <span className="text-sm text-gray-600">Analyzing...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {topSuggestion && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-700">Suggested Category</p>
              <p className="text-lg font-semibold text-blue-700 mt-1">
                {topSuggestion.categoryName || 'Unknown'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {topSuggestion.reasoning}
              </p>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${getConfidenceColor(topSuggestion.confidence)}`}>
                {(topSuggestion.confidence * 100).toFixed(0)}%
              </div>
              <p className={`text-xs font-medium mt-1 ${getConfidenceColor(topSuggestion.confidence)}`}>
                {getConfidenceLabel(topSuggestion.confidence)}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-700">Failed to load suggestions</span>
        </div>
      )}

      {alternatives.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <span className="text-sm font-medium">
              {selectedCategory ? 'Change Category' : 'Select Category'}
            </span>
            <ChevronDown
              className={`w-5 h-5 text-gray-600 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
              <div className="max-h-64 overflow-y-auto">
                {alternatives.map((alt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectCategory(alt.categoryId)}
                    className="w-full text-left p-3 hover:bg-blue-50 border-b border-gray-200 last:border-b-0 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">
                        {alt.categoryName}
                      </span>
                      <span className="text-xs font-semibold text-gray-600">
                        {(alt.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{alt.source}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartCategorySelector;
