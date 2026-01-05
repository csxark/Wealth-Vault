const BASE_URL = 'https://api.frankfurter.app';

export async function convertCurrency(amount, from, to) {
  try {
    const res = await fetch(
      `${BASE_URL}/latest?amount=${amount}&from=${from}&to=${to}`
    );

    if (!res.ok) {
      throw new Error('API limit reached or network error');
    }

    const data = await res.json();
    return data.rates[to];
  } catch (error) {
    throw error;
  }
}
