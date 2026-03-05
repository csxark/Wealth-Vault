// creditScoreRecoveryRoadmapService.js
// Service to generate personalized credit score recovery roadmaps

class CreditScoreRecoveryRoadmapService {
    constructor({ currentScore, negativeItems, utilization, inquiries, creditHistory }) {
        this.currentScore = currentScore; // 300-850
        this.negativeItems = negativeItems || []; // Array: { type, age, severity, amount, status }
        this.utilization = utilization || 0; // 0-100%
        this.inquiries = inquiries || 0; // Number of recent inquiries
        this.creditHistory = creditHistory || {}; // { accountCount, ageYears, paymentHistory }
    }

    // Analyze current credit profile
    analyzeProfile() {
        const scoreFactors = {
            paymentHistory: 0,
            creditUtilization: 0,
            creditAge: 0,
            creditMix: 0,
            newInquiries: 0
        };

        // Score impact breakdown (FICO model)
        scoreFactors.paymentHistory = this._analyzePaymentHistory();
        scoreFactors.creditUtilization = this._analyzeUtilization();
        scoreFactors.creditAge = this._analyzeCreditAge();
        scoreFactors.creditMix = this._analyzeCreditMix();
        scoreFactors.newInquiries = this._analyzeInquiries();

        return {
            currentScore: this.currentScore,
            scoreBreakdown: scoreFactors,
            negativeItemsCount: this.negativeItems.length,
            utilizationRate: this.utilization,
            recentInquiries: this.inquiries,
            overallHealth: this._calculateOverallHealth()
        };
    }

    // Project recovery timeline under various scenarios
    projectRecoveryTimeline() {
        const scenarios = [
            { name: 'Aggressive', monthlyImprovement: 25 },
            { name: 'Moderate', monthlyImprovement: 15 },
            { name: 'Conservative', monthlyImprovement: 8 }
        ];

        return scenarios.map(scenario => {
            const timeline = [];
            let projectedScore = this.currentScore;
            
            for (let month = 0; month <= 36; month++) {
                timeline.push({
                    month,
                    projectedScore: Math.min(850, projectedScore),
                    status: this._getScoreStatus(projectedScore),
                    milestone: this._detectMilestone(projectedScore)
                });
                projectedScore += scenario.monthlyImprovement;
            }

            return {
                scenario: scenario.name,
                timeline,
                estimatedTimeToGoal: this._calculateTimeToScore(this.currentScore, 740, scenario.monthlyImprovement)
            };
        });
    }

    // Rank actions by score impact
    rankActions() {
        const actions = [];

        // Dispute errors - biggest impact
        const disputeErrors = this.negativeItems.filter(item => item.type === 'error' || item.type === 'inaccuracy');
        if (disputeErrors.length > 0) {
            actions.push({
                action: 'Dispute Inaccurate Items',
                impact: 50 + (disputeErrors.length * 10),
                timeframe: '30-90 days',
                difficulty: 'Easy',
                description: 'Dispute errors and inaccuracies on credit report',
                template: 'dispute-letter'
            });
        }

        // Reduce utilization
        const utilizationImpact = this.utilization > 30 ? Math.min(100, 50 + (this.utilization - 30)) : 0;
        if (utilizationImpact > 0) {
            actions.push({
                action: 'Reduce Credit Utilization',
                impact: utilizationImpact,
                timeframe: 'Immediate',
                difficulty: 'Medium',
                description: `Lower utilization from ${this.utilization}% to below 30%`,
                target: Math.min(30, this.utilization * 0.5)
            });
        }

        // Pay down collections
        const collectionItems = this.negativeItems.filter(item => item.type === 'collection');
        if (collectionItems.length > 0) {
            actions.push({
                action: 'Pay or Settle Collections',
                impact: 75,
                timeframe: '1-3 months',
                difficulty: 'Hard',
                description: 'Negotiate and pay collection accounts',
                estimatedAmount: collectionItems.reduce((sum, item) => sum + item.amount, 0)
            });
        }

        // Secured credit card
        actions.push({
            action: 'Obtain Secured Credit Card',
            impact: 40,
            timeframe: '2-3 months',
            difficulty: 'Easy',
            description: 'Secure card with small deposit to build positive history',
            recommendation: this.currentScore < 600
        });

        // Become authorized user
        actions.push({
            action: 'Become Authorized User',
            impact: 35,
            timeframe: 'Immediate',
            difficulty: 'Easy',
            description: 'Ask family/friend with good credit to add you as authorized user',
            recommendation: true
        });

        return actions.sort((a, b) => b.impact - a.impact);
    }

