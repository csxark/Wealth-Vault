import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react';
import Papa from 'papaparse';
import type { Transaction } from '../../types';
import { useAuth } from '../../hooks/useAuth';

export const DataImport: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null);
  const { user } = useAuth();

  const categorizeTransaction = (description: string, amount: number): 'safe' | 'impulsive' | 'anxious' => {
    const desc = description.toLowerCase();
    
    // Anxious spending patterns
    if (desc.includes('emergency') || desc.includes('urgent') || desc.includes('medical') || desc.includes('repair')) {
      return 'anxious';
    }
    
    // Impulsive spending patterns
    if (desc.includes('entertainment') || desc.includes('shopping') || desc.includes('restaurant') || 
        desc.includes('coffee') || desc.includes('takeout') || amount > 200) {
      return 'impulsive';
    }
    
    // Safe spending (essentials)
    return 'safe';
  };

  const processCSV = (file: File) => {
    setImporting(true);
    setImportResults(null);

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const errors: string[] = [];
        const transactions: Transaction[] = [];

        results.data.forEach((row: any, index) => {
          try {
            // Expected CSV format: date, description, amount
            const date = row.date || row.Date || row.DATE;
            const description = row.description || row.Description || row.DESCRIPTION || '';
            const amount = parseFloat(row.amount || row.Amount || row.AMOUNT || '0');

            if (!date || isNaN(amount)) {
              errors.push(`Row ${index + 1}: Missing or invalid date/amount`);
              return;
            }

            const transaction: Transaction = {
              id: `import-${Date.now()}-${index}`,
              user_id: user?.id || '',
              amount: amount,
              description: description.toString(),
              category: categorizeTransaction(description.toString(), Math.abs(amount)),
              date: new Date(date).toISOString(),
              created_at: new Date().toISOString()
            };

            transactions.push(transaction);
          } catch (error) {
            errors.push(`Row ${index + 1}: ${error}`);
          }
        });

        // Save to localStorage
        const existingTransactions = JSON.parse(localStorage.getItem('transactions') || '[]');
        const updatedTransactions = [...existingTransactions, ...transactions];
        localStorage.setItem('transactions', JSON.stringify(updatedTransactions));

        setImportResults({
          success: transactions.length,
          errors
        });
        setImporting(false);
      },
      error: (error) => {
        setImportResults({
          success: 0,
          errors: [`Failed to parse CSV: ${error.message}`]
        });
        setImporting(false);
      }
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.type === 'text/csv' || file.name.endsWith('.csv'));
    
    if (csvFile) {
      processCSV(csvFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processCSV(file);
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      ['date', 'description', 'amount'],
      ['2024-01-15', 'Grocery shopping', '-120.50'],
      ['2024-01-16', 'Coffee shop', '-4.75'],
      ['2024-01-17', 'Salary deposit', '3000.00'],
      ['2024-01-18', 'Restaurant dinner', '-65.00'],
      ['2024-01-19', 'Emergency car repair', '-450.00']
    ];

    const csvContent = sampleData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_transactions.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Import Transaction Data</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Upload your bank statements to analyze spending patterns</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">CSV File Format</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Your CSV file should include these columns: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">date</code>, <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">description</code>, <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">amount</code>
          </p>
          <button
            onClick={downloadSampleCSV}
            className="inline-flex items-center px-3 py-2 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium"
          >
            <Download className="h-4 w-4 mr-1" />
            Download Sample CSV
          </button>
        </div>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            dragActive 
              ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20' 
              : 'border-slate-300 dark:border-slate-600 hover:border-cyan-400 hover:bg-cyan-25 dark:hover:bg-cyan-900/10'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className={`h-12 w-12 mx-auto mb-4 ${dragActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`} />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
            Drop your CSV file here
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            or click to browse files
          </p>
          
          <input
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
            id="csv-upload"
            disabled={importing}
          />
          <label
            htmlFor="csv-upload"
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200 cursor-pointer"
          >
            <FileText className="h-5 w-5 mr-2" />
            {importing ? 'Processing...' : 'Choose File'}
          </label>
        </div>

        {importResults && (
          <div className="mt-6">
            {importResults.success > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                  <span className="text-green-800 dark:text-green-200 font-medium">
                    Successfully imported {importResults.success} transactions
                  </span>
                </div>
              </div>
            )}

            {importResults.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2 mt-0.5" />
                  <div>
                    <div className="text-red-800 dark:text-red-200 font-medium mb-2">
                      {importResults.errors.length} error(s) encountered:
                    </div>
                    <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                      {importResults.errors.slice(0, 5).map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                      {importResults.errors.length > 5 && (
                        <li>• ... and {importResults.errors.length - 5} more errors</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-cyan-900 dark:text-cyan-100 mb-2 flex items-center">
          <AlertCircle className="h-5 w-5 mr-2 text-cyan-600 dark:text-cyan-400" />
          Privacy & Security
        </h3>
        <p className="text-cyan-800 dark:text-cyan-200 text-sm">
          Your financial data is processed locally in your browser and stored securely. 
          We never send your transaction details to external servers. All categorization 
          happens on your device to protect your privacy.
        </p>
      </div>
    </div>
  );
};