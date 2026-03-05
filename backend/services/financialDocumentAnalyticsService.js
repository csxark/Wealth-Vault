// backend/services/financialDocumentAnalyticsService.js

class FinancialDocumentAnalyticsService {
  constructor(documentRepo) {
    this.documentRepo = documentRepo;
  }

  /**
   * Advanced analytics for document readiness
   * @param {String} userId
   * @param {Object} options
   * @returns {Object} Analytics results
   */
  async getAnalytics(userId, options = {}) {
    const userDocs = await this.documentRepo.getUserDocuments(userId);
    const analytics = {
      expiryRisk: [],
      complianceIssues: [],
      urgencyScores: {},
      documentTrends: []
    };
    for (const doc of userDocs) {
      // Expiry risk
      if (this.isExpiringSoon(doc.lastUpdated)) {
        analytics.expiryRisk.push({
          documentType: doc.type,
          lastUpdated: doc.lastUpdated,
          message: `${doc.type} is expiring soon.`
        });
      }
      // Compliance check
      if (!this.isCompliant(doc)) {
        analytics.complianceIssues.push({
          documentType: doc.type,
          message: `${doc.type} may not meet compliance requirements.`
        });
      }
      // Urgency scoring
      analytics.urgencyScores[doc.type] = this.getUrgencyScore(doc);
      // Trends
      analytics.documentTrends.push({
        documentType: doc.type,
        updateFrequency: this.getUpdateFrequency(doc)
      });
    }
    return analytics;
  }

  isExpiringSoon(lastUpdated) {
    if (!lastUpdated) return true;
    const last = new Date(lastUpdated);
    const now = new Date();
    const diffMonths = (now - last) / (1000 * 60 * 60 * 24 * 30);
    return diffMonths > 11;
  }

  isCompliant(doc) {
    // Example: check if fileUrl exists and lastUpdated within 1 year
    return !!doc.fileUrl && !this.isExpiringSoon(doc.lastUpdated);
  }

  getUrgencyScore(doc) {
    // Example: higher score for missing/outdated docs
    if (!doc.lastUpdated) return 10;
    if (this.isExpiringSoon(doc.lastUpdated)) return 7;
    return 2;
  }

  getUpdateFrequency(doc) {
    // Example: calculate frequency based on history (stub)
    return "annual";
  }
}

module.exports = FinancialDocumentAnalyticsService;
