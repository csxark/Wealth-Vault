/**
 * Credit Score Service
 * Handles credit score tracking, change detection, and alert generation
 */

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { creditScores, creditScoreAlerts, users } from '../db/schema.js';
import notificationService from './notificationService.js';

class CreditScoreService {
  /**
   * Get credit score rating based on score value
   */
  getRating(score) {
    if (score >= 800) return 'excellent';
    if (score >= 740) return 'very_good';
    if (score >= 670) return 'good';
    if (score >= 580) return 'fair';
    return 'poor';
  }

  /**
   * Get rating display name
   */
  getRatingDisplayName(rating) {
    const displayNames = {
      'excellent': 'Excellent',
      'very_good': 'Very Good',
      'good': 'Good',
      'fair': 'Fair',
      'poor': 'Poor'
    };
    return displayNames[rating] || rating;
  }

  /**
   * Get all credit scores for a user
   */
  async getCreditScores(userId, filters = {}) {
    try {
      const {
        bureau,
        isActive = true,
        sortBy = 'lastUpdated',
        sortOrder = 'desc',
        limit = 50,
        offset = 0
      } = filters;

      const conditions = [eq(creditScores.userId, userId)];

      if (bureau) conditions.push(eq(creditScores.bureau, bureau));
      if (isActive !== null) conditions.push(eq(creditScores.isActive, isActive));

      const sortFn = sortOrder === 'desc' ? desc : asc;
      let orderByColumn = creditScores.lastUpdated;
      if (sortBy === 'score') orderByColumn = creditScores.score;
      if (sortBy === 'bureau') orderByColumn = creditScores.bureau;
      if (sortBy === 'createdAt') orderByColumn = creditScores.createdAt;

      const result = await db.query.creditScores.findMany({
        where: and(...conditions),
        orderBy: [sortFn(orderByColumn)],
        limit,
        offset
      });

      return result;
    } catch (error) {
      console.error('Error getting credit scores:', error);
      throw error;
    }
  }

  /**
   * Get credit score by ID
   */
  async getCreditScoreById(id, userId) {
    try {
      const [score] = await db.query.creditScores.findMany({
        where: and(eq(creditScores.id, id), eq(creditScores.userId, userId))
      });
      return score;
    } catch (error) {
      console.error('Error getting credit score:', error);
      throw error;
    }
  }

  /**
   * Get latest credit scores for all bureaus
   */
  async getLatestCreditScores(userId) {
    try {
      // Get the most recent score for each bureau
      const bureaus = ['equifax', 'experian', 'transunion'];
      const latestScores = [];

      for (const bureau of bureaus) {
        const [score] = await db.query.creditScores.findMany({
          where: and(
            eq(creditScores.userId, userId),
            eq(creditScores.bureau, bureau),
            eq(creditScores.isActive, true)
          ),
          orderBy: [desc(creditScores.lastUpdated)],
          limit: 1
        });

        if (score) {
          latestScores.push(score);
        }
      }

      return latestScores;
    } catch (error) {
      console.error('Error getting latest credit scores:', error);
      throw error;
    }
  }

