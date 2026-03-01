import cron from 'node-cron';
import db from '../config/db.js';
import { users, riskProfiles } from '../db/schema.js';
import riskEngine from '../services/riskEngine.js';
import notificationService from '../services/notificationService.js';

class RiskAuditor {
    start() {
        // Run every Sunday at midnight
        cron.schedule('0 0 * * 0', () => {
            this.auditAllUsers();
        });
    }

    async auditAllUsers() {
        console.log('[RiskAuditor] Starting weekly portfolio risk audit...');
        const allUsers = await db.query.users.findMany();

        for (const user of allUsers) {
            try {
                const [varMetric, beta, profile] = await Promise.all([
                    riskEngine.calculatePortfolioVaR(user.id),
                    riskEngine.calculatePortfolioBeta(user.id),
                    db.query.riskProfiles.findFirst({ where: eq(riskProfiles.userId, user.id) })
                ]);

                // If Beta is significantly higher than target, send warning
                if (profile && beta > 1.5 && profile.riskTolerance !== 'aggressive') {
                    await notificationService.sendEmailByUserId(user.id, {
                        subject: '🚨 Portfolio Risk Alert',
                        text: `Your portfolio beta has reached ${beta}, which is significantly higher than your "${profile.riskTolerance}" risk profile. Consider rebalancing.`
                    });
                }

                console.log(`[RiskAuditor] Audited User ${user.email}: VaR=$${varMetric.amount}, Beta=${beta}`);
            } catch (error) {
                console.error(`[RiskAuditor] Error auditing user ${user.id}:`, error);
            }
        }
    }
}

export default new RiskAuditor();
