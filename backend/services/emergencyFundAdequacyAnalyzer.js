class EmergencyFundAdequacyAnalyzer {
    analyze(input = {}) {
        const profile = this.normalizeInput(input);
        const monthsModel = this.calculateTargetMonths(profile);

        const targetRange = {
            minMonths: this.round(monthsModel.minMonths, 2),
            recommendedMonths: this.round(monthsModel.recommendedMonths, 2),
            maxMonths: this.round(monthsModel.maxMonths, 2),
            minTarget: this.round(monthsModel.minMonths * profile.monthlyEssentialExpenses, 2),
            recommendedTarget: this.round(monthsModel.recommendedMonths * profile.monthlyEssentialExpenses, 2),
            maxTarget: this.round(monthsModel.maxMonths * profile.monthlyEssentialExpenses, 2)
        };

        const adequacy = this.calculateAdequacy(profile, targetRange, monthsModel);
        const categoryCoverage = this.calculateCategoryCoverage(profile, targetRange, monthsModel);
        const riskFactors = this.buildRiskFactors(profile, monthsModel);
        const rebalancing = this.generateRebalancingSuggestions(profile, targetRange, adequacy);
        const recalibration = this.generateRecalibrationDetails(profile);

        return {
            success: true,
            inputSummary: {
                monthlyEssentialExpenses: profile.monthlyEssentialExpenses,
                currentEmergencyFund: profile.currentEmergencyFund,
                employmentType: profile.employmentType,
                industryStability: profile.industryStability,
                incomeVariability: profile.incomeVariability,
                dependentCount: profile.dependentCount,
                monthlyDebtObligations: profile.monthlyDebtObligations,
                secondaryIncomeSources: profile.secondaryIncomeSources.length
            },
            personalizedTarget: targetRange,
            adequacyScore: adequacy.score,
            adequacyBand: adequacy.band,
            coverageMonths: adequacy.coverageMonths,
            riskFactors,
            categoryCoverage,
            rebalancingSuggestions: rebalancing,
            recommendation: {
                status: adequacy.band,
                rationale: this.buildRecommendationRationale(adequacy, monthsModel),
                nextAction: rebalancing[0]?.action || 'Maintain current emergency fund and review profile monthly.'
            },
            recalibration,
            calculatedAt: new Date().toISOString()
        };
    }

    normalizeInput(input) {
        const insuranceCoverage = input.insuranceCoverage || {};

        return {
            monthlyEssentialExpenses: Math.max(1, Number(input.monthlyEssentialExpenses || input.monthlyExpenses || 0)),
            currentEmergencyFund: Math.max(0, Number(input.currentEmergencyFund || 0)),
            employmentType: String(input.employmentType || 'salaried').toLowerCase(),
            industryStability: this.clamp(Number(input.industryStability ?? 60), 0, 100),
            incomeVariability: this.clamp(Number(input.incomeVariability ?? 40), 0, 100),
            dependentCount: Math.max(0, Number(input.dependentCount || 0)),
            healthRiskLevel: String(input.healthRiskLevel || 'medium').toLowerCase(),
            monthlyDebtObligations: Math.max(0, Number(input.monthlyDebtObligations || 0)),
            monthlyNetIncome: Math.max(0, Number(input.monthlyNetIncome || 0)),
            spendingHistory: Array.isArray(input.spendingHistory) ? input.spendingHistory.filter(v => Number(v) > 0).map(Number) : [],
            insuranceCoverage: {
                health: this.clamp(Number(insuranceCoverage.health ?? 70), 0, 100),
                disability: this.clamp(Number(insuranceCoverage.disability ?? 50), 0, 100),
                home: this.clamp(Number(insuranceCoverage.home ?? 65), 0, 100),
                auto: this.clamp(Number(insuranceCoverage.auto ?? 65), 0, 100),
                life: this.clamp(Number(insuranceCoverage.life ?? 50), 0, 100)
            },
            secondaryIncomeSources: this.normalizeSecondaryIncome(input.secondaryIncomeSources),
            previousProfileSignature: input.previousProfileSignature ? String(input.previousProfileSignature) : null
        };
    }

    normalizeSecondaryIncome(sources) {
        if (!Array.isArray(sources)) return [];

        return sources
            .map(source => ({
                type: String(source?.type || 'other').toLowerCase(),
                monthlyAmount: Math.max(0, Number(source?.monthlyAmount || 0)),
                stabilityScore: this.clamp(Number(source?.stabilityScore ?? 50), 0, 100)
            }))
            .filter(source => source.monthlyAmount > 0);
    }

    calculateTargetMonths(profile) {
        const drivers = {
            baseMonths: 3,
            employmentRisk: this.getEmploymentRiskAdjustment(profile.employmentType),
            industryRisk: this.getIndustryRiskAdjustment(profile.industryStability),
            incomeVariabilityRisk: this.round(profile.incomeVariability / 55, 2),
            dependentRisk: this.round(Math.min(2.2, profile.dependentCount * 0.45), 2),
            healthRisk: this.getHealthRiskAdjustment(profile.healthRiskLevel),
            insuranceGapRisk: this.getInsuranceGapAdjustment(profile.insuranceCoverage),
            debtLoadRisk: this.getDebtLoadRiskAdjustment(profile.monthlyDebtObligations, profile.monthlyEssentialExpenses),
            spendingVolatilityRisk: this.getSpendingVolatilityAdjustment(profile.spendingHistory),
            secondaryIncomeOffset: this.getSecondaryIncomeOffset(profile.secondaryIncomeSources, profile.monthlyEssentialExpenses)
        };

        const grossMonths =
            drivers.baseMonths +
            drivers.employmentRisk +
            drivers.industryRisk +
            drivers.incomeVariabilityRisk +
            drivers.dependentRisk +
            drivers.healthRisk +
            drivers.insuranceGapRisk +
            drivers.debtLoadRisk +
            drivers.spendingVolatilityRisk -
            drivers.secondaryIncomeOffset;

        const recommendedMonths = this.clamp(grossMonths, 2, 18);

        return {
            ...drivers,
            recommendedMonths,
            minMonths: this.clamp(recommendedMonths - 1.5, 1.5, 16),
            maxMonths: this.clamp(recommendedMonths + 2, 3, 24)
        };
    }

    calculateAdequacy(profile, targetRange, monthsModel) {
        const coverageMonths = profile.currentEmergencyFund / profile.monthlyEssentialExpenses;
        const ratioToRecommended = targetRange.recommendedTarget > 0
            ? profile.currentEmergencyFund / targetRange.recommendedTarget
            : 0;

        const coverageScore = this.clamp(ratioToRecommended * 100, 0, 110);
        const riskPenalty = this.clamp((monthsModel.recommendedMonths - 3) * 4.25, 0, 30);
        const insuranceBoost = this.clamp(this.average(Object.values(profile.insuranceCoverage)) / 14, 0, 7);
        const incomeDiversificationBoost = this.clamp(profile.secondaryIncomeSources.length * 2, 0, 8);

        const score = this.clamp(Math.round(coverageScore - riskPenalty + insuranceBoost + incomeDiversificationBoost), 0, 100);

        let band = 'adequate';
        if (score < 40) band = 'critical_underfunded';
        else if (score < 65) band = 'underfunded';
        else if (ratioToRecommended > 1.4) band = 'overfunded';

        return {
            score,
            band,
            coverageMonths: this.round(coverageMonths, 2)
        };
    }

    calculateCategoryCoverage(profile, targetRange, monthsModel) {
        const fund = profile.currentEmergencyFund;
        const monthly = profile.monthlyEssentialExpenses;

        const jobLossTarget = this.round(monthly * (3 + monthsModel.employmentRisk + monthsModel.industryRisk + (profile.dependentCount * 0.15)), 2);
        const medicalTarget = this.round(monthly * (0.8 + monthsModel.healthRisk + (1 - (profile.insuranceCoverage.health / 100))), 2);
        const homeAutoTarget = this.round(monthly * (0.9 + ((100 - profile.insuranceCoverage.home) / 200) + ((100 - profile.insuranceCoverage.auto) / 200)), 2);
        const familyTarget = this.round(monthly * (0.75 + (profile.dependentCount * 0.35) + ((100 - profile.insuranceCoverage.life) / 220)), 2);

        const categoryTargets = [jobLossTarget, medicalTarget, homeAutoTarget, familyTarget];
        const totalCategoryTarget = categoryTargets.reduce((sum, value) => sum + value, 0) || 1;

        const allocate = (target) => {
            const allocatedFund = fund * (target / totalCategoryTarget);
            return {
                targetAmount: target,
                coveredAmount: this.round(Math.min(target, allocatedFund), 2),
                coveragePercent: this.round(this.clamp((allocatedFund / target) * 100, 0, 100), 1)
            };
        };

        return {
            overallCoveragePercent: this.round(this.clamp((fund / targetRange.recommendedTarget) * 100, 0, 180), 1),
            jobLoss: allocate(jobLossTarget),
            medical: allocate(medicalTarget),
            homeAutoRepair: allocate(homeAutoTarget),
            familyEmergency: allocate(familyTarget)
        };
    }

    buildRiskFactors(profile, monthsModel) {
        const factors = [
            {
                factor: 'employment_type',
                impactMonths: monthsModel.employmentRisk,
                severity: this.severity(monthsModel.employmentRisk),
                detail: `Employment type (${profile.employmentType}) affects income continuity risk.`
            },
            {
                factor: 'industry_stability',
                impactMonths: monthsModel.industryRisk,
                severity: this.severity(monthsModel.industryRisk),
                detail: `Industry stability score ${profile.industryStability}/100 influences layoff probability.`
            },
            {
                factor: 'income_variability',
                impactMonths: monthsModel.incomeVariabilityRisk,
                severity: this.severity(monthsModel.incomeVariabilityRisk),
                detail: `Income variability score ${profile.incomeVariability}/100 increases buffer requirement.`
            },
            {
                factor: 'dependents',
                impactMonths: monthsModel.dependentRisk,
                severity: this.severity(monthsModel.dependentRisk),
                detail: `${profile.dependentCount} dependents raise family contingency needs.`
            },
            {
                factor: 'health_and_insurance_gap',
                impactMonths: this.round(monthsModel.healthRisk + monthsModel.insuranceGapRisk, 2),
                severity: this.severity(monthsModel.healthRisk + monthsModel.insuranceGapRisk),
                detail: 'Health risk and insurance gaps increase out-of-pocket emergency exposure.'
            },
            {
                factor: 'debt_obligation_load',
                impactMonths: monthsModel.debtLoadRisk,
                severity: this.severity(monthsModel.debtLoadRisk),
                detail: 'Higher fixed debt obligations reduce monthly flexibility during shocks.'
            },
            {
                factor: 'secondary_income_offset',
                impactMonths: -monthsModel.secondaryIncomeOffset,
                severity: this.severity(-monthsModel.secondaryIncomeOffset),
                detail: 'Secondary income streams reduce required cash buffer when stable.'
            }
        ];

        return factors
            .sort((a, b) => Math.abs(b.impactMonths) - Math.abs(a.impactMonths))
            .map(factor => ({ ...factor, impactMonths: this.round(factor.impactMonths, 2) }));
    }

    generateRebalancingSuggestions(profile, targetRange, adequacy) {
        const suggestions = [];
        const current = profile.currentEmergencyFund;

        if (current < targetRange.minTarget) {
            const deficit = targetRange.recommendedTarget - current;
            const monthlyContribution = this.calculateRecommendedMonthlyContribution(profile, deficit, 12);

            suggestions.push({
                action: 'increase_emergency_fund',
                priority: 'high',
                amountGap: this.round(deficit, 2),
                suggestion: `Increase emergency fund by ${this.currency(deficit)} with a monthly contribution of ${this.currency(monthlyContribution)}.`
            });
        }

        if (current >= targetRange.minTarget && current <= targetRange.maxTarget) {
            suggestions.push({
                action: 'maintain_and_rebalance',
                priority: 'medium',
                suggestion: 'Emergency fund is within target range. Rebalance monthly and review profile changes.'
            });
        }

        if (current > targetRange.maxTarget) {
            const excess = current - targetRange.maxTarget;
            suggestions.push({
                action: 'redeploy_excess_capital',
                priority: 'medium',
                amountExcess: this.round(excess, 2),
                suggestion: `Emergency fund exceeds target range by ${this.currency(excess)}. Consider reallocating excess to debt prepayment or long-term investments.`
            });
        }

        if (adequacy.band === 'critical_underfunded') {
            suggestions.unshift({
                action: 'immediate_buffer_protection',
                priority: 'urgent',
                suggestion: 'Pause non-essential discretionary spending and build at least one month of expenses as immediate buffer.'
            });
        }

        return suggestions;
    }

    generateRecalibrationDetails(profile) {
        const currentSignature = this.generateProfileSignature(profile);
        const profileChangeDetected = !!profile.previousProfileSignature && profile.previousProfileSignature !== currentSignature;

        return {
            profileSignature: currentSignature,
            profileChangeDetected,
            message: profileChangeDetected
                ? 'Profile has changed. Recommendation recalibrated with updated risk drivers.'
                : 'Recommendation calibrated on current profile. Re-run when profile factors change.'
        };
    }

    buildRecommendationRationale(adequacy, monthsModel) {
        const drivers = [];

        if (monthsModel.employmentRisk >= 1.2) drivers.push('higher employment income uncertainty');
        if (monthsModel.incomeVariabilityRisk >= 1) drivers.push('high income variability');
        if (monthsModel.dependentRisk >= 0.9) drivers.push('dependent-related contingency needs');
        if (monthsModel.insuranceGapRisk >= 0.8) drivers.push('insurance coverage gaps');
        if (monthsModel.secondaryIncomeOffset >= 0.6) drivers.push('secondary income resilience reducing required buffer');

        const headline = adequacy.band === 'overfunded'
            ? 'Current reserves exceed the risk-adjusted target range.'
            : adequacy.band.includes('underfunded')
                ? 'Current reserves are below the risk-adjusted target range.'
                : 'Current reserves align with the risk-adjusted target range.';

        if (!drivers.length) return headline;
        return `${headline} Key drivers: ${drivers.join(', ')}.`;
    }

    getEmploymentRiskAdjustment(type) {
        const map = {
            salaried: 0.6,
            hourly: 1.1,
            contractor: 1.6,
            self_employed: 2,
            business_owner: 2.2,
            unemployed: 2.8,
            retired: 0.3
        };

        return map[type] ?? 1;
    }

    getIndustryRiskAdjustment(stability) {
        if (stability >= 80) return -0.35;
        if (stability >= 65) return 0.2;
        if (stability >= 50) return 0.65;
        if (stability >= 35) return 1.1;
        return 1.65;
    }

    getHealthRiskAdjustment(level) {
        const map = {
            low: 0.2,
            medium: 0.65,
            high: 1.25
        };

        return map[level] ?? 0.65;
    }

    getInsuranceGapAdjustment(coverage) {
        const avgCoverage = this.average(Object.values(coverage));
        const gap = (100 - avgCoverage) / 100;
        return this.round(this.clamp(gap * 1.7, 0, 1.7), 2);
    }

    getDebtLoadRiskAdjustment(monthlyDebtObligations, monthlyEssentialExpenses) {
        if (monthlyEssentialExpenses <= 0) return 0;
        const ratio = monthlyDebtObligations / monthlyEssentialExpenses;
        if (ratio < 0.15) return 0.05;
        if (ratio < 0.3) return 0.3;
        if (ratio < 0.45) return 0.7;
        if (ratio < 0.65) return 1;
        return 1.3;
    }

    getSpendingVolatilityAdjustment(history) {
        if (!history.length || history.length < 3) return 0.35;

        const mean = this.average(history);
        if (mean <= 0) return 0.35;

        const variance = history.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / history.length;
        const stdDev = Math.sqrt(variance);
        const coefficient = stdDev / mean;

        return this.round(this.clamp(coefficient * 2.2, 0.1, 1.5), 2);
    }

    getSecondaryIncomeOffset(sources, monthlyEssentialExpenses) {
        if (!sources.length || monthlyEssentialExpenses <= 0) return 0;

        const resilientAmount = sources.reduce((sum, source) => {
            const stabilityWeight = source.stabilityScore / 100;
            return sum + (source.monthlyAmount * stabilityWeight);
        }, 0);

        const coverageRatio = resilientAmount / monthlyEssentialExpenses;
        return this.round(this.clamp(coverageRatio * 1.2, 0, 1.8), 2);
    }

    calculateRecommendedMonthlyContribution(profile, amountGap, targetMonths) {
        if (amountGap <= 0) return 0;

        const baseline = amountGap / Math.max(1, targetMonths);
        if (profile.monthlyNetIncome <= 0) return this.round(baseline, 2);

        const safeCapacity = profile.monthlyNetIncome * 0.2;
        return this.round(Math.min(Math.max(baseline, profile.monthlyEssentialExpenses * 0.05), safeCapacity), 2);
    }

    generateProfileSignature(profile) {
        const basis = JSON.stringify({
            monthlyEssentialExpenses: profile.monthlyEssentialExpenses,
            employmentType: profile.employmentType,
            industryStability: profile.industryStability,
            incomeVariability: profile.incomeVariability,
            dependentCount: profile.dependentCount,
            healthRiskLevel: profile.healthRiskLevel,
            monthlyDebtObligations: profile.monthlyDebtObligations,
            insuranceCoverage: profile.insuranceCoverage,
            secondaryIncomeSources: profile.secondaryIncomeSources
        });

        let hash = 0;
        for (let i = 0; i < basis.length; i++) {
            hash = ((hash << 5) - hash) + basis.charCodeAt(i);
            hash |= 0;
        }

        return `efs_${Math.abs(hash)}`;
    }

    severity(impactMonths) {
        const absolute = Math.abs(impactMonths);
        if (absolute < 0.35) return 'low';
        if (absolute < 0.95) return 'medium';
        return 'high';
    }

    average(values) {
        if (!values.length) return 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    currency(value) {
        return `$${Number(value).toFixed(2)}`;
    }

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    round(value, decimals = 2) {
        return Number(Number(value).toFixed(decimals));
    }
}

export default new EmergencyFundAdequacyAnalyzer();