    // Identify quick wins
    identifyQuickWins() {
        const quickWins = [];

        // Dispute errors (if any)
        if (this.negativeItems.filter(item => item.type === 'error').length > 0) {
            quickWins.push({
                action: 'Dispute Errors',
                expectedBoost: 30,
                timeframe: '30 days',
                effort: 'Low'
            });
        }

        // Reduce utilization to 30%
        if (this.utilization > 30) {
            quickWins.push({
                action: 'Pay Down Balances to 30% Utilization',
                expectedBoost: Math.min(50, (this.utilization - 30) * 2),
                timeframe: 'Immediate',
                effort: 'Medium'
            });
        }

        // Authorized user
        quickWins.push({
            action: 'Become Authorized User',
            expectedBoost: 35,
            timeframe: 'Immediate',
            effort: 'Low'
        });

        // Payment on time this month
        quickWins.push({
            action: 'Make All Payments on Time This Month',
            expectedBoost: 10,
            timeframe: 'Immediate',
            effort: 'Low',
            note: 'Payment history is 35% of credit score'
        });

        return quickWins.sort((a, b) => (b.expectedBoost / b.effort) - (a.expectedBoost / a.effort));
    }

    // Estimate loan product eligibility
    estimateLoanEligibility() {
        const eligibility = {
            currentEligibility: [],
            potentialEligibility: []
        };

        const scoreRanges = {
            'Bad (300-669)': { apr: '18-24%', products: ['Secured Credit Card', 'Subprime Auto Loan'] },
            'Fair (670-739)': { apr: '12-18%', products: ['Standard Credit Card', 'FHA Mortgage'] },
            'Good (740-799)': { apr: '6-12%', products: ['Premium Credit Card', 'Conventional Mortgage', 'Auto Loan'] },
            'Excellent (800+)': { apr: '2-6%', products: ['Premium Credit Card', 'Best Mortgage Rates', 'Personal Loan'] }
        };

        // Current eligibility
        for (const [range, details] of Object.entries(scoreRanges)) {
            const [minScore] = range.match(/\d+/) || [0];
            const [maxScore] = range.match(/\d+(?!.*\d)/) || [850];
            if (this.currentScore >= minScore && this.currentScore <= maxScore) {
                eligibility.currentEligibility = {
                    range,
                    apr: details.apr,
                    products: details.products
                };
            }
        }

        // When reaching 740 (Good score)
        eligibility.potentialEligibility.push({
            targetScore: 740,
            timeframe: this._calculateTimeToScore(this.currentScore, 740, 15),
            apr: '6-12%',
            products: ['Premium Credit Card', 'Conventional Mortgage (down payment required)', 'Auto Loan with favorable rates']
        });

        // When reaching 800 (Excellent)
        eligibility.potentialEligibility.push({
            targetScore: 800,
            timeframe: this._calculateTimeToScore(this.currentScore, 800, 15),
            apr: '2-6%',
            products: ['Premium Credit Card (highest limits)', 'Best Mortgage Rates (FHA, VA, Conventional)', 'Personal Loan at Prime Rate']
        });

        return eligibility;
    }

    // Generate dispute letter template
    generateDisputeLetter(item) {
        return {
            title: 'Dispute Letter - Inaccurate Reporting',
            content: `
TO WHOM IT MAY CONCERN,

I am writing to formally dispute the following inaccurate item on my credit report:

Account: [ACCOUNT_NUMBER]
Creditor: [CREDITOR_NAME]
Amount: $${item.amount}
Reported as: ${item.status}
Reason for Dispute: ${item.type === 'error' ? 'This item contains inaccurate information' : 'This debt has been paid or settled'}

Per the Fair Credit Reporting Act (FCRA) Section 611, I request that you:
1. Conduct a reasonable investigation of this item
2. Provide verification of the accuracy of the information
3. Remove or correct the inaccurate information

I have enclosed supporting documentation. Please respond within 30 days with your findings.

Sincerely,
[YOUR_NAME]
[YOUR_ADDRESS]
[YOUR_DATE_OF_BIRTH]
            `,
            attachments: ['Proof of payment if applicable', 'Creditor correspondence', 'Bank statements']
        };
    }

