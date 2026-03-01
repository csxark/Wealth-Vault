import type { CurrencyCode, CurrencyApiResponse, CurrencyConversionError } from '../types';

const BASE_URL = "https://api.frankfurter.app";

/**
 * Converts currency with automatic retry on failure.
 */
export async function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  retries: number = 3
): Promise<number> {
  let lastError: Error | unknown;

  for (let i = 0; i <= retries; i++) {
    try {
      const res: Response = await fetch(
        `${BASE_URL}/latest?amount=${amount}&from=${from}&to=${to}`
      );

      if (!res.ok) {
        // Handle specific HTTP errors
        if (res.status === 429) {
          const error: CurrencyConversionError = new Error("API rate limit exceeded. Please try again later.");
          error.code = 'RATE_LIMIT_EXCEEDED';
          error.status = res.status;
          throw error;
        }
        if (res.status >= 500) {
          const error: CurrencyConversionError = new Error("Currency conversion service unavailable.");
          error.code = 'SERVICE_UNAVAILABLE';
          error.status = res.status;
          throw error;
        }
        const error: CurrencyConversionError = new Error(`Exchange rate request failed: ${res.statusText}`);
        error.code = 'API_ERROR';
        error.status = res.status;
        throw error;
      }

      const data: CurrencyApiResponse = await res.json();
      const rate: number | undefined = data.rates[to];

      if (rate === undefined) {
        throw new Error(`Currency ${to} not found in response`);
      }

      return rate;
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (i === retries) break;

      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const delay: number = 500 * Math.pow(2, i);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
