/**
 * Weekly Habit Digest Job
 * Evaluates financial health scores, awards badges, and sends weekly coaching tips
 * Runs every Sunday at 8 PM
 */

import cron from 'node-cron';
import { db } from '../config/db.js';
import { users, userScores, badges, habitLogs, expenses } from '../db/schema.js';
import { calculateFinancialHealthScore, saveUserScore } from '../services/behaviorEngine.js';
import { generateWeeklyCoachingTips, analyzeSpendingPsychology } from '../services/habitAI.js';
import { sendEmail } from '../services/emailService.js';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * Initialize badge definitions (runs once on server start)
 */
export async function initializeBadges(userId) {
  try {
    const badgeDefinitions = [
      // Budget Adherence Badges
      {
        badgeType: 'budget_novice',
        badgeName: 'Budget Novice',
        badgeDescription: 'Stay within budget for 1 week',
        badgeTier: 'bronze',
        category: 'budget',
        rarity: 'common',
        requirement: { type: 'budget_adherence', weeks: 1, threshold: 100 },
        experienceReward: 50,
        badgeIcon: '💰'
      },
      {
        badgeType: 'budget_master',
        badgeName: 'Budget Master',
        badgeDescription: 'Stay within budget for 4 consecutive weeks',
        badgeTier: 'silver',
        category: 'budget',
        rarity: 'uncommon',
        requirement: { type: 'budget_adherence', weeks: 4, threshold: 100 },
        experienceReward: 200,
        badgeIcon: '🏆'
      },
      {
        badgeType: 'budget_legend',
        badgeName: 'Budget Legend',
        badgeDescription: 'Stay within budget for 12 consecutive weeks',
        badgeTier: 'gold',
        category: 'budget',
        rarity: 'rare',
        requirement: { type: 'budget_adherence', weeks: 12, threshold: 100 },
        experienceReward: 500,
        badgeIcon: '👑'
      },
      
      // Savings Badges
      {
        badgeType: 'saver_starter',
        badgeName: 'Saver Starter',
        badgeDescription: 'Save 10% of income for 1 month',
        badgeTier: 'bronze',
        category: 'savings',
        rarity: 'common',
        requirement: { type: 'savings_rate', months: 1, rate: 10 },
        experienceReward: 75,
        badgeIcon: '🐷'
      },
      {
        badgeType: 'savings_pro',
        badgeName: 'Savings Pro',
        badgeDescription: 'Save 20% of income for 3 months',
        badgeTier: 'silver',
        category: 'savings',
        rarity: 'uncommon',
        requirement: { type: 'savings_rate', months: 3, rate: 20 },
        experienceReward: 250,
        badgeIcon: '💎'
      },
      {
        badgeType: 'wealth_builder',
        badgeName: 'Wealth Builder',
        badgeDescription: 'Save 30% of income for 6 months',
        badgeTier: 'gold',
        category: 'savings',
        rarity: 'rare',
        requirement: { type: 'savings_rate', months: 6, rate: 30 },
        experienceReward: 600,
        badgeIcon: '🏛️'
      },
      
      // Consistency Badges
      {
        badgeType: 'tracker_initiate',
        badgeName: 'Tracker Initiate',
        badgeDescription: 'Log expenses for 7 consecutive days',
        badgeTier: 'bronze',
        category: 'consistency',
        rarity: 'common',
        requirement: { type: 'daily_tracking', days: 7 },
        experienceReward: 40,
        badgeIcon: '📊'
      },
      {
        badgeType: 'tracking_champion',
        badgeName: 'Tracking Champion',
        badgeDescription: 'Log expenses for 30 consecutive days',
        badgeTier: 'silver',
        category: 'consistency',
        rarity: 'uncommon',
        requirement: { type: 'daily_tracking', days: 30 },
        experienceReward: 150,
        badgeIcon: '📈'
      },
      {
        badgeType: 'data_master',
        badgeName: 'Data Master',
        badgeDescription: 'Log expenses for 100 consecutive days',
        badgeTier: 'gold',
        category: 'consistency',
        rarity: 'epic',
        requirement: { type: 'daily_tracking', days: 100 },
        experienceReward: 750,
        badgeIcon: '📚'
      },
      
      // Streak Badges
      {
        badgeType: 'positive_streak_7',
        badgeName: 'Week Warrior',
        badgeDescription: 'Maintain positive financial behavior for 7 days',
        badgeTier: 'bronze',
        category: 'streaks',
        rarity: 'common',
        requirement: { type: 'positive_streak', days: 7 },
        experienceReward: 60,
        badgeIcon: '🔥'
      },
      {
        badgeType: 'positive_streak_30',
        badgeName: 'Month Maestro',
        badgeDescription: 'Maintain positive financial behavior for 30 days',
        badgeTier: 'silver',
        category: 'streaks',
        rarity: 'rare',
        requirement: { type: 'positive_streak', days: 30 },
        experienceReward: 300,
        badgeIcon: '⚡'
      },
      {
        badgeType: 'positive_streak_100',
        badgeName: 'Century of Excellence',
        badgeDescription: 'Maintain positive financial behavior for 100 days',
        badgeTier: 'platinum',
        category: 'streaks',
        rarity: 'legendary',
        requirement: { type: 'positive_streak', days: 100 },
        experienceReward: 1000,
        badgeIcon: '💫'
      },
      
      // Score Badges
      {
        badgeType: 'score_75',
        badgeName: 'Financial Health Achiever',
        badgeDescription: 'Reach overall score of 75',
        badgeTier: 'silver',
        category: 'achievement',
        rarity: 'uncommon',
        requirement: { type: 'score_threshold', score: 75 },
        experienceReward: 200,
        badgeIcon: '⭐'
      },
      {
        badgeType: 'score_90',
        badgeName: 'Financial Health Master',
        badgeDescription: 'Reach overall score of 90',
        badgeTier: 'gold',
        category: 'achievement',
        rarity: 'rare',
        requirement: { type: 'score_threshold', score: 90 },
        experienceReward: 500,
        badgeIcon: '🌟'
      },
      {
        badgeType: 'perfect_score',
        badgeName: 'Perfect 100',
        badgeDescription: 'Achieve perfect financial health score',
        badgeTier: 'diamond',
        category: 'achievement',
        rarity: 'legendary',
        requirement: { type: 'score_threshold', score: 100 },
        experienceReward: 2000,
        badgeIcon: '🏅'
      },
      
      // Level Badges
      {
        badgeType: 'level_10',
        badgeName: 'Rising Star',
        badgeDescription: 'Reach level 10',
        badgeTier: 'bronze',
        category: 'level',
        rarity: 'common',
        requirement: { type: 'level_reached', level: 10 },
        experienceReward: 100,
        badgeIcon: '🌠'
      },
      {
        badgeType: 'level_25',
        badgeName: 'Financial Veteran',
        badgeDescription: 'Reach level 25',
        badgeTier: 'silver',
        category: 'level',
        rarity: 'uncommon',
        requirement: { type: 'level_reached', level: 25 },
        experienceReward: 300,
        badgeIcon: '🎖️'
      },
      {
        badgeType: 'level_50',
        badgeName: 'Wealth Sage',
        badgeDescription: 'Reach level 50',
        badgeTier: 'gold',
        category: 'level',
        rarity: 'epic',
        requirement: { type: 'level_reached', level: 50 },
        experienceReward: 750,
        badgeIcon: '🧙'
      }
    ];

    // Check which badges already exist
    const existingBadges = await db.query.badges.findMany({
      where: eq(badges.userId, userId)
    });

    const existingTypes = new Set(existingBadges.map(b => b.badgeType));

    // Insert missing badges
    const badgesToInsert = badgeDefinitions
      .filter(def => !existingTypes.has(def.badgeType))
      .map(def => ({
        ...def,
        userId,
        progress: 0,
        isUnlocked: false
      }));

    if (badgesToInsert.length > 0) {
      await db.insert(badges).values(badgesToInsert);
      console.log(`Initialized ${badgesToInsert.length} badges for user ${userId}`);
    }

    return badgesToInsert.length;
  } catch (error) {
    console.error('Error initializing badges:', error);
    return 0;
  }
}

