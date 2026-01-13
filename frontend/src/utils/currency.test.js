import { convertCurrency } from './currency.js';

// Mock global fetch
global.fetch = jest.fn();

describe('convertCurrency utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should successfully convert currency', async () => {
    const mockRate = 0.85;
    const mockResponse = {
      rates: {
        EUR: mockRate
      }
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const amount = 100;
    const from = 'USD';
    const to = 'EUR';

    const result = await convertCurrency(amount, from, to);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`
    );
    expect(result).toBe(mockRate);
  });

  test('should throw error when API response is not ok', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
    });

    await expect(convertCurrency(100, 'USD', 'EUR')).rejects.toThrow(
      'API limit reached or network error'
    );
  });

  test('should throw error on network failure', async () => {
    const networkError = new Error('Network error');
    fetch.mockRejectedValueOnce(networkError);

    await expect(convertCurrency(100, 'USD', 'EUR')).rejects.toThrow(
      'Network error'
    );
  });
});
