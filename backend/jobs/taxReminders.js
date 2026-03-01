/**
 * Tax Reminders Job
 * Automated quarterly tax payment reminders and annual filing deadline alerts
 */

import cron from 'node-cron';
import { db } from '../config/db.js';
import { users, userTaxProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendEmail } from '../services/emailService.js';

/**
 * Get next quarterly payment deadline
 */
function getNextQuarterlyDeadline() {
  const now = new Date();
  const year = now.getFullYear();
  
  // Quarterly deadlines (adjusted for weekends)
  const deadlines = [
    { quarter: 'Q1', date: new Date(year, 3, 15), name: '1st Quarter' }, // April 15
    { quarter: 'Q2', date: new Date(year, 5, 15), name: '2nd Quarter' }, // June 15
    { quarter: 'Q3', date: new Date(year, 8, 15), name: '3rd Quarter' }, // September 15
    { quarter: 'Q4', date: new Date(year + 1, 0, 15), name: '4th Quarter' } // January 15 next year
  ];

  // Find next deadline
  for (const deadline of deadlines) {
    if (deadline.date > now) {
      const daysUntil = Math.ceil((deadline.date - now) / (1000 * 60 * 60 * 24));
      return {
        ...deadline,
        daysUntil
      };
    }
  }

  // If all deadlines passed, return Q1 of next year
  return {
    quarter: 'Q1',
    date: new Date(year + 1, 3, 15),
    name: '1st Quarter',
    daysUntil: Math.ceil((new Date(year + 1, 3, 15) - now) / (1000 * 60 * 60 * 24))
  };
}

/**
 * Get annual filing deadline
 */
function getAnnualFilingDeadline() {
  const now = new Date();
  const year = now.getFullYear();
  
  // April 15 of current year
  let deadline = new Date(year, 3, 15);
  
  // If passed, next year's deadline
  if (deadline < now) {
    deadline = new Date(year + 1, 3, 15);
  }
  
  // Adjust for weekends
  if (deadline.getDay() === 0) { // Sunday
    deadline.setDate(deadline.getDate() + 1);
  } else if (deadline.getDay() === 6) { // Saturday
    deadline.setDate(deadline.getDate() + 2);
  }
  
  const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  
  return {
    date: deadline,
    daysUntil,
    taxYear: year - 1 // Filing for previous year
  };
}

/**
 * Send quarterly tax reminder email
 */
