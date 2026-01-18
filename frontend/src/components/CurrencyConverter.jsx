import { useEffect, useState } from 'react';
import { convertCurrency } from '../utils/currency';

const currencies = ['USD', 'EUR', 'INR', 'GBP', 'JPY'];

const CurrencyConverter = ({ onRateChange }) => {
  const [amount, setAmount] = useState(1);
  const [from, setFrom] = useState(localStorage.getItem('preferredFrom') || 'INR');
  const [to, setTo] = useState(localStorage.getItem('preferredTo') || 'USD');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    localStorage.setItem('preferredFrom', from);
    localStorage.setItem('preferredTo', to);
  }, [from, to]);

  const handleConvert = async () => {
    setLoading(true);
    try {
      const rate = await convertCurrency(1, from, to); // get 1-unit rate
      setResult(rate);
      onRateChange({ from, to, rate });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow border border-cyan-200 dark:border-cyan-700">
      <div className="flex items-center gap-2">
        <select 
          value={from} 
          onChange={(e) => setFrom(e.target.value)} 
          className="flex-1 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-900 dark:text-white rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          {currencies.map(c => <option key={c}>{c}</option>)}
        </select>

        <span className="text-sm text-slate-600 dark:text-slate-400">→</span>

        <select 
          value={to} 
          onChange={(e) => setTo(e.target.value)} 
          className="flex-1 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-900 dark:text-white rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          {currencies.map(c => <option key={c}>{c}</option>)}
        </select>

        <button
          onClick={handleConvert}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'Go'}
        </button>
      </div>
      {result && (
        <div className="mt-2 text-xs text-center text-slate-600 dark:text-slate-400">
          1 {from} = {result.toFixed(4)} {to}
        </div>
      )}
    </div>
  );
};
export default CurrencyConverter;