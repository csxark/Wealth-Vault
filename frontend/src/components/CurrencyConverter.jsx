import { useEffect, useState } from 'react';
import { convertCurrency } from '../utils/currency';

const currencies = ['USD', 'EUR', 'INR', 'GBP', 'JPY'];

const CurrencyConverter = () => {
  const [amount, setAmount] = useState(1);
  const [from, setFrom] = useState(
    localStorage.getItem('preferredFrom') || 'USD'
  );
  const [to, setTo] = useState(
    localStorage.getItem('preferredTo') || 'INR'
  );
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('preferredFrom', from);
    localStorage.setItem('preferredTo', to);
  }, [from, to]);

  const handleConvert = async () => {
    setLoading(true);
    setError('');
    try {
      const converted = await convertCurrency(amount, from, to);
      setResult(converted);
    } catch (err) {
      setError('Unable to fetch exchange rates. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const swapCurrencies = () => {
    setFrom(to);
    setTo(from);
    setResult(null);
  };

  return (
    <div className="bg-white dark:bg-card p-6 rounded-xl shadow-md w-full max-w-md">
      <h2 className="text-lg font-semibold mb-4">Currency Converter</h2>

      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full border rounded px-3 py-2 mb-3"
      />

      <div className="flex gap-2 mb-3">
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="flex-1 border rounded px-2 py-2"
        >
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <button
          onClick={swapCurrencies}
          className="px-3 py-2 border rounded font-bold"
        >
          ⇄
        </button>

        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 border rounded px-2 py-2"
        >
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleConvert}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        Convert
      </button>

      {loading && <p className="mt-2 text-sm">Converting...</p>}

      {result && (
        <p className="mt-3 font-medium">
          {amount} {from} = {result.toFixed(2)} {to}
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export default CurrencyConverter;
