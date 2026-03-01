import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm';
import db from '../config/db.js';
import { subscriptions, categories, users } from '../db/schema.js';
import notificationService from './notificationService.js';

class SubscriptionService {
  /**
   * Calculate annual cost based on frequency and cost
   */
  calculateAnnualCost(cost, frequency) {
    const numericCost = parseFloat(cost);
    switch (frequency) {
      case 'weekly':
        return numericCost * 52;
      case 'monthly':
        return numericCost * 12;
      case 'quarterly':
        return numericCost * 4;
      case 'yearly':
        return numericCost;
      default:
        return numericCost * 12; // Default to monthly
    }
  }

  /**
   * Calculate next charge date based on renewal date and frequency
   */
  calculateNextChargeDate(renewalDate, frequency) {
    const date = new Date(renewalDate);
    const now = new Date();

    // If renewal date is in the past, calculate next occurrence
    while (date <= now) {
      switch (frequency) {
        case 'weekly':
          date.setDate(date.getDate() + 7);
          break;
        case 'monthly':
          date.setMonth(date.getMonth() + 1);
          break;
        case 'quarterly':
          date.setMonth(date.getMonth() + 3);
          break;
        case 'yearly':
          date.setFullYear(date.getFullYear() + 1);
          break;
        default:
          date.setMonth(date.getMonth() + 1);
      }
    }

    return date;
  }