  /**
   * Create a new credit score entry
   */
  async createCreditScore(data) {
    try {
      const {
        userId,
        bureau,
        score,
        accountNumber,
        reportDate,
        factors = [],
        metadata = {}
      } = data;

      // Validate bureau
      const validBureaus = ['equifax', 'experian', 'transunion'];
      if (!validBureaus.includes(bureau)) {
        throw new Error(`Invalid bureau. Must be one of: ${validBureaus.join(', ')}`);
      }

      // Validate score range
      if (score < 300 || score > 850) {
        throw new Error('Credit score must be between 300 and 850');
      }

      // Get previous score for comparison
      const [previousScore] = await db.query.creditScores.findMany({
        where: and(
          eq(creditScores.userId, userId),
          eq(creditScores.bureau, bureau),
          eq(creditScores.isActive, true)
        ),
        orderBy: [desc(creditScores.lastUpdated)],
        limit: 1
      });

      const rating = this.getRating(score);
      const scoreChange = previousScore ? score - previousScore.score : 0;

      // Create new credit score record
      const [newCreditScore] = await db
        .insert(creditScores)
        .values({
          userId,
          bureau,
          score,
          rating,
          previousScore: previousScore?.score || null,
          scoreChange,
          factors,
          accountNumber: accountNumber ? this.maskAccountNumber(accountNumber) : null,
          reportDate: reportDate ? new Date(reportDate) : new Date(),
          metadata: {
            inquiryCount: metadata.inquiryCount || 0,
            accountCount: metadata.accountCount || 0,
            latePayments: metadata.latePayments || 0,
            creditUtilization: metadata.creditUtilization || 0,
            ...metadata
          },
          isActive: true,
          lastUpdated: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Generate alerts if score changed significantly
      if (previousScore && scoreChange !== 0) {
        await this.generateScoreChangeAlert(userId, newCreditScore, previousScore);
      }

      // Check for other alert conditions
      await this.checkAlertConditions(userId, newCreditScore, metadata);

      return newCreditScore;
    } catch (error) {
      console.error('Error creating credit score:', error);
      throw error;
    }
  }

  /**
   * Update a credit score
   */
  async updateCreditScore(id, userId, updates) {
    try {
      const updateData = { ...updates, updatedAt: new Date() };

      if (updates.score) {
        updateData.rating = this.getRating(updates.score);
      }

      if (updates.reportDate) {
        updateData.reportDate = new Date(updates.reportDate);
      }

      const [updated] = await db
        .update(creditScores)
        .set(updateData)
        .where(and(eq(creditScores.id, id), eq(creditScores.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error updating credit score:', error);
      throw error;
    }
  }

  /**
   * Delete a credit score
   */
  async deleteCreditScore(id, userId) {
    try {
      await db
        .delete(creditScores)
        .where(and(eq(creditScores.id, id), eq(creditScores.userId, userId)));
    } catch (error) {
      console.error('Error deleting credit score:', error);
      throw error;
    }
  }

  /**
   * Generate alert for score change
   */
  async generateScoreChangeAlert(userId, newScore, oldScore) {
    try {
      const change = newScore.score - oldScore.score;
      const alertType = change > 0 ? 'score_increase' : 'score_decrease';
      
      const message = change > 0
        ? `Your ${newScore.bureau} credit score increased by ${change} points to ${newScore.score}`
        : `Your ${newScore.bureau} credit score decreased by ${Math.abs(change)} points to ${newScore.score}`;

      const [alert] = await db
        .insert(creditScoreAlerts)
        .values({
          userId,
          creditScoreId: newScore.id,
          alertType,
          oldValue: oldScore.score,
          newValue: newScore.score,
          change,
          message,
          description: this.generateAlertDescription(alertType, change, newScore),
          isRead: false,
          metadata: {
            bureau: newScore.bureau,
            accountNumber: newScore.accountNumber,
            rating: newScore.rating,
            previousRating: oldScore.rating
          },
          createdAt: new Date()
        })
        .returning();

      // Send notification
      await notificationService.sendNotification(userId, {
        title: 'Credit Score Alert',
        message,
        type: change > 0 ? 'success' : 'warning',
        data: {
          alertId: alert.id,
          creditScoreId: newScore.id,
          bureau: newScore.bureau,
          change,
          newScore: newScore.score
        }
      });

      return alert;
    } catch (error) {
      console.error('Error generating score change alert:', error);
      throw error;
    }
  }

  /**
   * Check for other alert conditions
   */
  async checkAlertConditions(userId, creditScore, metadata) {
    try {
      const alerts = [];

      // Check for new inquiries
      if (metadata.inquiryCount > 0 && metadata.newInquiry) {
        alerts.push({
          alertType: 'new_inquiry',
          message: `New credit inquiry detected on your ${creditScore.bureau} report`,
          description: `A new hard inquiry was added to your ${creditScore.bureau} credit report. This may temporarily lower your score by a few points.`
        });
      }

      // Check for new accounts
      if (metadata.newAccount) {
        alerts.push({
          alertType: 'new_account',
          message: `New account opened on your ${creditScore.bureau} report`,
          description: `A new credit account was opened and reported to ${creditScore.bureau}. This can affect your credit age and utilization.`
        });
      }

      // Check for late payments
      if (metadata.latePayments > 0 && metadata.newLatePayment) {
        alerts.push({
          alertType: 'late_payment',
          message: `Late payment reported on your ${creditScore.bureau} report`,
          description: `A late payment was reported to ${creditScore.bureau}. This can significantly impact your credit score.`
        });
      }

      // Check for closed accounts
      if (metadata.accountClosed) {
        alerts.push({
          alertType: 'account_closed',
          message: `Account closed on your ${creditScore.bureau} report`,
          description: `An account was closed and reported to ${creditScore.bureau}. This may affect your credit utilization ratio.`
        });
      }

      // Create alerts
      for (const alertData of alerts) {
        const [alert] = await db
          .insert(creditScoreAlerts)
          .values({
            userId,
            creditScoreId: creditScore.id,
            alertType: alertData.alertType,
            message: alertData.message,
            description: alertData.description,
            isRead: false,
            metadata: {
              bureau: creditScore.bureau,
              accountNumber: creditScore.accountNumber,
              details: metadata
            },
            createdAt: new Date()
          })
          .returning();

        // Send notification
        await notificationService.sendNotification(userId, {
          title: 'Credit Report Alert',
          message: alertData.message,
          type: 'info',
          data: {
            alertId: alert.id,
            creditScoreId: creditScore.id,
            bureau: creditScore.bureau,
            alertType: alertData.alertType
          }
        });
      }

      return alerts;
    } catch (error) {
      console.error('Error checking alert conditions:', error);
      throw error;
    }
  }

  /**
   * Generate alert description
   */
  generateAlertDescription(alertType, change, creditScore) {
    const ratingDisplay = this.getRatingDisplayName(creditScore.rating);
    
    if (alertType === 'score_increase') {
      return `Great news! Your credit score has improved. Your ${creditScore.bureau} score is now ${creditScore.score} (${ratingDisplay}), which is ${change} points higher than before. This positive change may qualify you for better interest rates and loan terms.`;
    } else {
      return `Your credit score has decreased. Your ${creditScore.bureau} score is now ${creditScore.score} (${ratingDisplay}), which is ${Math.abs(change)} points lower than before. Review your credit report to understand what factors contributed to this change.`;
    }
  }

  /**
   * Get all alerts for a user
   */
  async getAlerts(userId, filters = {}) {
    try {
      const {
        isRead,
        alertType,
        bureau,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        limit = 50,
        offset = 0
      } = filters;

      const conditions = [eq(creditScoreAlerts.userId, userId)];

      if (isRead !== undefined) conditions.push(eq(creditScoreAlerts.isRead, isRead));
      if (alertType) conditions.push(eq(creditScoreAlerts.alertType, alertType));
      if (bureau) {
        conditions.push(sql`${creditScoreAlerts.metadata}->>'bureau' = ${bureau}`);
      }

      const sortFn = sortOrder === 'desc' ? desc : asc;
      let orderByColumn = creditScoreAlerts.createdAt;
      if (sortBy === 'isRead') orderByColumn = creditScoreAlerts.isRead;

      const result = await db.query.creditScoreAlerts.findMany({
        where: and(...conditions),
        with: {
          creditScore: {
            columns: { bureau: true, score: true, rating: true }
          }
        },
        orderBy: [sortFn(orderByColumn)],
        limit,
        offset
      });

      return result;
    } catch (error) {
      console.error('Error getting credit score alerts:', error);
      throw error;
    }
  }

  /**
   * Get alert by ID
   */
  async getAlertById(id, userId) {
    try {
      const [alert] = await db.query.creditScoreAlerts.findMany({
        where: and(eq(creditScoreAlerts.id, id), eq(creditScoreAlerts.userId, userId)),
        with: {
          creditScore: {
            columns: { bureau: true, score: true, rating: true }
          }
        }
      });
      return alert;
    } catch (error) {
      console.error('Error getting credit score alert:', error);
      throw error;
    }
  }

  /**
   * Mark alert as read
   */
  async markAlertAsRead(id, userId) {
    try {
      const [updated] = await db
        .update(creditScoreAlerts)
        .set({
          isRead: true,
          readAt: new Date()
        })
        .where(and(eq(creditScoreAlerts.id, id), eq(creditScoreAlerts.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error marking alert as read:', error);
      throw error;
    }
  }

  /**
   * Mark all alerts as read
   */
  async markAllAlertsAsRead(userId) {
    try {
      await db
        .update(creditScoreAlerts)
        .set({
          isRead: true,
          readAt: new Date()
        })
        .where(and(
          eq(creditScoreAlerts.userId, userId),
          eq(creditScoreAlerts.isRead, false)
        ));

      return { success: true, message: 'All alerts marked as read' };
    } catch (error) {
      console.error('Error marking all alerts as read:', error);
      throw error;
    }
  }

  /**
   * Delete an alert
   */
  async deleteAlert(id, userId) {
    try {
      await db
        .delete(creditScoreAlerts)
        .where(and(eq(creditScoreAlerts.id, id), eq(creditScoreAlerts.userId, userId)));
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw error;
    }
  }

  /**
   * Get credit score analytics
   */
  async getCreditScoreAnalytics(userId) {
    try {
      // Get all active scores
      const scores = await this.getCreditScores(userId, { isActive: true, limit: 1000 });

      // Group by bureau
      const byBureau = {};
      const bureaus = ['equifax', 'experian', 'transunion'];

      for (const bureau of bureaus) {
        const bureauScores = scores.filter(s => s.bureau === bureau);
        if (bureauScores.length > 0) {
          const latest = bureauScores[0];
          const previous = bureauScores[1];

          byBureau[bureau] = {
            latestScore: latest.score,
            previousScore: previous?.score || null,
            change: previous ? latest.score - previous.score : 0,
            rating: latest.rating,
            history: bureauScores.map(s => ({
              score: s.score,
              date: s.reportDate || s.createdAt,
              change: s.scoreChange
            })).reverse()
          };
        }
      }

      // Calculate average score
      const latestScores = Object.values(byBureau).map(b => b.latestScore);
      const averageScore = latestScores.length > 0
        ? Math.round(latestScores.reduce((a, b) => a + b, 0) / latestScores.length)
        : null;

      // Count unread alerts
      const unreadAlerts = await db.query.creditScoreAlerts.findMany({
        where: and(
          eq(creditScoreAlerts.userId, userId),
          eq(creditScoreAlerts.isRead, false)
        )
      });

      return {
        summary: {
          averageScore,
          totalBureaus: Object.keys(byBureau).length,
          unreadAlerts: unreadAlerts.length
        },
        byBureau,
        recentAlerts: unreadAlerts.slice(0, 5)
      };
    } catch (error) {
      console.error('Error getting credit score analytics:', error);
      throw error;
    }
  }

  /**
   * Mask account number for security
   */
  maskAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber.length < 4) return null;
    const last4 = accountNumber.slice(-4);
    return `****${last4}`;
  }

  /**
   * Simulate fetching credit scores from bureaus (for demo/testing)
   */
  async simulateBureauFetch(userId) {
    try {
      const bureaus = ['equifax', 'experian', 'transunion'];
      const results = [];

      for (const bureau of bureaus) {
        // Generate a realistic random score between 580 and 820
        const baseScore = Math.floor(Math.random() * (820 - 580 + 1)) + 580;
        
        // Add some randomness to make it realistic
        const score = Math.min(850, Math.max(300, baseScore + Math.floor(Math.random() * 20) - 10));

        const factors = this.generateRandomFactors(score);

        const creditScore = await this.createCreditScore({
          userId,
          bureau,
          score,
          accountNumber: `****${Math.floor(1000 + Math.random() * 9000)}`,
          reportDate: new Date(),
          factors,
          metadata: {
            inquiryCount: Math.floor(Math.random() * 5),
            accountCount: Math.floor(Math.random() * 20) + 5,
            latePayments: Math.floor(Math.random() * 3),
            creditUtilization: Math.floor(Math.random() * 100)
          }
        });

        results.push(creditScore);
      }

      return results;
    } catch (error) {
      console.error('Error simulating bureau fetch:', error);
      throw error;
    }
  }

  /**
   * Generate random factors based on score
   */
  generateRandomFactors(score) {
    const allFactors = [
      'Payment history',
      'Credit utilization',
      'Length of credit history',
      'Credit mix',
      'Recent inquiries',
      'New accounts',
      'Available credit',
      'Total balances'
    ];

    // Higher scores have fewer negative factors
    const numFactors = score > 750 ? 2 : score > 650 ? 3 : 4;
    const shuffled = allFactors.sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, numFactors).map(factor => ({
      name: factor,
      impact: Math.random() > 0.5 ? 'positive' : 'negative',
      description: `Your ${factor.toLowerCase()} is ${Math.random() > 0.5 ? 'helping' : 'affecting'} your score`
    }));
  }
}

export default new CreditScoreService();
