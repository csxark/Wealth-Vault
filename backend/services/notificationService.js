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

  /**
   * GOVERNANCE NOTIFICATIONS
   */

  /**
   * Notify approver of pending request
   */
  async sendApprovalRequestNotification(approverUser, requesterName, vaultName, requestType, amount = null) {
    const subject = `🔔 Approval Required in "${vaultName}"`;
    const amountText = amount ? ` for ${amount}` : '';
    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Approval Request</h2>
        <p><strong>${requesterName}</strong> has requested approval for a <strong>${requestType}</strong>${amountText} in the vault <strong>"${vaultName}"</strong>.</p>
        <p>Please review and approve/reject this request in your Wealth Vault dashboard.</p>
        <p style="color: #666;">This request will expire in 7 days.</p>
      </div>
    `;

    await this.sendEmail(approverUser.email, subject, message);
    await this.sendNotification(approverUser.id, {
      title: subject,
      message: `${requesterName} requested ${requestType} approval in "${vaultName}"`,
      type: 'approval_request',
      data: { vault: vaultName, requester: requesterName }
    });
  }

  /**
   * Notify requester of approval/rejection
   */
  async sendApprovalDecisionNotification(requesterUser, decision, vaultName, reason = '') {
    const isApproved = decision === 'approved';
    const subject = isApproved
      ? `✅ Request Approved in "${vaultName}"`
      : `❌ Request Rejected in "${vaultName}"`;

    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Approval ${isApproved ? 'Granted' : 'Denied'}</h2>
        <p>Your request in <strong>"${vaultName}"</strong> has been <strong>${decision}</strong>.</p>
        ${reason ? `<p><em>Reason: ${reason}</em></p>` : ''}
      </div>
    `;

    await this.sendEmail(requesterUser.email, subject, message);
    await this.sendNotification(requesterUser.id, {
      title: subject,
      message: `Your request was ${decision}${reason ? `: ${reason}` : ''}`,
      type: isApproved ? 'approval_granted' : 'approval_denied'
    });
  }

  /**
   * Send proof-of-life challenge
   */
  async sendProofOfLifeChallenge(user, token, daysInactive) {
    const subject = `⚠️ Proof of Life Required - ${daysInactive} Days Inactive`;
    const verifyLink = `${process.env.FRONTEND_URL}/verify-activity?token=${token}`;

    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #fff3cd; border: 2px solid #ffc107;">
        <h2 style="color: #856404;">Activity Verification Required</h2>
        <p>We noticed you haven't been active on Wealth Vault for <strong>${daysInactive} days</strong>.</p>
        <p>To prevent your inheritance protocol from being triggered, please verify your activity:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background-color: #ffc107; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            VERIFY I'M ACTIVE
          </a>
        </p>
        <p style="color: #666; font-size: 12px;">Or copy this link: ${verifyLink}</p>
        <p><strong>Important:</strong> If you do not respond, your digital will may be executed according to your inheritance rules.</p>
      </div>
    `;

    await this.sendEmail(user.email, subject, message);
    await this.sendNotification(user.id, {
      title: subject,
      message: `Please verify your activity to prevent inheritance protocol activation`,
      type: 'proof_of_life',
      data: { daysInactive, token }
    });
  }

  /**
   * GOVERNANCE RESOLUTION NOTIFICATIONS (#453)
   */
  async sendGovernanceResolutionNotification(userId, resolution, vaultName) {
    const subject = `⚖️ Governance Resolution Required in "${vaultName}"`;
    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f1f5f9; border-left: 4px solid #6366f1;">
        <h2>Action Required: Spending Resolution</h2>
        <p>A new resolution has been proposed in <strong>"${vaultName}"</strong> that requires your vote.</p>
        <p><strong>Proposed Action:</strong> Spend of ${resolution.payload.amount} ${resolution.payload.currency || ''}</p>
        <p><strong>Expiry:</strong> ${new Date(resolution.expiresAt).toLocaleString()}</p>
        <p>Please log in to vote on this resolution.</p>
      </div>
    `;

    await this.sendNotification(userId, {
      title: subject,
      message: `Resolution required for proposed spend in "${vaultName}"`,
      type: 'governance_resolution',
      data: { resolutionId: resolution.id }
    });
  }

  /**
   * Notify beneficiaries of inheritance trigger
   */
  async sendInheritanceTriggeredNotification(beneficiaryUser, deceasedName, assetDescription) {
    const subject = `📜 Inheritance Protocol Activated`;
    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8f9fa; border-left: 4px solid #28a745;">
        <h2>Digital Will Execution</h2>
        <p>This is to inform you that an inheritance protocol has been triggered for <strong>${deceasedName}</strong>.</p>
        <p>According to their digital will, you are designated as a beneficiary for:</p>
        <blockquote style="background-color: #fff; padding: 15px; border-left: 3px solid #28a745;">
          ${assetDescription}
        </blockquote>
        <p>Please log in to your Wealth Vault account to review the details and complete any required verification.</p>
        <p style="color: #666;">Our condolences during this time.</p>
      </div>
    `;

    await this.sendEmail(beneficiaryUser.email, subject, message);
    await this.sendNotification(beneficiaryUser.id, {
      title: subject,
      message: `You have been designated as a beneficiary in ${deceasedName}'s digital will`,
      type: 'inheritance_triggered',
      data: { deceased: deceasedName, asset: assetDescription }
    });
  }

  /**
   * Notify trustee of inheritance requiring approval
   */
  async sendTrusteeNotification(trusteeUser, deceasedName, beneficiaryName) {
    const subject = `⚖️ Trustee Action Required`;
    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Trustee Responsibility Activated</h2>
        <p>As the designated trustee for <strong>${deceasedName}</strong>, your approval is required for the distribution of assets to <strong>${beneficiaryName}</strong>.</p>
        <p>Please review the inheritance details and approve or reject the distribution in your Wealth Vault dashboard.</p>
      </div>
    `;

    await this.sendEmail(trusteeUser.email, subject, message);
    await this.sendNotification(trusteeUser.id, {
      title: subject,
      message: `Trustee approval required for ${deceasedName}'s estate`,
      type: 'trustee_action',
      data: { deceased: deceasedName, beneficiary: beneficiaryName }
    });
  }

  /**
   * LIQUIDITY & CASH FLOW NOTIFICATIONS
   */

  /**
   * Send liquidity threshold warning
   */
  async sendLiquidityWarning(userId, { threshold, projectedDate, projectedBalance, severity }) {
    const isCritical = severity === 'critical' || projectedBalance < 0;
    const title = isCritical ? "🚨 CRITICAL: Liquidity Shortfall" : "⚠️ Liquidity Warning";
    const statusText = projectedBalance < 0 ? 'NEEDS ATTENTION' : 'LOW BALANCE';

    const message = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: ${isCritical ? '#fde2e2' : '#fff3cd'}; border-radius: 8px; border: 1px solid ${isCritical ? '#f87171' : '#fbbf24'};">
        <h3 style="margin-top: 0; color: ${isCritical ? '#991b1b' : '#92400e'};">${statusText}</h3>
        <p>Our forecast indicates your balance may hit <strong>${parseFloat(projectedBalance).toFixed(2)}</strong> on <strong>${projectedDate}</strong>.</p>
        <p>This is below your configured liquidity threshold of <strong>${parseFloat(threshold).toFixed(2)}</strong>.</p>
        <p style="margin-bottom: 0;">Consider moving funds from your savings or reducing upcoming expenses to avoid a shortfall.</p>
      </div>
    `;

    await this.sendEmailByUserId(userId, title, message);
    await this.sendNotification(userId, {
      title,
      message: `Balance projected to hit ${parseFloat(projectedBalance).toFixed(2)} on ${projectedDate}`,
      type: isCritical ? 'critical_liquidity' : 'liquidity_warning',
      data: { threshold, projectedDate, projectedBalance, severity }
    });
  }

  /**
   * Helper to send email by userId
   */
  async sendEmailByUserId(userId, subject, message) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user && user.email) {
      await this.sendEmail(user.email, subject, message);
    }
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
