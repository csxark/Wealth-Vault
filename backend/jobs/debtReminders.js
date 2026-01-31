/**
 * Debt Reminders Job
 * Automated weekly summaries of outstanding debts in collaborative vaults
 */

import { db } from '../config/db.js';
import { vaultBalances, vaultMembers, vaults, users } from '../db/schema.js';
import { eq, and, ne, sql } from 'drizzle-orm';
import { getSimplifiedDebts, getUserDebtBreakdown } from '../services/settlementService.js';
import { sendDebtReminderEmail, sendWeeklyDebtSummary } from '../services/notificationService.js';

let isRunning = false;
let lastRun = null;
let scheduledJob = null;

/**
 * Send debt reminders to users with outstanding balances
 */
async function sendDebtReminders() {
    if (isRunning) {
        console.log('⏭️ Debt reminders job already running, skipping...');
        return;
    }

    isRunning = true;
    console.log('📧 Starting debt reminders job...');

    try {
        const startTime = Date.now();
        let remindersSent = 0;
        let usersNotified = 0;

        // Get all active vaults
        const activeVaults = await db
            .select()
            .from(vaults)
            .where(eq(vaults.isActive, true));

        console.log(`📊 Processing ${activeVaults.length} active vaults`);

        for (const vault of activeVaults) {
            try {
                // Get all members with non-zero balances
                const membersWithBalances = await db
                    .select({
                        userId: vaultBalances.userId,
                        balance: vaultBalances.balance,
                        user: {
                            id: users.id,
                            name: users.name,
                            email: users.email
                        }
                    })
                    .from(vaultBalances)
                    .innerJoin(users, eq(vaultBalances.userId, users.id))
                    .where(
                        and(
                            eq(vaultBalances.vaultId, vault.id),
                            ne(vaultBalances.balance, '0')
                        )
                    );

                if (membersWithBalances.length === 0) {
                    continue; // No outstanding balances in this vault
                }

                // Get simplified debt structure
                const debtStructure = await getSimplifiedDebts(vault.id);

                // Send reminders to users who owe money (negative balance)
                for (const member of membersWithBalances) {
                    const balance = parseFloat(member.balance);
                    
                    if (balance < 0) { // User owes money
                        const breakdown = await getUserDebtBreakdown(vault.id, member.userId);
                        
                        if (breakdown.owes.length > 0) {
                            await sendDebtReminderEmail({
                                user: member.user,
                                vault,
                                breakdown,
                                totalOwing: Math.abs(balance)
                            });
                            
                            remindersSent++;
                        }
                    }
                }

                // Send weekly summary to all members
                const allMembers = await db
                    .select({
                        userId: vaultMembers.userId,
                        user: {
                            id: users.id,
                            name: users.name,
                            email: users.email
                        }
                    })
                    .from(vaultMembers)
                    .innerJoin(users, eq(vaultMembers.userId, users.id))
                    .where(eq(vaultMembers.vaultId, vault.id));

                for (const member of allMembers) {
                    const breakdown = await getUserDebtBreakdown(vault.id, member.userId);
                    
                    // Only send summary if user has any activity
                    if (breakdown.totalOwing > 0 || breakdown.totalOwed > 0) {
                        await sendWeeklyDebtSummary({
                            user: member.user,
                            vault,
                            breakdown,
                            debtStructure
                        });
                        
                        usersNotified++;
                    }
                }

            } catch (vaultError) {
                console.error(`❌ Error processing vault ${vault.id}:`, vaultError);
                // Continue with other vaults
            }
        }

        const duration = Date.now() - startTime;
        lastRun = new Date();

        console.log(`✅ Debt reminders job completed in ${duration}ms`);
        console.log(`   - Reminders sent: ${remindersSent}`);
        console.log(`   - Users notified: ${usersNotified}`);
        console.log(`   - Vaults processed: ${activeVaults.length}`);

    } catch (error) {
        console.error('❌ Debt reminders job failed:', error);
    } finally {
        isRunning = false;
    }
}

/**
 * Send settlement nudges for long-overdue debts
 * @param {number} daysOverdue - Days threshold for "overdue" status
 */