async function sendQuarterlyTaxReminder(user, profile, nextDeadline) {
  try {
    const urgency = nextDeadline.daysUntil <= 7 ? 'urgent' : 'reminder';
    const urgencyColor = urgency === 'urgent' ? '#dc2626' : '#f59e0b';
    const urgencyText = urgency === 'urgent' ? 'URGENT' : 'REMINDER';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; text-align: center; color: white; margin-bottom: 20px;">
          <h1 style="margin: 0 0 10px 0; font-size: 32px;">🗓️ Quarterly Tax Payment Due</h1>
          <div style="background: ${urgencyColor}; display: inline-block; padding: 8px 20px; border-radius: 20px; font-weight: bold; margin-top: 10px;">
            ${urgencyText}: ${nextDeadline.daysUntil} Days Left
          </div>
        </div>

        <!-- Deadline Info -->
        <div style="background: white; border: 2px solid ${urgencyColor}; border-radius: 8px; padding: 25px; margin: 20px 0; text-align: center;">
          <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 24px;">${nextDeadline.name} Payment Deadline</h2>
          <div style="font-size: 48px; font-weight: bold; color: ${urgencyColor}; margin: 15px 0;">
            ${nextDeadline.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <p style="color: #64748b; font-size: 16px; margin: 10px 0;">
            ${nextDeadline.quarter} estimated tax payment is due
          </p>
        </div>

        <!-- Estimated Payment -->
        ${profile.estimatedQuarterlyPayments > 0 ? `
          <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; color: #1e293b;">Your Estimated Quarterly Payment</h3>
            <div style="font-size: 36px; font-weight: bold; color: #667eea;">
              $${profile.estimatedQuarterlyPayments.toFixed(2)}
            </div>
            <p style="color: #64748b; margin: 10px 0 0 0; font-size: 14px;">
              Based on your estimated annual tax liability
            </p>
          </div>
        ` : ''}

        <!-- Payment Methods -->
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #1e293b;">How to Pay</h3>
          <ul style="color: #475569; line-height: 1.8; padding-left: 20px;">
            <li><strong>IRS Direct Pay:</strong> <a href="https://www.irs.gov/payments/direct-pay" style="color: #667eea;">irs.gov/payments/direct-pay</a> (Free)</li>
            <li><strong>EFTPS:</strong> <a href="https://www.eftps.gov" style="color: #667eea;">eftps.gov</a> (Electronic Federal Tax Payment System)</li>
            <li><strong>Credit/Debit Card:</strong> Via approved payment processors (fees apply)</li>
            <li><strong>Check/Money Order:</strong> Mail with Form 1040-ES</li>
          </ul>
        </div>

        <!-- Action Items -->
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #92400e;">📋 Action Items</h3>
          <ul style="color: #78350f; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Review your year-to-date income and deductions in Wealth Vault</li>
            <li>Calculate your estimated quarterly payment (or use our estimate above)</li>
            <li>Make payment before ${nextDeadline.date.toLocaleDateString()}</li>
            <li>Keep payment confirmation for your records</li>
            <li>Log the payment in Wealth Vault as a new expense</li>
          </ul>
        </div>

        <!-- Penalties Warning -->
        ${nextDeadline.daysUntil <= 7 ? `
          <div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #991b1b;">⚠️ Late Payment Penalties</h3>
            <p style="color: #7f1d1d; margin: 0; line-height: 1.6;">
              Failing to make timely estimated tax payments may result in penalties and interest charges from the IRS. Don't wait until the last minute!
            </p>
          </div>
        ` : ''}

        <!-- Tax Dashboard Link -->
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tax-dashboard" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            View Tax Dashboard →
          </a>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding: 20px 0; color: #94a3b8; font-size: 14px; border-top: 1px solid #e2e8f0; margin-top: 30px;">
          <p style="margin: 0 0 5px 0;">This is an automated reminder from Wealth Vault</p>
          <p style="margin: 0; font-size: 12px;">Always consult with a tax professional for personalized advice</p>
        </div>
      </div>
    `;

    await sendEmail(
      user.email,
      `${urgencyText}: ${nextDeadline.name} Tax Payment Due in ${nextDeadline.daysUntil} Days`,
      emailHtml
    );

    console.log(`Quarterly tax reminder sent to ${user.email}`);
  } catch (error) {
    console.error(`Error sending quarterly tax reminder to ${user.email}:`, error);
  }
}

/**
 * Send annual filing reminder email
 */
async function sendAnnualFilingReminder(user, profile, filingInfo) {
  try {
    const urgency = filingInfo.daysUntil <= 14 ? 'urgent' : 'reminder';
    const urgencyColor = urgency === 'urgent' ? '#dc2626' : '#3b82f6';
    const urgencyText = urgency === 'urgent' ? 'URGENT' : 'REMINDER';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); border-radius: 12px; padding: 30px; text-align: center; color: white; margin-bottom: 20px;">
          <h1 style="margin: 0 0 10px 0;">📄 Annual Tax Filing Deadline</h1>
          <div style="background: ${urgencyColor}; display: inline-block; padding: 8px 20px; border-radius: 20px; font-weight: bold; margin-top: 10px;">
            ${urgencyText}: ${filingInfo.daysUntil} Days Until Deadline
          </div>
        </div>

        <!-- Deadline -->
        <div style="background: white; border: 2px solid ${urgencyColor}; border-radius: 8px; padding: 25px; margin: 20px 0; text-align: center;">
          <h2 style="margin: 0 0 15px 0; color: #1e293b;">Tax Year ${filingInfo.taxYear} Return Due</h2>
          <div style="font-size: 48px; font-weight: bold; color: ${urgencyColor}; margin: 15px 0;">
            ${filingInfo.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <!-- Filing Status -->
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #1e293b;">Your Filing Information</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 0; color: #64748b;">Filing Status:</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold;">
                ${profile.filingStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 0; color: #64748b;">Tax Bracket:</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold;">${profile.estimatedTaxBracket || 'Not calculated'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 0; color: #64748b;">YTD Tax Paid:</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold;">$${(profile.ytdTaxPaid || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b;">YTD Deductions:</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold;">$${(profile.ytdDeductions || 0).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <!-- Action Checklist -->
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #1e293b;">📋 Filing Checklist</h3>
          <ul style="color: #475569; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Gather all W-2s, 1099s, and other tax documents</li>
            <li>Review deductible expenses in Wealth Vault</li>
            <li>Download your Annual Tax Readiness Report</li>
            <li>Choose filing method (software, CPA, or self-file)</li>
            <li>Double-check all information for accuracy</li>
            <li>File return and keep confirmation</li>
            <li>Pay any remaining tax due before deadline</li>
          </ul>
        </div>

        <!-- Filing Options -->
        <div style="background: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #1e293b;">How to File</h3>
          <ul style="color: #475569; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li><strong>IRS Free File:</strong> Free for AGI under $79,000</li>
            <li><strong>Tax Software:</strong> TurboTax, H&R Block, TaxAct</li>
            <li><strong>Tax Professional:</strong> CPA or Enrolled Agent</li>
            <li><strong>Extension:</strong> File Form 4868 for 6-month extension (payment still due)</li>
          </ul>
        </div>

        <!-- CTA Buttons -->
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tax-dashboard" 
             style="display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px;">
            View Tax Dashboard
          </a>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/reports/tax-readiness" 
             style="display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px;">
            Download Tax Report
          </a>
        </div>

        <!-- Extension Warning -->
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #78350f; font-size: 14px;">
            <strong>💡 Need More Time?</strong> You can file for a 6-month extension, but any tax owed must still be paid by the original deadline to avoid penalties.
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding: 20px 0; color: #94a3b8; font-size: 14px; border-top: 1px solid #e2e8f0; margin-top: 30px;">
          <p style="margin: 0 0 5px 0;">Automated Reminder from Wealth Vault</p>
          <p style="margin: 0; font-size: 12px;">This is not tax advice. Consult a tax professional for your specific situation.</p>
        </div>
      </div>
    `;

    await sendEmail(
      user.email,
      `${urgencyText}: Tax Filing Deadline in ${filingInfo.daysUntil} Days (Tax Year ${filingInfo.taxYear})`,
      emailHtml
    );

    console.log(`Annual filing reminder sent to ${user.email}`);
  } catch (error) {
    console.error(`Error sending annual filing reminder to ${user.email}:`, error);
  }
}

/**
 * Main job function - Check and send quarterly reminders
 */
export async function runQuarterlyTaxReminders() {
  console.log('🗓️ Running quarterly tax reminders job...');

  try {
    const nextDeadline = getNextQuarterlyDeadline();

    // Send reminders 30, 14, 7, 3, and 1 day(s) before deadline
    const reminderDays = [30, 14, 7, 3, 1];
    
    if (!reminderDays.includes(nextDeadline.daysUntil)) {
      console.log(`No reminders today. Next deadline in ${nextDeadline.daysUntil} days (${nextDeadline.date.toDateString()})`);
      return;
    }

    console.log(`Sending ${nextDeadline.quarter} reminders (${nextDeadline.daysUntil} days until deadline)`);

    // Fetch all quarterly taxpayers
    const quarterlyTaxpayers = await db
      .select({
        user: users,
        profile: userTaxProfiles
      })
      .from(userTaxProfiles)
      .innerJoin(users, eq(users.id, userTaxProfiles.userId))
      .where(eq(userTaxProfiles.quarterlyTaxPayer, true));

    console.log(`Found ${quarterlyTaxpayers.length} quarterly taxpayers`);

    let sentCount = 0;
    let errorCount = 0;

    for (const { user, profile } of quarterlyTaxpayers) {
      try {
        await sendQuarterlyTaxReminder(user, profile, nextDeadline);
        sentCount++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to send reminder to ${user.email}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Quarterly tax reminders completed: ${sentCount} sent, ${errorCount} errors`);
  } catch (error) {
    console.error('❌ Quarterly tax reminders job failed:', error);
  }
}

/**
 * Main job function - Check and send annual filing reminders
 */
export async function runAnnualFilingReminders() {
  console.log('📄 Running annual filing reminders job...');

  try {
    const filingInfo = getAnnualFilingDeadline();

    // Send reminders 60, 30, 14, 7, 3, and 1 day(s) before deadline
    const reminderDays = [60, 30, 14, 7, 3, 1];
    
    if (!reminderDays.includes(filingInfo.daysUntil)) {
      console.log(`No reminders today. Filing deadline in ${filingInfo.daysUntil} days (${filingInfo.date.toDateString()})`);
      return;
    }

    console.log(`Sending annual filing reminders (${filingInfo.daysUntil} days until deadline)`);

    // Fetch all users with tax profiles
    const allUsers = await db
      .select({
        user: users,
        profile: userTaxProfiles
      })
      .from(userTaxProfiles)
      .innerJoin(users, eq(users.id, userTaxProfiles.userId));

    console.log(`Found ${allUsers.length} users with tax profiles`);

    let sentCount = 0;
    let errorCount = 0;

    for (const { user, profile } of allUsers) {
      try {
        await sendAnnualFilingReminder(user, profile, filingInfo);
        sentCount++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to send reminder to ${user.email}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Annual filing reminders completed: ${sentCount} sent, ${errorCount} errors`);
  } catch (error) {
    console.error('❌ Annual filing reminders job failed:', error);
  }
}

/**
 * Schedule tax reminder jobs
 */
export function scheduleTaxReminders() {
  // Run quarterly reminders daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Quarterly tax reminders scheduled task triggered');
    await runQuarterlyTaxReminders();
  }, {
    timezone: 'America/New_York'
  });

  // Run annual filing reminders daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Annual filing reminders scheduled task triggered');
    await runAnnualFilingReminders();
  }, {
    timezone: 'America/New_York'
  });

  console.log('📅 Tax reminder jobs scheduled (daily at 9:00 AM)');
}

export default {
  runQuarterlyTaxReminders,
  runAnnualFilingReminders,
  scheduleTaxReminders
};
