export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number;

export function formatCurrency(amount: number, currency: string): string;
