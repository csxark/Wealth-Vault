import nodemailer from 'nodemailer';
import db from '../config/db.js';
import { budgetAlerts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initEmailTransporter();
  }

  initEmailTransporter() {
    // Initialize email transporter (configure with your email service)
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendBudgetAlert(alertData) {
    const { userId, categoryId, alertType, threshold, currentAmount, budgetAmount, message, notificationType } = alertData;

    try {
      // Get user preferences
      const [user] = await db.query.users.findMany({
        where: eq(users.id, userId),
        columns: { email: true, preferences: true, firstName: true }
      });

      if (!user) {
        console.error('User not found for budget alert');
        return false;
      }

      const notifications = user.preferences?.notifications || { email: true, push: true, sms: false };

      // Send notifications based on user preferences and alert type
      const results = [];

      if (notificationType === 'email' && notifications.email) {
        const emailResult = await this.sendEmailAlert(user, alertData);
        results.push({ type: 'email', success: emailResult });
      }

      if (notificationType === 'push' && notifications.push) {
        // For now, we'll store push notifications in the database
        // In a real app, you'd integrate with push notification services
        const pushResult = await this.storePushNotification(alertData);
        results.push({ type: 'push', success: pushResult });
      }

      if (notificationType === 'in_app') {
        const inAppResult = await this.storeInAppNotification(alertData);
        results.push({ type: 'in_app', success: inAppResult });
      }

      // Update alert metadata
      await db.update(budgetAlerts)
        .set({
          metadata: {
            ...alertData.metadata,
            sentAt: new Date().toISOString()
          },
          updatedAt: new Date()
        })
        .where(eq(budgetAlerts.id, alertData.id));

      return results.every(result => result.success);

    } catch (error) {
      console.error('Error sending budget alert:', error);
      return false;
    }
  }

  async sendEmailAlert(user, alertData) {
    if (!this.transporter) {
      console.warn('Email transporter not configured');
      return false;
    }

    try {
      const { categoryName, alertType, threshold, currentAmount, budgetAmount } = alertData;

      const subject = this.getAlertSubject(alertType, categoryName);
      const htmlContent = this.getAlertEmailTemplate(user, alertData);

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@wealthvault.com',
        to: user.email,
        subject,
        html: htmlContent
      });

      return true;
    } catch (error) {
      console.error('Error sending email alert:', error);
      return false;
    }
  }

  async storePushNotification(alertData) {
    // In a real implementation, you'd send to push notification service
    // For now, we'll just log it
    console.log('Push notification would be sent:', alertData);
    return true;
  }

  async storeInAppNotification(alertData) {
    // In-app notifications are already stored in the budget_alerts table
    // Mark as unread for the user
    try {
      await db.update(budgetAlerts)
        .set({ isRead: false })
        .where(eq(budgetAlerts.id, alertData.id));
      return true;
    } catch (error) {
      console.error('Error storing in-app notification:', error);
      return false;
    }
  }

  getAlertSubject(alertType, categoryName) {
    switch (alertType) {
      case 'approaching':
        return `Budget Alert: Approaching ${categoryName} Budget Limit`;
      case 'exceeded':
        return `Budget Alert: ${categoryName} Budget Exceeded`;
      case 'threshold':
        return `Budget Alert: ${categoryName} Budget Threshold Reached`;
      default:
        return `Budget Alert for ${categoryName}`;
    }
  }

  getAlertEmailTemplate(user, alertData) {
    const { categoryName, alertType, threshold, currentAmount, budgetAmount, message } = alertData;
    const percentage = ((currentAmount / budgetAmount) * 100).toFixed(1);

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Budget Alert</h2>
        <p>Hi ${user.firstName},</p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #dc3545; margin-top: 0;">${categoryName} Budget Alert</h3>
          <p><strong>Alert Type:</strong> ${alertType}</p>
          <p><strong>Current Spending:</strong> $${currentAmount.toFixed(2)} (${percentage}% of budget)</p>
          <p><strong>Budget Limit:</strong> $${budgetAmount.toFixed(2)}</p>
          <p><strong>Threshold:</strong> ${threshold}%</p>
        </div>

        <p>${message}</p>

        <p style="color: #666; font-size: 14px;">
          You can manage your budget settings in your Wealth Vault dashboard.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          This is an automated message from Wealth Vault. Please do not reply to this email.
        </p>
      </div>
    `;
  }

  async getUserAlerts(userId, options = {}) {
    const { limit = 20, offset = 0, unreadOnly = false } = options;

    try {
      const conditions = [eq(budgetAlerts.userId, userId)];
      if (unreadOnly) {
        conditions.push(eq(budgetAlerts.isRead, false));
      }

      const alerts = await db.query.budgetAlerts.findMany({
        where: and(...conditions),
        orderBy: (budgetAlerts, { desc }) => [desc(budgetAlerts.createdAt)],
        limit,
        offset,
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        }
      });

      return alerts;
    } catch (error) {
      console.error('Error fetching user alerts:', error);
      return [];
    }
  }

  async markAlertAsRead(alertId, userId) {
    try {
      const [updated] = await db.update(budgetAlerts)
        .set({ isRead: true, updatedAt: new Date() })
        .where(and(eq(budgetAlerts.id, alertId), eq(budgetAlerts.userId, userId)))
        .returning();

      return !!updated;
    } catch (error) {
      console.error('Error marking alert as read:', error);
      return false;
    }
  }

  async markAllAlertsAsRead(userId) {
    try {
      await db.update(budgetAlerts)
        .set({ isRead: true, updatedAt: new Date() })
        .where(eq(budgetAlerts.userId, userId));

      return true;
    } catch (error) {
      console.error('Error marking all alerts as read:', error);
      return false;
    }
  }
}

export default new NotificationService();