    // Generate month-by-month recovery plan
    generateRecoveryPlan() {
        const plan = {
            months: []
        };

        const actions = this.rankActions();
        const quickWins = this.identifyQuickWins();

        // Month 1: Quick wins
        plan.months.push({
            month: 1,
            focus: 'Quick Wins',
            actions: [quickWins[0], quickWins[1]],
            expectedScoreChange: '10-15 points',
            milestones: ['Dispute errors initiated', 'Utilization reduction begin']
        });

        // Month 2-3: Core recovery actions
        plan.months.push({
            month: '2-3',
            focus: 'Core Actions',
            actions: [actions[0], actions[1]],
            expectedScoreChange: '20-30 points',
            milestones: ['60-90 day dispute window', 'Secured card approval', 'Collections negotiation']
        });

        // Month 4-6: Build positive history
        plan.months.push({
            month: '4-6',
            focus: 'Build Positive History',
            actions: ['Use secured card responsibly (keep utilization <10%)', 'Make all payments on time', 'Become authorized user'],
            expectedScoreChange: '30-50 points',
            milestones: ['First positive trade-lines reporting', 'Score recovery acceleration']
        });

        // Month 7-12: Sustained improvement
        plan.months.push({
            month: '7-12',
            focus: 'Sustained Growth',
            actions: ['Continue on-time payments', 'Reduce overall utilization to <10%', 'Request credit limit increases'],
            expectedScoreChange: '40-60 points',
            milestones: ['Reaching fair credit range (670+)', 'Eligibility for better products']
        });

        // Month 13-24: Optimize and diversify
        plan.months.push({
            month: '13-24',
            focus: 'Optimize Credit Profile',
            actions: ['Graduate from secured card (if eligible)', 'Add tradeline variety', 'Consider credit-building loans'],
            expectedScoreChange: '50-80 points',
            milestones: ['Good credit range (740+)', 'Mortgage pre-qualification eligible']
        });

        return plan;
    }

    // Helper methods
    _analyzePaymentHistory() {
        if (!this.creditHistory.paymentHistory) return { status: 'Unknown', score: 0 };
        const recentLate = this.negativeItems.filter(item => item.type === 'late-payment' && item.age < 24).length;
        return { recentLate30: recentLate > 0, impact: -100 * recentLate, score: 350 - (recentLate * 100) };
    }

    _analyzeUtilization() {
        const impact = this.utilization > 30 ? -50 * ((this.utilization - 30) / 70) : 0;
        return { utilization: this.utilization, impact, recommendation: 'Keep below 30%' };
    }

    _analyzeCreditAge() {
        const avgAge = this.creditHistory.ageYears || 5;
        const impact = avgAge < 3 ? -50 : avgAge < 5 ? -20 : 0;
        return { averageAge: avgAge, impact };
    }

    _analyzeCreditMix() {
        const accountCount = this.creditHistory.accountCount || 0;
        const impact = accountCount < 3 ? -30 : 0;
        return { accounts: accountCount, impact, recommendation: 'Maintain variety: credit cards, installment loans, mortgage' };
    }

    _analyzeInquiries() {
        const impact = this.inquiries > 2 ? -30 * (this.inquiries - 2) : 0;
        return { inquiries: this.inquiries, impact };
    }

    _calculateOverallHealth() {
        const health = ['Poor', 'Fair', 'Good', 'Excellent'];
        const index = Math.floor(((this.currentScore - 300) / 550) * 3);
        return health[Math.min(3, index)];
    }

    _getScoreStatus(score) {
        if (score < 580) return 'Poor';
        if (score < 670) return 'Fair';
        if (score < 740) return 'Good';
        if (score < 800) return 'Very Good';
        return 'Excellent';
    }

    _detectMilestone(score) {
        const milestones = [580, 620, 670, 740, 800];
        return milestones.find(m => m === Math.round(score));
    }

    _calculateTimeToScore(from, to, monthlyImprovement) {
        const months = Math.ceil((to - from) / monthlyImprovement);
        return `${months} months`;
    }
}

module.exports = CreditScoreRecoveryRoadmapService;