/**
 * Evaluate badge progress for a user
 */
async function evaluateBadgeProgress(userId, userScore) {
  try {
    const userBadges = await db.query.badges.findMany({
      where: and(
        eq(badges.userId, userId),
        eq(badges.isUnlocked, false)
      )
    });

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const earnedBadges = [];

    for (const badge of userBadges) {
      let progress = 0;
      let requirementMet = false;

      const req = badge.requirement;

      switch (req.type) {
        case 'budget_adherence':
          // Check if stayed within budget for required weeks
          progress = Math.min(
            100,
            (userScore.budgetAdherenceScore / 75) * 100
          );
          requirementMet = userScore.budgetAdherenceScore >= 75;
          break;

        case 'savings_rate':
          // Check savings rate
          progress = Math.min(
            100,
            (userScore.savingsRateScore / 75) * 100
          );
          requirementMet = userScore.savingsRateScore >= 75;
          break;

        case 'daily_tracking':
          // Check expense logging consistency
          const daysToCheck = req.days;
          const startDate = new Date(now.getTime() - daysToCheck * 24 * 60 * 60 * 1000);
          
          const expenseDates = await db
            .select({ date: sql`DATE(${expenses.date})` })
            .from(expenses)
            .where(
              and(
                eq(expenses.userId, userId),
                gte(expenses.date, startDate)
              )
            )
            .groupBy(sql`DATE(${expenses.date})`);

          progress = Math.min(100, (expenseDates.length / daysToCheck) * 100);
          requirementMet = expenseDates.length >= daysToCheck;
          break;

        case 'positive_streak':
          // Check current streak
          progress = Math.min(100, (userScore.currentStreak / req.days) * 100);
          requirementMet = userScore.currentStreak >= req.days;
          break;

        case 'score_threshold':
          // Check if overall score meets threshold
          progress = Math.min(100, (userScore.overallScore / req.score) * 100);
          requirementMet = userScore.overallScore >= req.score;
          break;

        case 'level_reached':
          // Check if level meets requirement
          progress = Math.min(100, (userScore.level / req.level) * 100);
          requirementMet = userScore.level >= req.level;
          break;

        default:
          console.warn(`Unknown badge requirement type: ${req.type}`);
      }

      // Update badge progress
      await db
        .update(badges)
        .set({ 
          progress: Math.round(progress),
          updatedAt: now
        })
        .where(eq(badges.id, badge.id));

      // If requirement met, unlock badge
      if (requirementMet && !badge.isUnlocked) {
        const [earned] = await db
          .update(badges)
          .set({
            isUnlocked: true,
            progress: 100,
            earnedAt: now,
            updatedAt: now
          })
          .where(eq(badges.id, badge.id))
          .returning();

        // Award experience points
        await db
          .update(userScores)
          .set({
            experiencePoints: userScore.experiencePoints + badge.experienceReward,
            updatedAt: now
          })
          .where(eq(userScores.userId, userId));

        earnedBadges.push(earned);
      }
    }

    return earnedBadges;
  } catch (error) {
    console.error('Error evaluating badge progress:', error);
    return [];
  }
}

