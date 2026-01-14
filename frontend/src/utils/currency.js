const BASE_URL = "https://api.frankfurter.app";

/**
 * Converts currency with automatic retry on failure.
 * @param {number} amount Amount to convert
 * @param {string} from Source currency code
 * @param {string} to Target currency code
 * @param {number} retries Number of retries (default: 3)
 * @returns {Promise<number>} Converted amount
 */
export async function convertCurrency(amount, from, to, retries = 3) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(
        `${BASE_URL}/latest?amount=${amount}&from=${from}&to=${to}`
      );

      if (!res.ok) {
        // Handle specific HTTP errors
        if (res.status === 429) {
          throw new Error("API rate limit exceeded. Please try again later.");
        }
        if (res.status >= 500) {
          throw new Error("Currency conversion service unavailable.");
        }
        throw new Error(`Exchange rate request failed: ${res.statusText}`);
      }

      const data = await res.json();
      return data.rates[to];
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (i === retries) break;

      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const delay = 500 * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
