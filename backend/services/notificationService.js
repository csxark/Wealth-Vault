import nodemailer from 'nodemailer';
import db from '../config/db.js';
import { budgetAlerts, users, securityEvents } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

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

  /**
   * Schedule a notification for a future date
   * @param {object} options - Notification options { userId, type, title, message, scheduledFor, data }
   * Note: For production, this would use a job queue (like Bull/Redis). 
   * For now, we'll check scheduled notifications when processing bills.
   */
  async scheduleNotification(options) {
    const { userId, type, title, message, scheduledFor, data } = options;
    
    try {
      // Store the scheduled notification in securityEvents with scheduled time
      // The actual sending will be handled by a cron job
      await db.insert(securityEvents).values({
        userId,
        eventType: `scheduled_notification_${type}`,
        status: 'scheduled',
        details: {
          title,
          message,
          scheduledFor: scheduledFor.toISOString(),
          data
        },
      });

      console.log(`[Scheduled Notification] ${title} scheduled for ${scheduledFor.toISOString()}`);
      return true;
    } catch (error) {
      console.error("Error scheduling notification:", error);
      return false;
    }
  }

  /**
   * Process scheduled notifications (called by cron job)
   */
  async processScheduledNotifications() {
    try {
      const now = new Date();

      // Find scheduled notifications that are due
      const scheduledNotifications = await db.query.securityEvents.findMany({
        where: and(
          sql`${securityEvents.eventType} LIKE 'scheduled_notification_%'`,
          eq(securityEvents.status, 'scheduled')
        )
      });

      let sentCount = 0;

      for (const notification of scheduledNotifications) {
        const scheduledFor = new Date(notification.details?.scheduledFor);
        
        if (scheduledFor <= now) {
          // Send the notification
          await this.sendNotification(notification.userId, {
            title: notification.details?.title,
            message: notification.details?.message,
            type: 'info',
            data: notification.details?.data
          });

          // Update status
          await db
            .update(securityEvents)
            .set({ status: 'sent' })
            .where(eq(securityEvents.id, notification.id));

          sentCount++;
        }
      }

      return sentCount;
    } catch (error) {
      console.error("Error processing scheduled notifications:", error);
      return 0;
    }
  }
}

export default new NotificationService();
