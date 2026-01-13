import { useEffect, useState } from 'react';
import { convertCurrency } from '../utils/currency';

const currencies = ['USD', 'EUR', 'INR', 'GBP', 'JPY'];

const CurrencyConverter = ({ onRateChange }) => {
  const [amount, setAmount] = useState(1);
  const [from, setFrom] = useState(localStorage.getItem('preferredFrom') || 'INR');
  const [to, setTo] = useState(localStorage.getItem('preferredTo') || 'USD');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('preferredFrom', from);
    localStorage.setItem('preferredTo', to);
  }, [from, to]);

  const handleConvert = async () => {
    setLoading(true);
    try {
      const rate = await convertCurrency(1, from, to); // get 1-unit rate
      onRateChange({ from, to, rate });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow border w-64">
      <div className="flex items-center gap-2">
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm">
          {currencies.map(c => <option key={c}>{c}</option>)}
        </select>

        <span className="text-sm">→</span>

        <select value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm">
          {currencies.map(c => <option key={c}>{c}</option>)}
        </select>

        <button
          onClick={handleConvert}
          className="px-2 py-1 text-sm bg-cyan-600 text-white rounded"
        >
          {loading ? '...' : 'Go'}
        </button>
      </div>
    </div>
  );
};
export default CurrencyConverter;