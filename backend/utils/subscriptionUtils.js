// backend/utils/subscriptionUtils.js

export function mapSubscriptionType(type) {
  // Example mapping logic
  const typeMap = {
    "Streaming": "streaming",
    "Music": "music",
    "Cloud Storage": "cloud_storage",
    "News": "news",
    "Other": "other"
  };
  return typeMap[type] || type;
}

export function checkRenewalDue(date) {
  if (!date) return false;
  const now = new Date();
  const renewal = new Date(date);
  const diffDays = (renewal - now) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

export function calculateRenewalInterval(history) {
  if (!history || history.length < 2) return null;
  const sorted = history.filter(h => h.action === "renewed").sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sorted.length < 2) return null;
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    total += (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / (1000 * 60 * 60 * 24);
  }
  return total / (sorted.length - 1);
}
