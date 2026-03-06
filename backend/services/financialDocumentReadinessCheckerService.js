// backend/services/financialDocumentReadinessCheckerService.js

class FinancialDocumentReadinessCheckerService {
  constructor(documentRepo) {
    this.documentRepo = documentRepo;
  }

  /**
   * Analyze user's financial document readiness
   * @param {String} userId
   * @param {Object} options { documentTypes, urgencyLevel }
   * @returns {Object} Readiness report, recommendations, summary
   */
  async analyzeReadiness(userId, options = {}) {
    const requiredDocs = this.getRequiredDocuments(options.documentTypes);
    const userDocs = await this.documentRepo.getUserDocuments(userId);
    const report = [];
    for (const docType of requiredDocs) {
      const userDoc = userDocs.find(d => d.type === docType);
      if (!userDoc) {
        report.push({
          documentType: docType,
          status: "missing",
          lastUpdated: null,
          recommendation: `Upload latest ${docType}.`
        });
      } else if (this.isOutdated(userDoc)) {
        report.push({
          documentType: docType,
          status: "outdated",
          lastUpdated: userDoc.lastUpdated,
          recommendation: `Update your ${docType}.`
        });
      } else {
        report.push({
          documentType: docType,
          status: "complete",
          lastUpdated: userDoc.lastUpdated
        });
      }
    }
    return {
      report,
      recommendations: this.generateRecommendations(report),
      summary: this.generateSummary(report)
    };
  }

  getRequiredDocuments(documentTypes) {
    // Example: return default set or filter by documentTypes
    const defaultDocs = [
      "Tax Return",
      "Loan Agreement",
      "Insurance Policy",
      "Pay Stub",
      "Emergency Fund Statement"
    ];
    if (documentTypes && Array.isArray(documentTypes)) {
      return defaultDocs.filter(doc => documentTypes.includes(doc));
    }
    return defaultDocs;
  }

  isOutdated(document) {
    // Example: consider outdated if lastUpdated > 1 year ago
    if (!document.lastUpdated) return true;
    const last = new Date(document.lastUpdated);
    const now = new Date();
    const diffYears = (now - last) / (1000 * 60 * 60 * 24 * 365);
    return diffYears > 1;
  }

  generateRecommendations(report) {
    const recs = [];
    for (const item of report) {
      if (item.status === "missing" || item.status === "outdated") {
        recs.push(item.recommendation);
      }
    }
    if (!recs.length) recs.push("All documents are up to date.");
    return recs;
  }

  generateSummary(report) {
    const totalDocuments = report.length;
    const missingDocuments = report.filter(r => r.status === "missing").length;
    const outdatedDocuments = report.filter(r => r.status === "outdated").length;
    const readyDocuments = report.filter(r => r.status === "complete").length;
    return {
      totalDocuments,
      missingDocuments,
      outdatedDocuments,
      readyDocuments,
      recommendations: this.generateRecommendations(report)
    };
  }
}

module.exports = FinancialDocumentReadinessCheckerService;