/**
 * Send weekly habit digest email
 */
async function sendWeeklyDigestEmail(user, scoreData, earnedBadges, coachingTips, psyAnalysis) {
  try {
    const badgesHtml = earnedBadges.length > 0
      ? earnedBadges.map(b => `
          <div style="display: inline-block; margin: 10px; padding: 15px; background: #f0f9ff; border-radius: 8px; text-align: center;">
            <div style="font-size: 48px;">${b.badgeIcon}</div>
            <div style="font-weight: bold; margin-top: 8px;">${b.badgeName}</div>
            <div style="font-size: 12px; color: #64748b;">${b.badgeDescription}</div>
            <div style="margin-top: 8px; color: #22c55e; font-weight: bold;">+${b.experienceReward} XP</div>
          </div>
        `).join('')
      : '<p style="color: #94a3b8;">No new badges this week. Keep building those habits!</p>';

    const tipsHtml = coachingTips.weeklyTips.map(tip => `
      <div style="margin: 15px 0; padding: 15px; background: #fef3c7; border-left: 4px solid #fbbf24; border-radius: 4px;">
        <h3 style="margin: 0 0 8px 0; color: #92400e;">${tip.title}</h3>
        <p style="margin: 0 0 8px 0;">${tip.message}</p>
        <p style="margin: 0; font-weight: bold; color: #78350f;">Action: ${tip.actionableStep}</p>
      </div>
    `).join('');

    const scoreColor = scoreData.overallScore >= 75 ? '#22c55e' : scoreData.overallScore >= 50 ? '#f59e0b' : '#ef4444';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 30px 0;">
          <h1 style="color: #1e293b; margin: 0;">📊 Your Weekly Financial Health Report</h1>
          <p style="color: #64748b; margin: 10px 0;">Week of ${new Date().toLocaleDateString()}</p>
        </div>

        <!-- Overall Score -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; text-align: center; color: white; margin: 20px 0;">
          <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.9;">Overall Health Score</div>
          <div style="font-size: 72px; font-weight: bold; margin: 15px 0;">${scoreData.overallScore}</div>
          <div style="font-size: 18px; opacity: 0.9;">Level ${scoreData.level} • ${scoreData.experiencePoints} XP</div>
          <div style="margin-top: 15px; font-size: 16px;">${scoreData.currentStreak} day streak 🔥</div>
        </div>

        <!-- Score Breakdown -->
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="margin: 0 0 20px 0; color: #1e293b;">Score Breakdown</h2>
          ${generateScoreBar('Budget Adherence', scoreData.budgetAdherenceScore)}
          ${generateScoreBar('Savings Rate', scoreData.savingsRateScore)}
          ${generateScoreBar('Consistency', scoreData.consistencyScore)}
          ${generateScoreBar('Impulse Control', scoreData.impulseControlScore)}
          ${generateScoreBar('Planning', scoreData.planningScore)}
        </div>

        <!-- Badges Earned -->
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="margin: 0 0 20px 0; color: #1e293b;">🏆 Badges Earned This Week</h2>
          ${badgesHtml}
        </div>

        <!-- Coaching Tips -->
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="margin: 0 0 20px 0; color: #1e293b;">💡 Your Weekly Coaching Tips</h2>
          ${tipsHtml}
        </div>

        <!-- Psychological Insights -->
        ${psyAnalysis ? `
          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; color: #1e293b;">🧠 Spending Psychology Insights</h2>
            <p style="color: #475569; line-height: 1.6;">${psyAnalysis.psychologicalAnalysis}</p>
            
            ${psyAnalysis.positiveBehaviors && psyAnalysis.positiveBehaviors.length > 0 ? `
              <div style="margin: 15px 0; padding: 15px; background: #dcfce7; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #15803d;">✅ Positive Behaviors Detected</h4>
                <ul style="margin: 0; padding-left: 20px; color: #166534;">
                  ${psyAnalysis.positiveBehaviors.map(b => `<li>${b}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${psyAnalysis.concerningBehaviors && psyAnalysis.concerningBehaviors.length > 0 ? `
              <div style="margin: 15px 0; padding: 15px; background: #fee2e2; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #991b1b;">⚠️ Areas to Watch</h4>
                <ul style="margin: 0; padding-left: 20px; color: #7f1d1d;">
                  ${psyAnalysis.concerningBehaviors.map(b => `<li>${b}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Weekly Challenge -->
        ${coachingTips.weeklyChallenge ? `
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px; padding: 25px; margin: 20px 0; color: white;">
            <h2 style="margin: 0 0 15px 0;">🎯 This Week's Challenge</h2>
            <h3 style="margin: 0 0 10px 0;">${coachingTips.weeklyChallenge.title}</h3>
            <p style="margin: 0 0 15px 0; opacity: 0.95;">${coachingTips.weeklyChallenge.description}</p>
            <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 4px; text-align: center;">
              <strong>Reward: ${coachingTips.weeklyChallenge.reward}</strong>
            </div>
          </div>
        ` : ''}

        <!-- Footer -->
        <div style="text-align: center; padding: 30px 0; color: #94a3b8; font-size: 14px;">
          <p style="margin: 0;">${coachingTips.encouragement}</p>
          <p style="margin: 10px 0;">Keep building those wealth habits! 💪</p>
          <p style="margin: 10px 0; font-size: 12px;">Wealth Vault • Financial Health Dashboard</p>
        </div>
      </div>
    `;

    await sendEmail(
      user.email,
      `📊 Your Weekly Financial Health Report - Score: ${scoreData.overallScore}`,
      emailHtml
    );

    console.log(`Weekly digest sent to ${user.email}`);
  } catch (error) {
    console.error('Error sending weekly digest email:', error);
  }
}

function generateScoreBar(label, score) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return `
    <div style="margin: 12px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <span style="color: #475569;">${label}</span>
        <span style="color: ${color}; font-weight: bold;">${score}/100</span>
      </div>
      <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
        <div style="background: ${color}; width: ${score}%; height: 100%; transition: width 0.3s;"></div>
      </div>
    </div>
  `;
}

/**
 * Process weekly digest for a single user
 */
async function processUserWeeklyDigest(user) {
  try {
    console.log(`Processing weekly digest for user: ${user.email}`);

    // Initialize badges if first time
    await initializeBadges(user.id);

    // Calculate scores
    const scoreData = await calculateFinancialHealthScore(user.id);
    await saveUserScore(user.id, scoreData);

    // Evaluate and award badges
    const earnedBadges = await evaluateBadgeProgress(user.id, scoreData);

    // Generate coaching tips
    const coachingTips = await generateWeeklyCoachingTips(user.id, scoreData);

    // Analyze spending psychology
    const psyAnalysis = await analyzeSpendingPsychology(user.id);

    // Send email
    await sendWeeklyDigestEmail(user, scoreData, earnedBadges, coachingTips, psyAnalysis);

    return {
      userId: user.id,
      success: true,
      earnedBadges: earnedBadges.length,
      scoreImprovement: scoreData.xpGained > 0
    };
  } catch (error) {
    console.error(`Error processing weekly digest for user ${user.id}:`, error);
    return {
      userId: user.id,
      success: false,
      error: error.message
    };
  }
}

/**
 * Main weekly digest job function
 */
export async function runWeeklyHabitDigest() {
  console.log('🚀 Starting weekly habit digest job...');

  try {
    // Fetch all active users
    const allUsers = await db.select().from(users);
    
    console.log(`Processing ${allUsers.length} users...`);

    const results = [];
    
    // Process users sequentially to avoid API rate limits
    for (const user of allUsers) {
      const result = await processUserWeeklyDigest(user);
      results.push(result);
      
      // Add small delay between users to respect API limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalBadges = results.reduce((sum, r) => sum + (r.earnedBadges || 0), 0);

    console.log(`✅ Weekly habit digest completed:`);
    console.log(`   - Successful: ${successful}`);
    console.log(`   - Failed: ${failed}`);
    console.log(`   - Total badges awarded: ${totalBadges}`);

    return results;
  } catch (error) {
    console.error('❌ Weekly habit digest job failed:', error);
    throw error;
  }
}

/**
 * Schedule weekly habit digest (every Sunday at 8 PM)
 */
export function scheduleWeeklyHabitDigest() {
  // Run every Sunday at 8:00 PM
  cron.schedule('0 20 * * 0', async () => {
    console.log('⏰ Weekly habit digest scheduled task triggered');
    await runWeeklyHabitDigest();
  }, {
    timezone: 'America/New_York' // Adjust as needed
  });

  console.log('📅 Weekly habit digest scheduled for Sundays at 8:00 PM');
}

export default {
  runWeeklyHabitDigest,
  scheduleWeeklyHabitDigest,
  initializeBadges
};
