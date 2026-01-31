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

export default {
  sendLoginNotification,
  sendMFAEnabledNotification,
  sendMFADisabledNotification,
  sendSuspiciousActivityAlert,
  sendPasswordChangedNotification,
};
