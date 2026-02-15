/**
 * Security AI Service
 * Uses Gemini AI to detect high-risk transaction descriptions and potential scams
 */

import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Common scam patterns and high-risk keywords
const SCAM_KEYWORDS = [
  'urgent', 'verify account', 'suspended', 'confirm identity', 'gift card',
  'bitcoin', 'cryptocurrency', 'wire transfer', 'western union', 'moneygram',
  'tax refund', 'irs', 'lottery', 'prize', 'inheritance', 'prince', 'nigerian',
  'phishing', 'click here', 'verify now', 'account locked', 'unusual activity',
  'fraud alert', 'security breach', 'act now', 'limited time', 'congratulations'
];

const HIGH_RISK_CATEGORIES = [
  'online gambling', 'casino', 'betting', 'cryptocurrency exchange',
  'unverified seller', 'peer-to-peer transfer', 'international wire',
  'gift cards', 'prepaid cards', 'money transfer service'
];

/**
 * Analyze transaction description for potential scams using AI
 * @param {Object} transactionData - Transaction data to analyze
 * @returns {Promise<Object>} AI analysis result
 */
export async function analyzeTransactionRisk(transactionData) {
  try {
    const { description, amount, paymentMethod, location, merchantInfo } = transactionData;

    // Quick keyword scan first
    const keywordFlags = detectScamKeywords(description);
    
    // If no API key, use rule-based analysis only
    if (!process.env.GEMINI_API_KEY) {
      return performRuleBasedAnalysis(transactionData, keywordFlags);
    }

    // Use Gemini AI for advanced analysis
    const prompt = `You are a financial security expert analyzing transactions for potential fraud, scams, or high-risk activities.

Transaction Details:
- Description: "${description}"
- Amount: $${amount}
- Payment Method: ${paymentMethod || 'unknown'}
- Location: ${location ? JSON.stringify(location) : 'not provided'}
- Merchant: ${merchantInfo ? JSON.stringify(merchantInfo) : 'not provided'}

Analyze this transaction and provide a JSON response with:
{
  "risk_score": 0-100 (0=safe, 100=definitely fraudulent),
  "is_suspicious": boolean,
  "scam_indicators": array of detected warning signs,
  "fraud_type": "potential scam type" or null,
  "confidence": 0-1 (confidence in the assessment),
  "recommendation": "clear/review/block",
  "explanation": "brief explanation of the assessment"
}

Consider:
1. Common scam patterns (fake invoices, phishing, romance scams, investment fraud)
2. Unusual transaction descriptions
3. High-risk payment methods (gift cards, crypto, wire transfers)
4. Suspicious merchant names or locations
5. Amount relative to described purpose

Respond ONLY with valid JSON, no additional text.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
    });

    const responseText = response?.text || '{}';
    
    // Extract JSON from response (remove markdown code blocks if present)
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').trim();
    }

    const aiAnalysis = JSON.parse(jsonText);

    // Combine AI analysis with keyword flags
    return {
      riskScore: aiAnalysis.risk_score || 0,
      isSuspicious: aiAnalysis.is_suspicious || keywordFlags.hasScamKeywords,
      scamIndicators: [...new Set([...(aiAnalysis.scam_indicators || []), ...keywordFlags.matchedKeywords])],
      fraudType: aiAnalysis.fraud_type || (keywordFlags.hasScamKeywords ? 'keyword_flagged' : null),
      confidence: aiAnalysis.confidence || 0.5,
      recommendation: aiAnalysis.recommendation || 'review',
      explanation: aiAnalysis.explanation || 'Transaction flagged for review',
      detectionMethod: 'ai_analysis',
      aiProvider: 'gemini',
      keywordMatches: keywordFlags.matchedKeywords
    };
  } catch (error) {
    console.error('Error in AI transaction analysis:', error);
    
    // Fallback to rule-based analysis
    const keywordFlags = detectScamKeywords(transactionData.description);
    return performRuleBasedAnalysis(transactionData, keywordFlags);
  }
}

/**
 * Detect scam keywords in transaction description
 * @param {string} description - Transaction description
 * @returns {Object} Keyword detection result
 */
function detectScamKeywords(description) {
  if (!description) {
    return { hasScamKeywords: false, matchedKeywords: [] };
  }

  const lowerDesc = description.toLowerCase();
  const matchedKeywords = SCAM_KEYWORDS.filter(keyword => 
    lowerDesc.includes(keyword.toLowerCase())
  );

  return {
    hasScamKeywords: matchedKeywords.length > 0,
    matchedKeywords,
    keywordCount: matchedKeywords.length
  };
}

/**
 * Perform rule-based analysis (fallback when AI unavailable)
 * @param {Object} transactionData - Transaction data
 * @param {Object} keywordFlags - Keyword detection results
 * @returns {Object} Analysis result
 */
function performRuleBasedAnalysis(transactionData, keywordFlags) {
  const { description, amount, paymentMethod } = transactionData;
  const parsedAmount = parseFloat(amount);

  let riskScore = 0;
  const scamIndicators = [];

  // Keyword-based risk
  if (keywordFlags.hasScamKeywords) {
    riskScore += keywordFlags.keywordCount * 15;
    scamIndicators.push(...keywordFlags.matchedKeywords);
  }

  // High-risk payment methods
  const highRiskPayments = ['gift_card', 'cryptocurrency', 'wire_transfer', 'bitcoin'];
  if (highRiskPayments.some(method => paymentMethod?.toLowerCase().includes(method))) {
    riskScore += 20;
    scamIndicators.push('high_risk_payment_method');
  }

  // Unusual description patterns
  if (description) {
    if (description.match(/\b[A-Z]{2,}\b/g)?.length > 3) { // Excessive capitals
      riskScore += 10;
      scamIndicators.push('excessive_capitalization');
    }

    if (description.match(/!{2,}/)) { // Multiple exclamation marks
      riskScore += 5;
      scamIndicators.push('excessive_punctuation');
    }

    if (description.length < 10 && parsedAmount > 500) {
      riskScore += 15;
      scamIndicators.push('vague_description_high_amount');
    }
  }

  // Amount-based risk
  if (parsedAmount > 10000) {
    riskScore += 20;
    scamIndicators.push('very_high_amount');
  } else if (parsedAmount > 5000) {
    riskScore += 10;
    scamIndicators.push('high_amount');
  }

  // Round numbers often indicate scams
  if (parsedAmount % 100 === 0 && parsedAmount > 1000) {
    riskScore += 5;
    scamIndicators.push('round_number_high_value');
  }

  // Cap risk score at 100
  riskScore = Math.min(riskScore, 100);

  // Determine recommendation
  let recommendation = 'clear';
  if (riskScore >= 70) {
    recommendation = 'block';
  } else if (riskScore >= 40) {
    recommendation = 'review';
  }

  return {
    riskScore,
    isSuspicious: riskScore >= 40,
    scamIndicators,
    fraudType: scamIndicators.length > 0 ? 'rule_based_detection' : null,
    confidence: 0.65,
    recommendation,
    explanation: riskScore >= 40 
      ? `Transaction flagged: ${scamIndicators.join(', ')}`
      : 'Transaction appears normal based on rule-based analysis',
    detectionMethod: 'rule_based',
    keywordMatches: keywordFlags.matchedKeywords
  };
}

/**
 * Batch analyze multiple transactions
 * @param {Array} transactions - Array of transactions to analyze
 * @returns {Promise<Array>} Array of analysis results
 */
export async function batchAnalyzeTransactions(transactions) {
  try {
    const results = await Promise.all(
      transactions.map(async (transaction) => {
        try {
          const analysis = await analyzeTransactionRisk(transaction);
          return {
            transactionId: transaction.id,
            ...analysis
          };
        } catch (error) {
          console.error(`Error analyzing transaction ${transaction.id}:`, error);
          return {
            transactionId: transaction.id,
            error: error.message,
            riskScore: 0,
            isSuspicious: false
          };
        }
      })
    );

    return results;
  } catch (error) {
    console.error('Error in batch transaction analysis:', error);
    throw error;
  }
}

/**
 * Generate security report with AI insights
 * @param {Object} userData - User data and statistics
 * @returns {Promise<Object>} Security report with AI recommendations
 */
export async function generateSecurityReport(userData) {
  try {
    const { userId, recentMarkers, spendingPattern, suspiciousCount } = userData;

    if (!process.env.GEMINI_API_KEY) {
      return {
        summary: `${suspiciousCount} suspicious transactions detected`,
        recommendations: [
          'Review all pending security markers',
          'Enable MFA for high-value transactions',
          'Monitor spending patterns regularly'
        ],
        riskLevel: suspiciousCount > 5 ? 'high' : suspiciousCount > 2 ? 'medium' : 'low'
      };
    }

    const prompt = `You are a financial security advisor analyzing a user's transaction security.

User Security Profile:
- Total suspicious transactions: ${suspiciousCount}
- Recent security markers: ${JSON.stringify(recentMarkers?.slice(0, 5) || [], null, 2)}
- Spending pattern: ${JSON.stringify(spendingPattern || {}, null, 2)}

Provide a JSON response with:
{
  "summary": "brief security assessment summary",
  "risk_level": "low/medium/high/critical",
  "key_concerns": array of primary security concerns,
  "recommendations": array of specific actions user should take,
  "positive_indicators": array of good security practices observed,
  "trends": "analysis of security trend over time"
}

Respond ONLY with valid JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
    });

    let jsonText = response?.text || '{}';
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').trim();
    }

    const report = JSON.parse(jsonText);

    return {
      summary: report.summary,
      riskLevel: report.risk_level,
      keyConcerns: report.key_concerns || [],
      recommendations: report.recommendations || [],
      positiveIndicators: report.positive_indicators || [],
      trends: report.trends,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating security report:', error);
    return {
      summary: 'Security analysis unavailable',
      riskLevel: 'unknown',
      recommendations: ['Contact support for manual security review'],
      generatedAt: new Date().toISOString()
    };
  }
}

/**
 * Check if merchant/description is on known scam database
 * @param {string} merchantName - Merchant or description
 * @returns {Object} Scam database check result
 */
export function checkScamDatabase(merchantName) {
  // In a production system, this would query a real scam database
  // For now, we use a simple pattern matching
  
  const knownScamPatters = [
    /nigerian\s+prince/i,
    /irs\s+tax\s+refund/i,
    /lottery\s+winner/i,
    /inheritance\s+claim/i,
    /verify\s+your\s+account/i,
    /suspended\s+account/i,
    /gift\s+card\s+required/i
  ];

  const matches = knownScamPatters.filter(pattern => pattern.test(merchantName));

  return {
    isKnownScam: matches.length > 0,
    matchedPatterns: matches.map(p => p.source),
    confidence: matches.length > 0 ? 0.95 : 0
  };
}

export default {
  analyzeTransactionRisk,
  batchAnalyzeTransactions,
  generateSecurityReport,
  checkScamDatabase,
  detectScamKeywords
};