async function sendSettlementNudges(daysOverdue = 30) {
    console.log(`📤 Sending settlement nudges for debts overdue by ${daysOverdue}+ days`);

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);

        // Get users with old outstanding debts
        const overdueDebts = await db
            .select({
                userId: vaultBalances.userId,
                vaultId: vaultBalances.vaultId,
                balance: vaultBalances.balance,
                lastSettlement: vaultBalances.lastSettlementAt,
                createdAt: vaultBalances.createdAt,
                user: {
                    id: users.id,
                    name: users.name,
                    email: users.email
                },
                vault: {
                    id: vaults.id,
                    name: vaults.name
                }
            })
            .from(vaultBalances)
            .innerJoin(users, eq(vaultBalances.userId, users.id))
            .innerJoin(vaults, eq(vaultBalances.vaultId, vaults.id))
            .where(
                and(
                    sql`${vaultBalances.balance} < 0`, // Owes money
                    sql`(${vaultBalances.lastSettlementAt} IS NULL OR ${vaultBalances.lastSettlementAt} < ${cutoffDate})`,
                    sql`${vaultBalances.createdAt} < ${cutoffDate}`
                )
            );

        let nudgesSent = 0;

        for (const debt of overdueDebts) {
            const breakdown = await getUserDebtBreakdown(debt.vaultId, debt.userId);
            
            await sendDebtReminderEmail({
                user: debt.user,
                vault: debt.vault,
                breakdown,
                totalOwing: Math.abs(parseFloat(debt.balance)),
                isOverdue: true,
                daysOverdue
            });

            nudgesSent++;
        }

        console.log(`✅ Sent ${nudgesSent} settlement nudges`);

    } catch (error) {
        console.error('❌ Error sending settlement nudges:', error);
    }
}

/**
 * Schedule debt reminders to run weekly (every Monday at 9 AM)
 */
export function scheduleDebtReminders() {
    const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
    
    // Calculate time until next Monday 9 AM
    function getNextMonday9AM() {
        const now = new Date();
        const nextMonday = new Date(now);
        
        // Get days until Monday (1 = Monday, 0 = Sunday)
        const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
        nextMonday.setDate(now.getDate() + daysUntilMonday);
        nextMonday.setHours(9, 0, 0, 0);
        
        // If Monday 9 AM has passed this week, schedule for next week
        if (nextMonday <= now) {
            nextMonday.setDate(nextMonday.getDate() + 7);
        }
        
        return nextMonday;
    }

    const nextRun = getNextMonday9AM();
    const timeUntilNextRun = nextRun - Date.now();

    console.log(`📅 Debt reminders job scheduled for: ${nextRun.toISOString()}`);
    console.log(`⏰ First run in: ${Math.round(timeUntilNextRun / 1000 / 60)} minutes`);

    // Schedule first run
    scheduledJob = setTimeout(() => {
        sendDebtReminders();
        
        // Then schedule weekly
        scheduledJob = setInterval(sendDebtReminders, WEEK_IN_MS);
    }, timeUntilNextRun);

    // Also schedule monthly overdue nudges (1st of each month)
    scheduleMonthlyNudges();
}

/**
 * Schedule monthly settlement nudges for overdue debts
 */
function scheduleMonthlyNudges() {
    function getNextFirstOfMonth() {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 10, 0, 0);
        return next;
    }

    const nextRun = getNextFirstOfMonth();
    const timeUntilNextRun = nextRun - Date.now();

    console.log(`🔔 Monthly settlement nudges scheduled for: ${nextRun.toISOString()}`);

    setTimeout(() => {
        sendSettlementNudges(30); // 30 days overdue threshold
        
        // Schedule for next month
        const MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;
        setInterval(() => sendSettlementNudges(30), MONTH_IN_MS);
    }, timeUntilNextRun);
}

/**
 * Run debt reminders job immediately (for testing)
 */
export async function runImmediateDebtReminders() {
    console.log('🚀 Running debt reminders immediately...');
    await sendDebtReminders();
}

/**
 * Get debt reminders job status
 */
export function getDebtRemindersStatus() {
    return {
        isRunning,
        lastRun,
        isScheduled: scheduledJob !== null,
        nextRun: scheduledJob ? 'Scheduled' : 'Not scheduled'
    };
}

/**
 * Stop debt reminders job
 */
export function stopDebtReminders() {
    if (scheduledJob) {
        clearTimeout(scheduledJob);
        clearInterval(scheduledJob);
        scheduledJob = null;
        console.log('🛑 Debt reminders job stopped');
    }
}

export default {
    scheduleDebtReminders,
    runImmediateDebtReminders,
    getDebtRemindersStatus,
    stopDebtReminders,
    sendSettlementNudges
};
