// backend/utils/documentUtils.js

function mapDocumentType(type) {
  // Example mapping logic
  const typeMap = {
    "Tax Return": "tax_return",
    "Loan Agreement": "loan_agreement",
    "Insurance Policy": "insurance_policy",
    "Pay Stub": "pay_stub",
    "Emergency Fund Statement": "emergency_fund_statement"
  };
  return typeMap[type] || type;
}

function checkExpiry(date) {
  if (!date) return true;
  const last = new Date(date);
  const now = new Date();
  const diffYears = (now - last) / (1000 * 60 * 60 * 24 * 365);
  return diffYears > 1;
}

module.exports = { mapDocumentType, checkExpiry };
