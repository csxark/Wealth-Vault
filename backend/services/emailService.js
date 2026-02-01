/**
 * Email Service for Security Notifications
 * Handles sending security-related emails (login alerts, MFA changes, etc.)
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create reusable transporter
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // Check if email is configured
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.warn('Email service not configured. Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD in .env');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  return transporter;
}

/**
 * Send email
 * @param {object} options - Email options
 * @returns {Promise<object>} Send result
 */
async function sendEmail({ to, subject, html, text }) {
  const emailTransporter = getTransporter();

  if (!emailTransporter) {
    console.log('Email would be sent:', { to, subject });
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const info = await emailTransporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Wealth-Vault'}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send login notification email
 * @param {object} params - Email parameters
 */
export async function sendLoginNotification({ email, userName, ipAddress, location, deviceInfo, timestamp }) {
  const locationStr = location ? `${location.city || 'Unknown'}, ${location.country || 'Unknown'}` : 'Unknown location';
  const deviceStr = deviceInfo?.deviceName || 'Unknown device';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #3B82F6; }
        .warning { background: #FEF3C7; border-left-color: #F59E0B; padding: 15px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; padding: 10px 20px; background: #3B82F6; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔒 New Login to Your Account</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>We detected a new login to your Wealth-Vault account.</p>
          
          <div class="info-box">
            <strong>Login Details:</strong><br>
            <strong>Time:</strong> ${new Date(timestamp).toLocaleString()}<br>
            <strong>Device:</strong> ${deviceStr}<br>
            <strong>IP Address:</strong> ${ipAddress}<br>
            <strong>Location:</strong> ${locationStr}
          </div>

          <div class="warning">
            <strong>⚠️ Was this you?</strong><br>
            If you recognize this activity, you can safely ignore this email.<br>
            If you don't recognize this login, please secure your account immediately by changing your password and enabling two-factor authentication.
          </div>

          <p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/security" class="button">Review Security Settings</a>
          </p>

          <p>For your security, we recommend:</p>
          <ul>
            <li>Enable two-factor authentication (2FA)</li>
            <li>Use a strong, unique password</li>
            <li>Never share your login credentials</li>
            <li>Review your account activity regularly</li>
          </ul>
        </div>
        <div class="footer">
          <p>This is an automated security notification from Wealth-Vault.<br>
          If you have concerns, please contact our support team.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    New Login to Your Wealth-Vault Account
    
    Hi ${userName},
    
    We detected a new login to your account.
    
    Login Details:
    - Time: ${new Date(timestamp).toLocaleString()}
    - Device: ${deviceStr}
    - IP Address: ${ipAddress}
    - Location: ${locationStr}
    
    If this wasn't you, please secure your account immediately by changing your password and enabling two-factor authentication.
    
    Visit: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/security
  `;

  return sendEmail({
    to: email,
    subject: '🔒 New Login to Your Wealth-Vault Account',
    html,
    text,
  });
}

/**
 * Send MFA enabled notification
 */
export async function sendMFAEnabledNotification({ email, userName, timestamp }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .success-box { background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Two-Factor Authentication Enabled</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          
          <div class="success-box">
            <strong>🎉 Great news!</strong><br>
            Two-factor authentication (2FA) has been successfully enabled on your Wealth-Vault account.
          </div>

          <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>

          <p>Your account is now more secure. You'll need to enter a verification code from your authenticator app each time you log in.</p>

          <p><strong>Important:</strong> Keep your recovery codes in a safe place. You'll need them if you lose access to your authenticator app.</p>

          <p>If you didn't enable 2FA, please contact support immediately.</p>
        </div>
        <div class="footer">
          <p>This is an automated security notification from Wealth-Vault.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Two-Factor Authentication Enabled
    
    Hi ${userName},
    
    Two-factor authentication has been successfully enabled on your Wealth-Vault account.
    
    Time: ${new Date(timestamp).toLocaleString()}
    
    Your account is now more secure. Remember to keep your recovery codes safe.
    
    If you didn't enable 2FA, please contact support immediately.
  `;

  return sendEmail({
    to: email,
    subject: '✅ Two-Factor Authentication Enabled',
    html,
    text,
  });
}

/**
 * Send MFA disabled notification
 */
export async function sendMFADisabledNotification({ email, userName, timestamp }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #EF4444; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .warning { background: #FEE2E2; border-left: 4px solid #EF4444; padding: 15px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; padding: 10px 20px; background: #EF4444; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Two-Factor Authentication Disabled</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          
          <div class="warning">
            <strong>Security Alert:</strong><br>
            Two-factor authentication (2FA) has been disabled on your Wealth-Vault account.
          </div>

          <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>

          <p>Your account is now less secure. We strongly recommend re-enabling 2FA to protect your financial data.</p>

          <p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/security" class="button">Re-enable 2FA</a>
          </p>

          <p>If you didn't disable 2FA, please secure your account immediately and contact support.</p>
        </div>
        <div class="footer">
          <p>This is an automated security notification from Wealth-Vault.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Two-Factor Authentication Disabled
    
    Hi ${userName},
    
    Two-factor authentication has been disabled on your Wealth-Vault account.
    
    Time: ${new Date(timestamp).toLocaleString()}
    
    Your account is now less secure. We recommend re-enabling 2FA.
    
    If you didn't disable 2FA, please secure your account immediately.
    
    Visit: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/security
  `;

  return sendEmail({
    to: email,
    subject: '⚠️ Two-Factor Authentication Disabled',
    html,
    text,
  });
}

/**
 * Send suspicious activity alert
 */
export async function sendSuspiciousActivityAlert({ email, userName, details, timestamp }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #DC2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .alert { background: #FEE2E2; border-left: 4px solid #DC2626; padding: 15px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; padding: 10px 20px; background: #DC2626; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚨 Suspicious Activity Detected</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          
          <div class="alert">
            <strong>⚠️ Security Alert:</strong><br>
            We detected unusual activity on your Wealth-Vault account that may require your attention.
          </div>

          <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
          <p><strong>Details:</strong> ${details}</p>

          <p><strong>Immediate actions you should take:</strong></p>
          <ul>
            <li>Review your recent account activity</li>
            <li>Change your password immediately</li>
            <li>Enable two-factor authentication if not already enabled</li>
            <li>Check for any unauthorized transactions</li>
          </ul>

          <p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/security" class="button">Secure My Account</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated security alert from Wealth-Vault.<br>
          If you need help, please contact our support team immediately.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    SUSPICIOUS ACTIVITY DETECTED
    
    Hi ${userName},
    
    We detected unusual activity on your Wealth-Vault account.
    
    Time: ${new Date(timestamp).toLocaleString()}
    Details: ${details}
    
    Immediate actions:
    - Review your recent account activity
    - Change your password immediately
    - Enable two-factor authentication
    - Check for unauthorized transactions
    
    Visit: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/security
  `;

  return sendEmail({
    to: email,
    subject: '🚨 Suspicious Activity Detected on Your Account',
    html,
    text,
  });
}

/**
 * Send password changed notification
 */
export async function sendPasswordChangedNotification({ email, userName, timestamp, ipAddress }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #3B82F6; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Changed</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>Your Wealth-Vault password was recently changed.</p>
          
          <div class="info-box">
            <strong>Time:</strong> ${new Date(timestamp).toLocaleString()}<br>
            <strong>IP Address:</strong> ${ipAddress}
          </div>

          <p>If you made this change, you can safely ignore this email.</p>
          <p>If you didn't change your password, please contact support immediately.</p>
        </div>
        <div class="footer">
          <p>This is an automated security notification from Wealth-Vault.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Password Changed
    
    Hi ${userName},
    
    Your Wealth-Vault password was changed.
    
    Time: ${new Date(timestamp).toLocaleString()}
    IP Address: ${ipAddress}
    
    If you didn't make this change, contact support immediately.
  `;

  return sendEmail({
    to: email,
    subject: '🔐 Your Password Was Changed',
    html,
    text,
  });
}

/**
 * Send anomaly detection alert email
 */
export async function sendAnomalyDetectionAlert({ email, userName, expense, anomalyDetails, severity }) {
  const severityColors = {
    low: '#FCD34D',
    medium: '#FB923C',
    high: '#F87171',
    critical: '#DC2626'
  };

  const severityEmojis = {
    low: '⚠️',
    medium: '🚨',
    high: '⛔',
    critical: '🚫'
  };

  const color = severityColors[severity] || severityColors.medium;
  const emoji = severityEmojis[severity] || '⚠️';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${color}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .alert-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid ${color}; }
        .expense-details { background: #FEF3C7; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .button { display: inline-block; padding: 10px 20px; background: #3B82F6; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${emoji} Unusual Transaction Detected</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>We detected an unusual transaction on your account that requires your attention.</p>
          
          <div class="expense-details">
            <strong>Transaction Details:</strong><br>
            <strong>Amount:</strong> $${parseFloat(expense.amount).toFixed(2)}<br>
            <strong>Description:</strong> ${expense.description}<br>
            <strong>Date:</strong> ${new Date(expense.date).toLocaleString()}<br>
            <strong>Payment Method:</strong> ${expense.paymentMethod || 'Not specified'}<br>
            ${expense.location ? `<strong>Location:</strong> ${typeof expense.location === 'string' ? expense.location : JSON.stringify(expense.location)}<br>` : ''}
          </div>

          <div class="alert-box">
            <strong>🔍 Why was this flagged?</strong><br>
            ${anomalyDetails.reason}<br><br>
            <strong>Severity Level:</strong> ${severity.toUpperCase()}<br>
            <strong>Confidence:</strong> ${(anomalyDetails.confidence * 100).toFixed(0)}%
          </div>

          ${anomalyDetails.requiresMFA ? `
          <div class="alert-box">
            <strong>⚡ Action Required:</strong><br>
            This transaction requires MFA verification before it can be cleared in your ledger.
          </div>
          ` : ''}

          <p><strong>What should you do?</strong></p>
          <ul>
            <li>Review the transaction details above</li>
            <li>If this was you, verify the transaction in your security dashboard</li>
            <li>If this wasn't you, block the transaction immediately</li>
            <li>Consider enabling additional security features</li>
          </ul>

          <p style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/review" class="button">Review Transaction</a>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/markers" class="button" style="background: #EF4444;">View All Alerts</a>
          </p>

          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            <strong>Security Tip:</strong> This alert is designed to protect your financial data. We recommend reviewing all flagged transactions promptly.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated security alert from Wealth-Vault.<br>
          Anomaly detection helps protect your account from unauthorized or suspicious activity.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    ${emoji} UNUSUAL TRANSACTION DETECTED
    
    Hi ${userName},
    
    We detected an unusual transaction on your account:
    
    Amount: $${parseFloat(expense.amount).toFixed(2)}
    Description: ${expense.description}
    Date: ${new Date(expense.date).toLocaleString()}
    
    Reason: ${anomalyDetails.reason}
    Severity: ${severity.toUpperCase()}
    ${anomalyDetails.requiresMFA ? '\n⚡ MFA Verification Required' : ''}
    
    Actions:
    - Review transaction: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/review
    - View all alerts: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/markers
    
    If this wasn't you, please block the transaction immediately.
  `;

  return sendEmail({
    to: email,
    subject: `${emoji} Unusual Transaction Detected: $${parseFloat(expense.amount).toFixed(2)}`,
    html,
    text,
  });
}

/**
 * Send AI-detected scam alert email
 */
export async function sendScamDetectionAlert({ email, userName, expense, aiAnalysis }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #DC2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .danger-box { background: #FEE2E2; padding: 15px; margin: 15px 0; border-left: 4px solid #DC2626; }
        .scam-indicators { background: white; padding: 15px; margin: 15px 0; }
        .button { display: inline-block; padding: 10px 20px; background: #DC2626; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚫 POTENTIAL SCAM DETECTED</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p><strong style="color: #DC2626;">URGENT:</strong> Our AI system has detected a potentially fraudulent transaction.</p>
          
          <div class="danger-box">
            <strong>⚠️ HIGH-RISK TRANSACTION</strong><br>
            <strong>Amount:</strong> $${parseFloat(expense.amount).toFixed(2)}<br>
            <strong>Description:</strong> ${expense.description}<br>
            <strong>Risk Score:</strong> ${aiAnalysis.riskScore}/100<br>
            <strong>Fraud Type:</strong> ${aiAnalysis.fraudType || 'Suspicious pattern'}
          </div>

          <div class="scam-indicators">
            <strong>🚩 Scam Indicators Detected:</strong>
            <ul>
              ${(aiAnalysis.scamIndicators || []).map(indicator => 
                `<li>${indicator.replace(/_/g, ' ').toUpperCase()}</li>`
              ).join('')}
            </ul>
          </div>

          <div class="danger-box">
            <strong>AI Analysis:</strong><br>
            ${aiAnalysis.explanation}<br><br>
            <strong>Recommendation:</strong> ${aiAnalysis.recommendation?.toUpperCase()}
          </div>

          <p><strong>⚡ IMMEDIATE ACTION REQUIRED:</strong></p>
          <ul>
            <li><strong>DO NOT</strong> proceed with this transaction if you're unsure</li>
            <li>Verify the merchant/recipient independently</li>
            <li>Check for signs of phishing or social engineering</li>
            <li>Contact support if you need assistance</li>
          </ul>

          <p style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/review" class="button">BLOCK TRANSACTION</a>
          </p>

          <p style="background: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0;">
            <strong>⚠️ Common Scam Warning Signs:</strong><br>
            • Urgent requests for money<br>
            • Requests for gift cards or cryptocurrency<br>
            • Claims of account suspension or verification<br>
            • "Too good to be true" offers<br>
            • Pressure to act immediately
          </p>
        </div>
        <div class="footer">
          <p>This is a critical security alert from Wealth-Vault.<br>
          Our AI-powered scam detection helps protect you from fraudulent transactions.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    🚫 POTENTIAL SCAM DETECTED
    
    Hi ${userName},
    
    URGENT: Our AI has detected a potentially fraudulent transaction.
    
    Amount: $${parseFloat(expense.amount).toFixed(2)}
    Description: ${expense.description}
    Risk Score: ${aiAnalysis.riskScore}/100
    
    Scam Indicators:
    ${(aiAnalysis.scamIndicators || []).map(i => `- ${i}`).join('\n')}
    
    Recommendation: ${aiAnalysis.recommendation?.toUpperCase()}
    
    ${aiAnalysis.explanation}
    
    IMMEDIATE ACTION REQUIRED - Review this transaction:
    ${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/review
    
    If unsure, DO NOT proceed and contact support.
  `;

  return sendEmail({
    to: email,
    subject: '🚫 URGENT: Potential Scam Detected - Action Required',
    html,
    text,
  });
}

/**
 * Send security summary report email
 */
export async function sendSecuritySummaryReport({ email, userName, stats, period = '30 days' }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
        .stat-card { background: white; padding: 15px; border-radius: 5px; text-align: center; border: 1px solid #E5E7EB; }
        .stat-number { font-size: 28px; font-weight: bold; color: #3B82F6; }
        .stat-label { font-size: 12px; color: #666; }
        .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #3B82F6; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛡️ Security Summary Report</h1>
          <p>Last ${period}</p>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>Here's your account security summary for the past ${period}:</p>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${stats.total || 0}</div>
              <div class="stat-label">Total Security Events</div>
            </div>
            <div class="stat-card">
              <div class="stat-number" style="color: #F59E0B;">${stats.pending || 0}</div>
              <div class="stat-label">Pending Review</div>
            </div>
            <div class="stat-card">
              <div class="stat-number" style="color: #10B981;">${stats.cleared || 0}</div>
              <div class="stat-label">Cleared</div>
            </div>
            <div class="stat-card">
              <div class="stat-number" style="color: #EF4444;">${stats.critical || 0}</div>
              <div class="stat-label">Critical Alerts</div>
            </div>
          </div>

          ${stats.pending > 0 ? `
          <div class="info-box" style="border-left-color: #F59E0B; background: #FEF3C7;">
            <strong>⚠️ Action Required:</strong><br>
            You have ${stats.pending} transaction${stats.pending > 1 ? 's' : ''} waiting for your review.
          </div>
          ` : `
          <div class="info-box" style="border-left-color: #10B981; background: #D1FAE5;">
            <strong>✅ All Clear:</strong><br>
            No pending security items requiring your attention.
          </div>
          `}

          <p><strong>Security Status:</strong> ${
            stats.critical > 0 ? '🔴 High Risk - Immediate attention needed' :
            stats.pending > 3 ? '🟡 Medium Risk - Review recommended' :
            '🟢 Good - Keep monitoring'
          }</p>

          <p style="text-align: center; margin: 25px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/dashboard" 
               style="display: inline-block; padding: 12px 24px; background: #3B82F6; color: white; text-decoration: none; border-radius: 5px;">
              View Security Dashboard
            </a>
          </p>

          <p style="color: #666; font-size: 14px;">
            <strong>Pro Tip:</strong> Regular security reviews help keep your financial data safe. 
            We recommend checking your security dashboard at least once a week.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated weekly security report from Wealth-Vault.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    🛡️ SECURITY SUMMARY REPORT
    Last ${period}
    
    Hi ${userName},
    
    Security Summary:
    - Total Events: ${stats.total || 0}
    - Pending Review: ${stats.pending || 0}
    - Cleared: ${stats.cleared || 0}
    - Critical Alerts: ${stats.critical || 0}
    
    ${stats.pending > 0 ? `⚠️ ${stats.pending} transaction(s) need your review` : '✅ No pending items'}
    
    View your security dashboard:
    ${process.env.FRONTEND_URL || 'http://localhost:3000'}/security/dashboard
  `;

  return sendEmail({
    to: email,
    subject: `🛡️ Your Security Summary - ${period}`,
    html,
    text,
  });
}

export default {
  sendLoginNotification,
  sendMFAEnabledNotification,
  sendMFADisabledNotification,
  sendSuspiciousActivityAlert,
  sendPasswordChangedNotification,
  sendAnomalyDetectionAlert,
  sendScamDetectionAlert,
  sendSecuritySummaryReport,
};