  /**
   * Create a new subscription
   */
  async createSubscription(data) {
    try {
      const {
        userId,
        categoryId,
        serviceName,
        description,
        cost,
        currency = 'USD',
        frequency,
        renewalDate,
        autoRenewal = true,
        status = 'active',
        paymentMethod = 'credit_card',
        website,
        loginCredentials,
        tags = [],
        notes,
        isTrial = false,
        trialEndDate
      } = data;

      // Calculate annual cost and next charge date
      const annualCost = this.calculateAnnualCost(cost, frequency);
      const nextChargeDate = this.calculateNextChargeDate(renewalDate, frequency);

      const [newSubscription] = await db
        .insert(subscriptions)
        .values({
          userId,
          categoryId,
          serviceName,
          description,
          cost: cost.toString(),
          currency,
          frequency,
          renewalDate: new Date(renewalDate),
          autoRenewal,
          status,
          paymentMethod,
          website,
          loginCredentials,
          tags,
          notes,
          nextChargeDate,
          isTrial,
          trialEndDate: trialEndDate ? new Date(trialEndDate) : null,
          metadata: {
            detectedFromExpense: false,
            expenseId: null,
            annualCost: annualCost.toString(),
            costTrend: [],
            lastReminderSent: null
          }
        })
        .returning();

      // Schedule renewal reminder
      await this.scheduleRenewalReminder(newSubscription);

      return newSubscription;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscriptionById(id, userId) {
    try {
      const result = await db.query.subscriptions.findFirst({
        where: and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          },
          user: {
            columns: { currency: true }
          }
        }
      });
      return result;
    } catch (error) {
      console.error('Error getting subscription:', error);
      throw error;
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getSubscriptions(userId, filters = {}) {
    try {
      const {
        status = 'active',
        categoryId,
        sortBy = 'renewalDate',
        sortOrder = 'asc',
        limit = 50,
        offset = 0
      } = filters;

      const conditions = [eq(subscriptions.userId, userId)];

      if (status) conditions.push(eq(subscriptions.status, status));
      if (categoryId) conditions.push(eq(subscriptions.categoryId, categoryId));

      const sortFn = sortOrder === 'desc' ? desc : asc;
      let orderByColumn = subscriptions.renewalDate;
      if (sortBy === 'cost') orderByColumn = subscriptions.cost;
      if (sortBy === 'serviceName') orderByColumn = subscriptions.serviceName;
      if (sortBy === 'createdAt') orderByColumn = subscriptions.createdAt;

      const result = await db.query.subscriptions.findMany({
        where: and(...conditions),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        },
        orderBy: [sortFn(orderByColumn)],
        limit,
        offset
      });

      return result;
    } catch (error) {
      console.error('Error getting subscriptions:', error);
      throw error;
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(id, userId, updates) {
    try {
      const updateData = { ...updates, updatedAt: new Date() };

      // Recalculate derived fields if cost or frequency changed
      if (updates.cost || updates.frequency) {
        const existing = await this.getSubscriptionById(id, userId);
        if (existing) {
          const cost = updates.cost || existing.cost;
          const frequency = updates.frequency || existing.frequency;
          updateData.metadata = {
            ...existing.metadata,
            annualCost: this.calculateAnnualCost(cost, frequency).toString()
          };
        }
      }

      // Recalculate next charge date if renewal date or frequency changed
      if (updates.renewalDate || updates.frequency) {
        const existing = await this.getSubscriptionById(id, userId);
        if (existing) {
          const renewalDate = updates.renewalDate || existing.renewalDate;
          const frequency = updates.frequency || existing.frequency;
          updateData.nextChargeDate = this.calculateNextChargeDate(renewalDate, frequency);
        }
      }

      if (updateData.cost) updateData.cost = updateData.cost.toString();

      const [updated] = await db
        .update(subscriptions)
        .set(updateData)
        .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
        .returning();

      // Update reminder if renewal date changed
      if (updates.renewalDate || updates.frequency) {
        await this.scheduleRenewalReminder(updated);
      }

      return updated;
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(id, userId) {
    try {
      await db
        .delete(subscriptions)
        .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
    } catch (error) {
      console.error('Error deleting subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(id, userId, cancellationDate = new Date()) {
    try {
      const [updated] = await db
        .update(subscriptions)
        .set({
          status: 'cancelled',
          cancellationDate,
          updatedAt: new Date()
        })
        .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription analytics
   */
  async getSubscriptionAnalytics(userId, period = 'monthly') {
    try {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'weekly':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarterly':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case 'yearly':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // Total monthly cost
      const [totalResult] = await db
        .select({
          totalMonthly: sql`sum(CASE
            WHEN ${subscriptions.frequency} = 'weekly' THEN ${subscriptions.cost} * 4.33
            WHEN ${subscriptions.frequency} = 'monthly' THEN ${subscriptions.cost}
            WHEN ${subscriptions.frequency} = 'quarterly' THEN ${subscriptions.cost} / 3
            WHEN ${subscriptions.frequency} = 'yearly' THEN ${subscriptions.cost} / 12
            ELSE ${subscriptions.cost}
          END)`,
          totalAnnual: sql`sum(CASE
            WHEN ${subscriptions.frequency} = 'weekly' THEN ${subscriptions.cost} * 52
            WHEN ${subscriptions.frequency} = 'monthly' THEN ${subscriptions.cost} * 12
            WHEN ${subscriptions.frequency} = 'quarterly' THEN ${subscriptions.cost} * 4
            WHEN ${subscriptions.frequency} = 'yearly' THEN ${subscriptions.cost}
            ELSE ${subscriptions.cost} * 12
          END)`,
          count: sql`count(*)`
        })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        ));

      // By category
      const byCategory = await db
        .select({
          categoryId: subscriptions.categoryId,
          categoryName: categories.name,
          total: sql`sum(CASE
            WHEN ${subscriptions.frequency} = 'weekly' THEN ${subscriptions.cost} * 52
            WHEN ${subscriptions.frequency} = 'monthly' THEN ${subscriptions.cost} * 12
            WHEN ${subscriptions.frequency} = 'quarterly' THEN ${subscriptions.cost} * 4
            WHEN ${subscriptions.frequency} = 'yearly' THEN ${subscriptions.cost}
            ELSE ${subscriptions.cost} * 12
          END)`,
          count: sql`count(*)`
        })
        .from(subscriptions)
        .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
        .where(and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        ))
        .groupBy(subscriptions.categoryId, categories.name)
        .orderBy(desc(sql`sum(CASE
          WHEN ${subscriptions.frequency} = 'weekly' THEN ${subscriptions.cost} * 52
          WHEN ${subscriptions.frequency} = 'monthly' THEN ${subscriptions.cost} * 12
          WHEN ${subscriptions.frequency} = 'quarterly' THEN ${subscriptions.cost} * 4
          WHEN ${subscriptions.frequency} = 'yearly' THEN ${subscriptions.cost}
          ELSE ${subscriptions.cost} * 12
        END)`));

      // Upcoming renewals (next 30 days)
      const upcomingRenewals = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active'),
          gte(subscriptions.nextChargeDate, now),
          lte(subscriptions.nextChargeDate, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
        ),
        orderBy: [asc(subscriptions.nextChargeDate)],
        limit: 10
      });

      return {
        summary: {
          totalMonthly: Number(totalResult?.totalMonthly || 0),
          totalAnnual: Number(totalResult?.totalAnnual || 0),
          count: Number(totalResult?.count || 0)
        },
        byCategory: byCategory.map(item => ({
          categoryName: item.categoryName,
          total: Number(item.total),
          count: Number(item.count)
        })),
        upcomingRenewals
      };
    } catch (error) {
      console.error('Error getting subscription analytics:', error);
      throw error;
    }
  }

  /**
   * Schedule renewal reminder
   */
  async scheduleRenewalReminder(subscription) {
    try {
      // Schedule reminder 3 days before renewal
      const reminderDate = new Date(subscription.nextChargeDate);
      reminderDate.setDate(reminderDate.getDate() - 3);

      // Only schedule if reminder date is in the future
      if (reminderDate > new Date()) {
        await notificationService.scheduleNotification({
          userId: subscription.userId,
          type: 'subscription_renewal_reminder',
          title: 'Subscription Renewal Reminder',
          message: `${subscription.serviceName} will renew on ${subscription.nextChargeDate.toLocaleDateString()}`,
          scheduledFor: reminderDate,
          data: {
            subscriptionId: subscription.id,
            serviceName: subscription.serviceName,
            renewalDate: subscription.nextChargeDate,
            cost: subscription.cost,
            frequency: subscription.frequency
          }
        });
      }
    } catch (error) {
      console.error('Error scheduling renewal reminder:', error);
    }
  }

  /**
   * Process due renewals (for cron job)
   */
  async processDueRenewals() {
    try {
      const now = new Date();

      // Find subscriptions due for renewal
      const dueSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.status, 'active'),
          lte(subscriptions.nextChargeDate, now)
        )
      });

      for (const subscription of dueSubscriptions) {
        try {
          // Update last charged date
          await db
            .update(subscriptions)
            .set({
              lastChargedDate: subscription.nextChargeDate,
              nextChargeDate: this.calculateNextChargeDate(subscription.nextChargeDate, subscription.frequency),
              updatedAt: new Date()
            })
            .where(eq(subscriptions.id, subscription.id));

          // Send renewal notification
          await notificationService.sendNotification({
            userId: subscription.userId,
            type: 'subscription_renewed',
            title: 'Subscription Renewed',
            message: `${subscription.serviceName} has been renewed for ${subscription.currency} ${subscription.cost}`,
            data: {
              subscriptionId: subscription.id,
              serviceName: subscription.serviceName,
              cost: subscription.cost,
              currency: subscription.currency,
              frequency: subscription.frequency
            }
          });

          // Schedule next reminder
          const updatedSubscription = await this.getSubscriptionById(subscription.id, subscription.userId);
          await this.scheduleRenewalReminder(updatedSubscription);

        } catch (error) {
          console.error(`Error processing renewal for subscription ${subscription.id}:`, error);
        }
      }

      return dueSubscriptions.length;
    } catch (error) {
      console.error('Error processing due renewals:', error);
      throw error;
    }
  }
}

export default new SubscriptionService();
