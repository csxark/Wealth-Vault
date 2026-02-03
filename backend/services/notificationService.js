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
   * Send a general notification to a user (Hybrid: Email + In-App)
   * @param {string} userId - ID of the user
   * @param {object} options - Notification options { title, message, type, data }
   */
  async sendNotification(userId, { title, message, type = 'info', data = {} }) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return false;

      const preferences = user.preferences?.notifications || { email: true, push: true };

      // 1. Send Email if preferred
      if (preferences.email && user.email) {
        await this.sendEmail(user.email, title, message);
      }

      // 2. Store as Security Event (In-App Notification)
      await db.insert(securityEvents).values({
        userId,
        eventType: `notification_${type}`,
        status: 'success',
        details: { title, message, ...data },
      });

      console.log(`[Notification] Sent to ${user.email}: ${title}`);
      return true;
    } catch (error) {
      console.error("Failed to send notification:", error);
      return false;
    }
  }

  /**
   * Send raw email with premium styling
   */
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
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: white; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 32px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Wealth Vault</h1>
            </div>
            <div style="padding: 40px 32px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 24px; font-weight: 700;">${subject}</h2>
              <div style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">${message}</div>
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #f1f5f9; text-align: center;">
                <p style="color: #94a3b8; font-size: 14px; margin: 0;">This is an automated notification from your Secure Financial Hub.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      console.error("Email delivery failed:", error);
    }
  }

  /**
   * Budget Intelligence Alerts
   */
  async sendBudgetAlert(alertData) {
    const { userId, message, threshold } = alertData;
    const isCritical = threshold >= 100;
    
    await this.sendNotification(userId, {
      title: isCritical ? "🚫 Budget Limit Exceeded" : "⚠️ Budget Warning",
      message,
      type: isCritical ? "error" : "warning",
      data: alertData
    });

    if (alertData.id) {
      try {
        await db.update(budgetAlerts)
          .set({ metadata: { ...(alertData.metadata || {}), sentAt: new Date().toISOString() }, updatedAt: new Date() })
          .where(eq(budgetAlerts.id, alertData.id));
      } catch (e) {
        console.error("Failed to update budget alert metadata:", e);
      }
    }
  }

  /**
   * SUBSCRIPTION INTELLIGENCE NOTIFICATIONS
   */

  async sendRenewalReminder(userId, subscription) {
    const days = Math.ceil((new Date(subscription.nextRenewalDate) - new Date()) / 86400000);
    const title = `Renewal Reminder: ${subscription.name}`;
    const message = `Your <strong>${subscription.name}</strong> subscription renews in ${days} days for ${subscription.currency} ${subscription.amount}. Review your active plans to avoid unwanted charges.`;

    await this.sendNotification(userId, { title, message, type: 'info', data: { subId: subscription.id } });
  }

  async sendUnusedSubscriptionAlert(userId, subscription, months) {
    const title = `Waste Alert: Unused Subscription`;
    const message = `You haven't used your <strong>${subscription.name}</strong> subscription for over ${months} months. We recommend cancelling this to save approximately ${subscription.currency} ${subscription.amount} per ${subscription.billingCycle}.`;

    await this.sendNotification(userId, { title, message, type: 'warning', data: { subId: subscription.id, savings: subscription.amount } });
  }

  async sendCancellationSuggestion(userId, suggestion) {
    const title = `💡 Savings Opportunity Detected`;
    const message = `<strong>${suggestion.reason}</strong>. Potential annual savings: ₹${suggestion.potentialSavings}. Check the Subscription Intelligence dashboard to take action.`;

    await this.sendNotification(userId, { title, message, type: 'success', data: { suggestionId: suggestion.id } });
  }

  /**
   * DEBT & SETTLEMENT NOTIFICATIONS
   */

  async sendDebtReminderEmail({ user, vault, breakdown, totalOwing, isOverdue = false, daysOverdue = 0 }) {
    const urgency = isOverdue ? `🚨 OVERDUE` : '⏰ Reminder';
    const subject = `${urgency}: Vault Balance in "${vault.name}"`;
    const debtList = breakdown?.owes?.map(d => `<li><strong>${d.user.name}</strong>: ${vault.currency || 'INR'} ${parseFloat(d.amount).toFixed(2)}</li>`).join('') || '';
    
    const htmlMessage = `
        <p>Hello ${user.name},</p>
        <p>This is a ${isOverdue ? '<strong>priority reminder</strong>' : 'friendly reminder'} regarding your outstanding balance in the shared vault <strong>"${vault.name}"</strong>.</p>
        <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 18px; color: #1e293b;">Total Amount Owed: <strong>${vault.currency || 'INR'} ${totalOwing.toFixed(2)}</strong></p>
            ${isOverdue ? `<p style="color: #ef4444; margin: 4px 0 0 0;">Overdue by ${daysOverdue} days</p>` : ''}
        </div>
        ${debtList ? `<h4>Breakdown:</h4><ul>${debtList}</ul>` : ''}
        <p>Please visit the app to settle your balance.</p>
    `;
    
    await this.sendEmail(user.email, subject, htmlMessage);
  }

  async sendWeeklyDebtSummary({ user, vault, breakdown }) {
    const subject = `📊 Weekly Financial Summary: ${vault.name}`;
    const statusText = breakdown.netBalance < 0 ? `Outstanding: ${Math.abs(breakdown.netBalance).toFixed(2)}` : 'All Clear!';
    await this.sendEmail(user.email, subject, `Your weekly status for <strong>${vault.name}</strong>: ${statusText}`);
  }

  async sendSettlementConfirmation({ user, vault, settlement }) {
    const subject = `✅ Settlement Recorded in "${vault.name}"`;
    const message = `A payment of ${vault.currency || 'INR'} ${parseFloat(settlement.amount).toFixed(2)} was successfully recorded in your shared vault.`;
    await this.sendEmail(user.email, subject, message);
  }

  // Compatibility Shims
  async sendEmailAlert(user, data) { return this.sendEmail(user.email, "Wealth Vault Alert", data.message); }
  async storePushNotification(d) { return true; }
  async storeInAppNotification(d) { return true; }
}

export default new NotificationService();
