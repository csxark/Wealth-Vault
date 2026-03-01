/**
 * Format currency amount
 */
export function formatCurrency(amount: number | string, currency: string = 'USD'): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) return '-';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numAmount);
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date | null): string {
  if (!date) return '-';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(d);
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date | null): string {
  if (!date) return '-';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

/**
 * Calculate days until a date
 */
export function daysUntil(date: string | Date | null): number | null {
  if (!date) return null;
  
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  
  // Reset time to midnight for accurate day calculation
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Format days until as readable string
 */
export function formatDaysUntil(date: string | Date | null): string {
  const days = daysUntil(date);
  
  if (days === null) return '-';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Format frequency for display
 */
export function formatFrequency(frequency: string): string {
  const map: Record<string, string> = {
    'weekly': 'Weekly',
    'bi-weekly': 'Bi-weekly',
    'monthly': 'Monthly',
    'quarterly': 'Quarterly',
    'yearly': 'Yearly',
    'one_time': 'One-time'
  };
  return map[frequency] || frequency;
}

/**
 * Format status with color class
 */
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    'pending': 'text-yellow-600 bg-yellow-100',
    'paid': 'text-green-600 bg-green-100',
    'overdue': 'text-red-600 bg-red-100',
    'scheduled': 'text-blue-600 bg-blue-100',
    'cancelled': 'text-gray-600 bg-gray-100'
  };
  return map[status] || 'text-gray-600 bg-gray-100';
}
