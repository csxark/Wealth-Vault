import nodemailer from 'nodemailer';
import db from '../config/db.js';
import { budgetAlerts, users, securityEvents } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initEmailTransporter();
  }

  initEmailTransporter() {
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
    }
  }

  /**
   * Send a general notification to a user
   * @param {string} userId - ID of the user
   * @param {object} options - Notification options { title, message, type, data }
   */
  async sendNotification(userId, { title, message, type = 'info', data = {} }) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return;

      const preferences = user.preferences?.notifications || { email: true, push: true };

      // 1. Email Notification
      if (preferences.email && user.email) {
        await this.sendEmail(user.email, title, message);
      }

      // 2. In-App Notification (Stored as security events for visibility or a dedicated table)
      // For Wealth-Vault, we can use security_events or just log it for now as per project convention
      await db.insert(securityEvents).values({
        userId,
        eventType: `notification_${type}`,
        status: type,
        details: { title, message, ...data },
      });

      console.log(`[Notification] Sent to ${user.email}: ${title} - ${message}`);
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  }
  async sendBudgetAlert(alertData) {
    const { userId, categoryId, alertType, threshold, currentAmount, budgetAmount, message, notificationType, categoryName } = alertData;

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
        const emailResult = await this.sendEmailAlert(user, { ...alertData, categoryName });
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

      // Update alert metadata only if it's a regular budget alert (not a rule-triggered one)
      if (alertData.id && !alertData.metadata?.ruleId) {
        await db.update(budgetAlerts)
          .set({
            metadata: {
              ...alertData.metadata,
              sentAt: new Date().toISOString()
            },
            updatedAt: new Date()
          })
          .where(eq(budgetAlerts.id, alertData.id));
      }

      return results.every(result => result.success);

    } catch (error) {
      console.error('Error sending budget alert:', error);
      return false;
    }

  async sendEmail(to, subject, message) {
    if (!this.transporter) {
      console.warn("Email transporter not configured. Skipping email.");
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Wealth Vault'}" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text: message,
        html: `<div style="font-family: sans-serif; padding: 20px;">
                <h2>${subject}</h2>
                <p>${message}</p>
                <hr />
                <p style="font-size: 12px; color: #666;">This is an automated message from Wealth Vault.</p>
               </div>`,
      });
    } catch (error) {
      console.error("Email send error:", error);
    }
  }

  // Legacy support for budget alerts if needed, but budgetEngine now uses sendNotification
  async sendBudgetAlert(alertData) {
    return this.sendNotification(alertData.userId, {
      title: "Budget Alert",
      message: alertData.message,
      type: alertData.threshold >= 100 ? "error" : "warning",
      data: alertData
    });
  }
