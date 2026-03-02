/**
 * Email Verification Service
 * Handles email verification tokens, sending verification emails, and verification logic
 */

import crypto from 'crypto';
import { eq, and, lt } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import { sendEmail } from './emailService.js';

/**
 * Generate a secure email verification token
 * @returns {string} Verification token
 */
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate verification token expiry (24 hours from now)
 * @returns {Date} Expiry date
 */
function generateVerificationExpiry() {
  const now = new Date();
  now.setHours(now.getHours() + 24); // 24 hours
  return now;
}

/**
 * Send email verification email
 * @param {string} email - User's email
 * @param {string} firstName - User's first name
 * @param {string} verificationToken - Verification token
 */
async function sendVerificationEmail(email, firstName, verificationToken) {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .verification-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #10B981; text-align: center; }
        .button { display: inline-block; padding: 15px 30px; background: #10B981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .warning { background: #FEF3C7; border-left-color: #F59E0B; padding: 15px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Verify Your Email Address</h1>
        </div>
        <div class="content">
          <p>Hi ${firstName},</p>
          <p>Welcome to Wealth-Vault! To complete your registration and secure your account, please verify your email address.</p>

          <div class="verification-box">
            <h3>Click the button below to verify your email:</h3>
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>

          <div class="warning">
            <strong>⚠️ This link will expire in 24 hours.</strong><br>
            If the button doesn't work, copy and paste this URL into your browser:<br>
            <small>${verificationUrl}</small>
          </div>

          <p>Once verified, you'll have full access to your Wealth-Vault account including:</p>
          <ul>
            <li>Budget tracking and financial planning</li>
            <li>Expense categorization and analytics</li>
            <li>Goal setting and progress tracking</li>
            <li>Security features and notifications</li>
          </ul>

          <p>If you didn't create an account with Wealth-Vault, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This email was sent by Wealth-Vault.<br>
          If you have any questions, please contact our support team.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Verify Your Email Address - Wealth-Vault

    Hi ${firstName},

    Welcome to Wealth-Vault! To complete your registration, please verify your email address by clicking the link below:

    ${verificationUrl}

    This link will expire in 24 hours.

    If you didn't create an account with Wealth-Vault, please ignore this email.

    Best regards,
    The Wealth-Vault Team
  `;

  return await sendEmail({
    to: email,
    subject: 'Verify Your Email Address - Wealth-Vault',
    html,
    text
  });
}

/**
 * Send email verification reminder
 * @param {string} email - User's email
 * @param {string} firstName - User's first name
 * @param {string} verificationToken - Verification token
 */
async function sendVerificationReminder(email, firstName, verificationToken) {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .verification-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #F59E0B; text-align: center; }
        .button { display: inline-block; padding: 15px 30px; background: #F59E0B; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Email Verification Reminder</h1>
        </div>
        <div class="content">
          <p>Hi ${firstName},</p>
          <p>We noticed you haven't verified your email address yet. To fully activate your Wealth-Vault account, please verify your email.</p>

          <div class="verification-box">
            <h3>Click here to verify your email:</h3>
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>

          <p>Your verification link will expire soon. Don't miss out on accessing all Wealth-Vault features!</p>

          <p>If you have any issues, please contact our support team.</p>
        </div>
        <div class="footer">
          <p>This is a reminder from Wealth-Vault.<br>
          If you've already verified your email, you can safely ignore this message.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Email Verification Reminder - Wealth-Vault

    Hi ${firstName},

    We noticed you haven't verified your email address yet. To fully activate your account, please verify your email by clicking the link below:

    ${verificationUrl}

    Your verification link will expire soon.

    If you've already verified your email, you can safely ignore this message.

    Best regards,
    The Wealth-Vault Team
  `;

  return await sendEmail({
    to: email,
    subject: 'Email Verification Reminder - Wealth-Vault',
    html,
    text
  });
}

/**
 * Create email verification token for user
 * @param {string} userId - User ID
 * @returns {string} Verification token
 */
export async function createEmailVerification(userId) {
  const verificationToken = generateVerificationToken();
  const verificationExpiry = generateVerificationExpiry();

  // Update user with verification token
  await db
    .update(users)
    .set({
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpiry,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));

  return verificationToken;
}

/**
 * Send verification email to user
 * @param {string} userId - User ID
 * @param {boolean} isReminder - Whether this is a reminder email
 */
export async function sendEmailVerification(userId, isReminder = false) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      emailVerified: users.emailVerified,
      emailVerificationToken: users.emailVerificationToken
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new Error('User not found');
  }

  if (user.emailVerified) {
    throw new Error('Email already verified');
  }

  let verificationToken = user.emailVerificationToken;

  // Generate new token if none exists or if this is a reminder
  if (!verificationToken || isReminder) {
    verificationToken = await createEmailVerification(userId);
  }

  // Send appropriate email
  if (isReminder) {
    return await sendVerificationReminder(user.email, user.firstName, verificationToken);
  } else {
    return await sendVerificationEmail(user.email, user.firstName, verificationToken);
  }
}

/**
 * Verify email with token
 * @param {string} token - Verification token
 * @returns {object} Verification result
 */
export async function verifyEmail(token) {
  // Find user with matching token that hasn't expired
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.emailVerificationToken, token),
        lt(users.emailVerificationExpires, new Date()) // Not expired
      )
    );

  if (!user) {
    return { success: false, message: 'Invalid or expired verification token' };
  }

  if (user.emailVerified) {
    return { success: false, message: 'Email already verified' };
  }

  // Update user as verified and clear verification fields
  await db
    .update(users)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      updatedAt: new Date()
    })
    .where(eq(users.id, user.id));

  return {
    success: true,
    message: 'Email verified successfully',
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    }
  };
}

/**
 * Check if user's email is verified
 * @param {string} userId - User ID
 * @returns {boolean} Whether email is verified
 */
export async function isEmailVerified(userId) {
  const [user] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId));

  return user?.emailVerified || false;
}

/**
 * Clean up expired verification tokens (should be run periodically)
 */
export async function cleanupExpiredTokens() {
  const now = new Date();

  await db
    .update(users)
    .set({
      emailVerificationToken: null,
      emailVerificationExpires: null,
      updatedAt: now
    })
    .where(
      and(
        eq(users.emailVerified, false),
        lt(users.emailVerificationExpires, now)
      )
    );
}