import { useState, useEffect } from 'react';
import { taxApi, TaxCategory, TaxSummary, TaxSuggestion } from '../services/taxApi';

const TaxCenter = () => {
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [categories, setCategories] = useState<TaxCategory[]>([]);
  const [suggestions, setSuggestions] = useState<TaxSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'deductions' | 'suggestions' | 'reports'>('summary');

  useEffect(() => {
    loadData();
  }, [taxYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, categoriesRes, suggestionsRes] = await Promise.all([
        taxApi.getTaxSummary(taxYear),
        taxApi.getTaxCategories({ activeOnly: true }),
        taxApi.getTaxSuggestions(taxYear),
      ]);
      setSummary(summaryRes.data);
      setCategories(categoriesRes.data);
      setSuggestions(suggestionsRes.data);
    } catch (error) {
      console.error('Error loading tax data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const data = await taxApi.exportTaxData(taxYear, format);
      
      if (format === 'csv') {
        // Create a blob and download
        const blob = new Blob([data as any], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tax-export-${taxYear}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        // Download JSON
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tax-export-${taxYear}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting tax data:', error);
    }
  };

  const handleApplySuggestion = async (suggestion: TaxSuggestion) => {
    try {
      await taxApi.markAsDeductible(suggestion.expenseId, {
        taxCategoryId: categories.find(c => c.code === suggestion.suggestedCategory)?.id,
        taxYear,
      });
      // Remove from suggestions and reload
      setSuggestions(suggestions.filter(s => s.expenseId !== suggestion.expenseId));
      loadData();
    } catch (error) {
      console.error('Error applying suggestion:', error);
    }
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tax Center</h1>
          <p className="text-gray-600 dark:text-gray-400">Track and manage your tax-deductible expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(parseInt(e.target.value))}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {[2024, 2023, 2022, 2021].map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <div className="relative group">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Export
            </button>
            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hidden group-hover:block z-10">
              <button
                onClick={() => handleExport('csv')}
                className="block w-full text-left px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
              >
                Export CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="block w-full text-left px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
              >
                Export JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Deductions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {summary ? formatCurrency(summary.summary.totalDeductions) : '$0.00'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Deductible Items</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {summary ? summary.summary.totalExpenses : 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Categories</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {summary ? summary.deductionsByCategory.length : 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'summary', label: 'Summary' },
            { id: 'deductions', label: 'Deductions' },
            { id: 'suggestions', label: 'Suggestions' },
            { id: 'reports', label: 'Reports' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              {tab.label}
              {tab.id === 'suggestions' && suggestions.length > 0 && (
                <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded-full dark:bg-yellow-900 dark:text-yellow-300">
                  {suggestions.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {activeTab === 'summary' && summary && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Deductions by Category
            </h3>
            {summary.deductionsByCategory.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No tax deductions recorded for {taxYear}
              </p>
            ) : (
              <div className="space-y-4">
                {summary.deductionsByCategory.map((category, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                          {category.categoryCode?.substring(0, 3) || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {category.categoryName || 'Uncategorized'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {category.irsReference || category.categoryType}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 dark:text-white">
                        {formatCurrency(category.totalAmount)}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {category.count} items
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'deductions' && (
          <div className="p-6">
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              View and manage your tax-deductible expenses in the Expenses section
            </p>
          </div>
        )}

        {activeTab === 'suggestions' && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Suggested Deductions
            </h3>
            {suggestions.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No suggestions available for {taxYear}
              </p>
            ) : (
              <div className="space-y-4">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.expenseId} className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {suggestion.description}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {suggestion.reason}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-gray-900 dark:text-white">
                          {formatCurrency(suggestion.amount)}
                        </p>
                        <span className={`
                          text-xs px-2 py-1 rounded-full
                          ${suggestion.confidence === 'high' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : ''}
                          ${suggestion.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' : ''}
                          ${suggestion.confidence === 'low' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' : ''}
                        `}>
                          {suggestion.confidence} confidence
                        </span>
                      </div>
                      <button
                        onClick={() => handleApplySuggestion(suggestion)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Generate Tax Report
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => taxApi.generateReport({ taxYear, reportType: 'summary', format: 'pdf' })}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <p className="font-medium text-gray-900 dark:text-white">Summary Report</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Overview of all deductions</p>
              </button>
              <button
                onClick={() => taxApi.generateReport({ taxYear, reportType: 'detailed', format: 'pdf' })}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <p className="font-medium text-gray-900 dark:text-white">Detailed Report</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Complete list with all details</p>
              </button>
              <button
                onClick={() => taxApi.generateReport({ taxYear, reportType: 'schedule_a', format: 'pdf' })}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <p className="font-medium text-gray-900 dark:text-white">Schedule A</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Itemized deductions (Form 1040)</p>
              </button>
              <button
                onClick={() => taxApi.generateReport({ taxYear, reportType: 'schedule_c', format: 'pdf' })}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <p className="font-medium text-gray-900 dark:text-white">Schedule C</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Business expenses (Self-employed)</p>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Potential Deductions */}
      {summary && summary.potentialDeductions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Potential Deductions
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {summary.potentialDeductions.length} expenses might be tax-deductible
          </p>
          <div className="space-y-2">
            {summary.potentialDeductions.slice(0, 5).map((expense) => (
              <div key={expense.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{expense.description}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(expense.date).toLocaleDateString()} • {expense.category?.name || 'Uncategorized'}
                  </p>
                </div>
                <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(expense.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxCenter;
