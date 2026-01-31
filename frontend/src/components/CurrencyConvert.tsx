import { useEffect, useState } from 'react';
import { convertCurrency } from '../utils/currency';
import type { CurrencyConverterProps, CurrencyCode } from '../types';

const currencies: readonly CurrencyCode[] = ['USD', 'EUR', 'INR', 'GBP', 'JPY'] as const;

const CurrencyConverter: React.FC<CurrencyConverterProps> = ({ onRateChange }) => {
  const [from, setFrom] = useState<CurrencyCode>(
    (localStorage.getItem('preferredFrom') as CurrencyCode) || 'INR'
  );
  const [to, setTo] = useState<CurrencyCode>(
    (localStorage.getItem('preferredTo') as CurrencyCode) || 'USD'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem('preferredFrom', from);
    localStorage.setItem('preferredTo', to);
  }, [from, to]);

  const handleConvert = async (): Promise<void> => {
    setLoading(true);
    try {
      const rate: number = await convertCurrency(1, from, to); // get 1-unit rate
      setResult(rate);
      onRateChange({ from, to, rate });
    } finally {
      setLoading(false);
    }
  };

  const handleFromChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setFrom(e.target.value as CurrencyCode);
  };

  const handleToChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setTo(e.target.value as CurrencyCode);
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow border border-cyan-200 dark:border-cyan-700">
      <div className="flex items-center gap-2">
        <select
          value={from}
          onChange={handleFromChange}
          className="flex-1 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-900 dark:text-white rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          {currencies.map((currency: CurrencyCode) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>

        <span className="text-sm text-slate-600 dark:text-slate-400">→</span>

        <select
          value={to}
          onChange={handleToChange}
          className="flex-1 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-900 dark:text-white rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          {currencies.map((currency: CurrencyCode) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>

        <button
          onClick={handleConvert}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'Go'}
        </button>
      </div>
      {result !== null && (
        <div className="mt-2 text-xs text-center text-slate-600 dark:text-slate-400">
          1 {from} = {result.toFixed(4)} {to}
        </div>
      )}
    </div>
  );
};

export default CurrencyConverter;