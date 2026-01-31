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
   * Send debt reminder email to user with outstanding balances
   * @param {Object} options - {user, vault, breakdown, totalOwing, isOverdue, daysOverdue}
   */
  async sendDebtReminderEmail({ user, vault, breakdown, totalOwing, isOverdue = false, daysOverdue = 0 }) {
    if (!this.transporter) {
      console.warn("Email transporter not configured. Skipping debt reminder email.");
      return;
    }

    const urgencyText = isOverdue ? `🔴 OVERDUE (${daysOverdue} days)` : '⏰ Reminder';
    const subject = `${urgencyText}: Outstanding Balance in "${vault.name}"`;

    // Build debt details list
    const debtDetails = breakdown.owes.map(debt => {
      return `  • ${debt.user.name}: ${vault.currency || 'USD'} ${debt.amount.toFixed(2)}`;
    }).join('\n');

    const message = `
Hello ${user.name},

${isOverdue 
  ? `This is an overdue reminder about your outstanding balance in the vault "${vault.name}".`
  : `This is a friendly reminder about your outstanding balance in the vault "${vault.name}".`
}

${isOverdue ? '⚠️ ' : ''}Total Amount You Owe: ${vault.currency || 'USD'} ${totalOwing.toFixed(2)}

Breakdown:
${debtDetails}

Please settle your balance at your earliest convenience to keep the vault finances up to date.

${isOverdue 
  ? `This balance has been outstanding for ${daysOverdue} days. Please prioritize settlement.`
  : 'You can settle this balance through the Wealth Vault app.'
}

Best regards,
The Wealth Vault Team
    `.trim();

    try {
      await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Wealth Vault'}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject,
        text: message,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 30px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
            <div style="background-color: ${isOverdue ? '#fee' : '#fff'}; padding: 20px; border-radius: 8px; border-left: 4px solid ${isOverdue ? '#d32f2f' : '#1976d2'};">
              <h2 style="color: ${isOverdue ? '#d32f2f' : '#1976d2'}; margin-top: 0;">
                ${isOverdue ? '🔴 Overdue Debt Reminder' : '⏰ Payment Reminder'}
              </h2>
              <p>Hello ${user.name},</p>
              <p>${isOverdue 
                ? `This is an <strong>overdue reminder</strong> about your outstanding balance in the vault <strong>"${vault.name}"</strong>.`
                : `This is a friendly reminder about your outstanding balance in the vault <strong>"${vault.name}"</strong>.`
              }</p>
              
              <div style="background-color: ${isOverdue ? '#ffebee' : '#e3f2fd'}; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #333;">Total Amount You Owe</h3>
                <p style="font-size: 28px; font-weight: bold; color: ${isOverdue ? '#d32f2f' : '#1976d2'}; margin: 10px 0;">
                  ${vault.currency || 'USD'} ${totalOwing.toFixed(2)}
                </p>
                ${isOverdue ? `<p style="color: #d32f2f; margin: 0;">Outstanding for ${daysOverdue} days</p>` : ''}
              </div>

              <h4 style="color: #333;">Breakdown:</h4>
              <ul style="list-style: none; padding: 0;">
                ${breakdown.owes.map(debt => `
                  <li style="padding: 8px 0; border-bottom: 1px solid #eee;">
                    <strong>${debt.user.name}</strong>: ${vault.currency || 'USD'} ${debt.amount.toFixed(2)}
                  </li>
                `).join('')}
              </ul>

              <p style="margin-top: 20px;">
                ${isOverdue 
                  ? '⚠️ This balance is overdue. Please prioritize settlement to avoid further reminders.'
                  : 'Please settle your balance at your earliest convenience to keep the vault finances up to date.'
                }
              </p>

              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/vaults/${vault.id}/settlements" 
                 style="display: inline-block; background-color: ${isOverdue ? '#d32f2f' : '#1976d2'}; color: white; 
                        padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px;">
                Settle Now
              </a>
            </div>
            
            <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
              <p>This is an automated message from Wealth Vault.</p>
              <p>You can manage your notification preferences in your account settings.</p>
            </div>
          </div>
        `
      });

      console.log(`[Debt Reminder] Sent to ${user.email} for vault "${vault.name}" (${totalOwing.toFixed(2)})`);
    } catch (error) {
      console.error("Debt reminder email send error:", error);
    }
  }

  /**
   * Send weekly debt summary to vault members
   * @param {Object} options - {user, vault, breakdown, debtStructure}
   */
  async sendWeeklyDebtSummary({ user, vault, breakdown, debtStructure }) {
    if (!this.transporter) {
      console.warn("Email transporter not configured. Skipping weekly summary.");
      return;
    }

    const subject = `📊 Weekly Debt Summary: "${vault.name}"`;

    const statusEmoji = breakdown.netBalance < 0 ? '💸' : breakdown.netBalance > 0 ? '💰' : '✅';
    const statusText = 
      breakdown.netBalance < 0 ? `You owe ${vault.currency || 'USD'} ${Math.abs(breakdown.netBalance).toFixed(2)}` :
      breakdown.netBalance > 0 ? `You are owed ${vault.currency || 'USD'} ${breakdown.netBalance.toFixed(2)}` :
      'You are all settled up!';

    const message = `
Hello ${user.name},

Here's your weekly debt summary for "${vault.name}":

${statusEmoji} Your Status: ${statusText}

${breakdown.owes.length > 0 ? `
You Owe:
${breakdown.owes.map(d => `  • ${d.user.name}: ${vault.currency || 'USD'} ${d.amount.toFixed(2)}`).join('\n')}
` : ''}

${breakdown.owed.length > 0 ? `
You Are Owed:
${breakdown.owed.map(d => `  • ${d.user.name}: ${vault.currency || 'USD'} ${d.amount.toFixed(2)}`).join('\n')}
` : ''}

Vault Total Outstanding: ${vault.currency || 'USD'} ${debtStructure.totalDebt.toFixed(2)}

Visit Wealth Vault to settle your balances.

Best regards,
The Wealth Vault Team
    `.trim();

    try {
      await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Wealth Vault'}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject,
        text: message,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 30px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
            <div style="background-color: #fff; padding: 25px; border-radius: 8px;">
              <h2 style="color: #1976d2; margin-top: 0;">📊 Weekly Debt Summary</h2>
              <p style="color: #666; font-size: 14px;">Vault: <strong>${vault.name}</strong></p>
              
              <div style="background-color: ${breakdown.netBalance < 0 ? '#ffebee' : breakdown.netBalance > 0 ? '#e8f5e9' : '#f5f5f5'}; 
                          padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; color: #666;">Your Status</p>
                <p style="font-size: 32px; margin: 10px 0;">${statusEmoji}</p>
                <p style="font-size: 18px; font-weight: bold; color: #333; margin: 0;">${statusText}</p>
              </div>

              ${breakdown.owes.length > 0 ? `
                <div style="margin: 20px 0;">
                  <h3 style="color: #d32f2f; margin-bottom: 10px;">💸 You Owe</h3>
                  <ul style="list-style: none; padding: 0;">
                    ${breakdown.owes.map(d => `
                      <li style="padding: 10px; background-color: #ffebee; margin-bottom: 8px; border-radius: 4px;">
                        <strong>${d.user.name}</strong>: ${vault.currency || 'USD'} ${d.amount.toFixed(2)}
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}

              ${breakdown.owed.length > 0 ? `
                <div style="margin: 20px 0;">
                  <h3 style="color: #388e3c; margin-bottom: 10px;">💰 You Are Owed</h3>
                  <ul style="list-style: none; padding: 0;">
                    ${breakdown.owed.map(d => `
                      <li style="padding: 10px; background-color: #e8f5e9; margin-bottom: 8px; border-radius: 4px;">
                        <strong>${d.user.name}</strong>: ${vault.currency || 'USD'} ${d.amount.toFixed(2)}
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}

              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0; color: #666;">
                  <strong>Vault Total Outstanding:</strong> ${vault.currency || 'USD'} ${debtStructure.totalDebt.toFixed(2)}
                </p>
              </div>

              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/vaults/${vault.id}/settlements" 
                 style="display: inline-block; background-color: #1976d2; color: white; 
                        padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 10px;">
                View Vault Details
              </a>
            </div>
            
            <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
              <p>This is an automated weekly summary from Wealth Vault.</p>
              <p>You can disable weekly summaries in your account settings.</p>
            </div>
          </div>
        `
      });

      console.log(`[Weekly Summary] Sent to ${user.email} for vault "${vault.name}"`);
    } catch (error) {
      console.error("Weekly summary email send error:", error);
    }
  }

  /**
   * Send settlement confirmation notification
   * @param {Object} options - {user, vault, settlement, otherUser}
   */
  async sendSettlementConfirmation({ user, vault, settlement, otherUser }) {
    const isPayer = settlement.payerId === user.id;
    const subject = `✅ Settlement ${settlement.status === 'confirmed' ? 'Confirmed' : 'Pending'} in "${vault.name}"`;

    const message = `
Hello ${user.name},

${settlement.status === 'confirmed' 
  ? `A settlement has been confirmed in "${vault.name}".`
  : `A new settlement has been created in "${vault.name}" and requires your confirmation.`
}

${isPayer ? 'You paid' : 'You received'}: ${vault.currency || 'USD'} ${parseFloat(settlement.amount).toFixed(2)}
${isPayer ? `To: ${otherUser.name}` : `From: ${otherUser.name}`}

${settlement.description ? `Description: ${settlement.description}` : ''}

${settlement.status === 'pending' 
  ? 'Please confirm this settlement in the Wealth Vault app.'
  : 'Your vault balance has been updated.'
}

Best regards,
The Wealth Vault Team
    `.trim();

    try {
      await this.sendEmail(user.email, subject, message);
      console.log(`[Settlement] Notification sent to ${user.email}`);
    } catch (error) {
      console.error("Settlement confirmation email send error:", error);
    }
  }
}

export default new NotificationService();
