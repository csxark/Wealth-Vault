const DEFAULT_MIN_CASH_BUFFER = 500;
const DEFAULT_STRATEGY = 'avalanche';

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

class HouseholdDebtOptimizerService {
    normalizeMembers(rawMembers = []) {
        return rawMembers
            .map((member, index) => {
                const id = member.id || member.memberId || `member-${index + 1}`;
                const monthlyIncome = Math.max(0, toNumber(member.monthlyIncome, 0));
                const monthlyEssentialExpenses = Math.max(0, toNumber(member.monthlyEssentialExpenses, 0));
                const disposableIncome = Math.max(0, monthlyIncome - monthlyEssentialExpenses);

                return {
                    id,
                    name: member.name || `Member ${index + 1}`,
                    monthlyIncome: roundMoney(monthlyIncome),
                    monthlyEssentialExpenses: roundMoney(monthlyEssentialExpenses),
                    disposableIncome: roundMoney(disposableIncome)
                };
            })
            .filter(member => member.monthlyIncome > 0 || member.monthlyEssentialExpenses > 0);
    }

    normalizeDebts(rawDebts = []) {
        return rawDebts
            .map((debt, index) => {
                const id = debt.id || debt.debtId || `debt-${index + 1}`;
                const ownerId = debt.ownerId || null;
                const sharedOwnerIds = Array.isArray(debt.sharedOwnerIds) ? debt.sharedOwnerIds : [];
                const isShared = Boolean(debt.isShared) || sharedOwnerIds.length > 0;

                return {
                    id,
                    name: debt.name || `Debt ${index + 1}`,
                    apr: clamp(toNumber(debt.apr, 0), 0, 100) / 100,
                    balance: Math.max(0, toNumber(debt.balance ?? debt.currentBalance, 0)),
                    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0)),
                    ownerId,
                    isShared,
                    sharedOwnerIds: isShared && sharedOwnerIds.length > 0
                        ? sharedOwnerIds
                        : ownerId
                            ? [ownerId]
                            : []
                };
            })
            .filter(debt => debt.balance > 0.01);
    }

    buildFairnessWeights(members, fairnessPreference = 'income-proportional', customWeights = {}) {
        const validMembers = members.filter(member => member.id);

        if (validMembers.length === 0) return {};

        if (fairnessPreference === 'equal-share') {
            const equal = 1 / validMembers.length;
            return validMembers.reduce((acc, member) => {
                acc[member.id] = equal;
                return acc;
            }, {});
        }

        if (fairnessPreference === 'custom-weights') {
            const rawWeights = validMembers.reduce((acc, member) => {
                acc[member.id] = Math.max(0, toNumber(customWeights[member.id], 0));
                return acc;
            }, {});

            const sumWeights = Object.values(rawWeights).reduce((sum, weight) => sum + weight, 0);
            if (sumWeights > 0) {
                return Object.fromEntries(
                    Object.entries(rawWeights).map(([memberId, weight]) => [memberId, weight / sumWeights])
                );
            }
        }

        const totalDisposable = validMembers.reduce((sum, member) => sum + member.disposableIncome, 0);
        if (totalDisposable > 0) {
            return validMembers.reduce((acc, member) => {
                acc[member.id] = member.disposableIncome / totalDisposable;
                return acc;
            }, {});
        }

        const fallback = 1 / validMembers.length;
        return validMembers.reduce((acc, member) => {
            acc[member.id] = fallback;
            return acc;
        }, {});
    }

    rankDebts(debts, strategy = DEFAULT_STRATEGY) {
        const ranked = [...debts];

        if (strategy === 'snowball') {
            ranked.sort((a, b) => a.balance - b.balance);
        } else if (strategy === 'hybrid') {
            ranked.sort((a, b) => {
                const scoreA = (a.apr * 100) / Math.max(1, Math.sqrt(a.balance));
                const scoreB = (b.apr * 100) / Math.max(1, Math.sqrt(b.balance));
                return scoreB - scoreA;
            });
        } else {
            ranked.sort((a, b) => b.apr - a.apr);
        }

        return ranked;
    }

    allocateHouseholdPlan(rankedDebts, availableBudget) {
        const totalMinimumPayments = roundMoney(
            rankedDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0)
        );

        const extraPool = Math.max(0, roundMoney(availableBudget - totalMinimumPayments));

        let remainingExtra = extraPool;

        const paymentVector = rankedDebts.map((debt, index) => {
            const maxExtraForDebt = Math.max(0, debt.balance - debt.minimumPayment);
            const recommendedExtra = remainingExtra > 0
                ? roundMoney(Math.min(remainingExtra, maxExtraForDebt))
                : 0;

            remainingExtra = roundMoney(remainingExtra - recommendedExtra);

            const totalPayment = roundMoney(debt.minimumPayment + recommendedExtra);
            const monthlyInterestCost = roundMoney((debt.balance * debt.apr) / 12);
            const projectedMonthlyInterestSaved = roundMoney((recommendedExtra * debt.apr) / 12);

            return {
                debtId: debt.id,
                debtName: debt.name,
                apr: roundMoney(debt.apr * 100),
                balance: roundMoney(debt.balance),
                isShared: debt.isShared,
                ownerId: debt.ownerId,
                sharedOwnerIds: debt.sharedOwnerIds,
                minimumPayment: roundMoney(debt.minimumPayment),
                recommendedExtra,
                totalRecommendedPayment: totalPayment,
                monthlyInterestCost,
                projectedMonthlyInterestSaved,
                priority: index + 1
            };
        });

        return {
            totalMinimumPayments,
            extraPool,
            totalRecommendedPayments: roundMoney(
                paymentVector.reduce((sum, row) => sum + row.totalRecommendedPayment, 0)
            ),
            paymentVector
        };
    }

    distributeDebtContributions(paymentRow, fairnessWeights, memberTotals) {
        const contributions = [];

        if (!paymentRow.isShared && paymentRow.ownerId) {
            const ownerAmount = roundMoney(paymentRow.totalRecommendedPayment);
            contributions.push({
                memberId: paymentRow.ownerId,
                amount: ownerAmount,
                splitType: 'owner-only'
            });

            memberTotals[paymentRow.ownerId] = roundMoney((memberTotals[paymentRow.ownerId] || 0) + ownerAmount);
            return contributions;
        }

        const participants = paymentRow.sharedOwnerIds.length > 0
            ? paymentRow.sharedOwnerIds
            : Object.keys(fairnessWeights);

        if (participants.length === 0) {
            return contributions;
        }

        let allocated = 0;

        participants.forEach((memberId, index) => {
            const weight = fairnessWeights[memberId] ?? (1 / participants.length);
            const rawAmount = index === participants.length - 1
                ? roundMoney(paymentRow.totalRecommendedPayment - allocated)
                : roundMoney(paymentRow.totalRecommendedPayment * weight);

            allocated = roundMoney(allocated + rawAmount);

            contributions.push({
                memberId,
                amount: rawAmount,
                splitType: 'fairness-weighted'
            });

            memberTotals[memberId] = roundMoney((memberTotals[memberId] || 0) + rawAmount);
        });

        return contributions;
    }

    buildMemberContributionSummary(members, memberTotals, availableBudgetAfterSharedExpenses) {
        return members.map(member => {
            const contribution = roundMoney(memberTotals[member.id] || 0);
            const disposableIncome = member.disposableIncome;
            const contributionRatio = disposableIncome > 0
                ? roundMoney(contribution / disposableIncome)
                : contribution > 0 ? 1 : 0;

            return {
                memberId: member.id,
                memberName: member.name,
                monthlyIncome: member.monthlyIncome,
                monthlyEssentialExpenses: member.monthlyEssentialExpenses,
                disposableIncome,
                recommendedContribution: contribution,
                contributionRatio,
                utilizationStatus: contributionRatio > 0.9
                    ? 'overstretched'
                    : contributionRatio > 0.65
                        ? 'high-utilization'
                        : 'comfortable'
            };
        });
    }

    optimize(payload = {}) {
        const members = this.normalizeMembers(payload.members || []);
        const debts = this.normalizeDebts(payload.debts || []);

        if (members.length === 0) {
            return {
                success: false,
                message: 'At least one household member is required',
                optimization: null
            };
        }

        if (debts.length === 0) {
            return {
                success: false,
                message: 'At least one debt is required for household optimization',
                optimization: null
            };
        }

        const fairnessPreference = payload.fairnessPreference || 'income-proportional';
        const strategy = payload.strategy || DEFAULT_STRATEGY;
        const minCashBuffer = Math.max(0, toNumber(payload.minCashBuffer, DEFAULT_MIN_CASH_BUFFER));
        const sharedExpenses = Math.max(0, toNumber(payload.sharedMonthlyExpenses, 0));

        const totalHouseholdIncome = roundMoney(members.reduce((sum, member) => sum + member.monthlyIncome, 0));
        const totalEssentialExpenses = roundMoney(
            members.reduce((sum, member) => sum + member.monthlyEssentialExpenses, 0) + sharedExpenses
        );

        const availableBudgetAfterSharedExpenses = Math.max(
            0,
            roundMoney(totalHouseholdIncome - totalEssentialExpenses - minCashBuffer)
        );

        const fairnessWeights = this.buildFairnessWeights(
            members,
            fairnessPreference,
            payload.customWeights || {}
        );

        const rankedDebts = this.rankDebts(debts, strategy);
        const allocation = this.allocateHouseholdPlan(rankedDebts, availableBudgetAfterSharedExpenses);

        const memberTotals = {};
        const paymentVector = allocation.paymentVector.map(paymentRow => ({
            ...paymentRow,
            contributions: this.distributeDebtContributions(paymentRow, fairnessWeights, memberTotals)
        }));

        const memberContributionSummary = this.buildMemberContributionSummary(
            members,
            memberTotals,
            availableBudgetAfterSharedExpenses
        );

        const totalProjectedMonthlyInterestSaved = roundMoney(
            paymentVector.reduce((sum, row) => sum + row.projectedMonthlyInterestSaved, 0)
        );

        const warnings = [];

        if (allocation.totalMinimumPayments > availableBudgetAfterSharedExpenses) {
            warnings.push('Household budget does not fully cover minimum debt payments.');
        }

        const overstretchedMembers = memberContributionSummary.filter(member => member.utilizationStatus === 'overstretched');
        if (overstretchedMembers.length > 0) {
            warnings.push('One or more members are overstretched under current fairness split. Consider equal-share or custom-weights.');
        }

        return {
            success: true,
            message: 'Household debt optimization complete',
            optimization: {
                strategy,
                fairnessPreference,
                householdCashFlow: {
                    totalHouseholdIncome,
                    totalEssentialExpenses,
                    sharedMonthlyExpenses: roundMoney(sharedExpenses),
                    minCashBuffer: roundMoney(minCashBuffer),
                    availableDebtBudget: roundMoney(availableBudgetAfterSharedExpenses)
                },
                fairnessWeights: Object.fromEntries(
                    Object.entries(fairnessWeights).map(([memberId, weight]) => [memberId, roundMoney(weight)])
                ),
                debtPlan: {
                    totalMinimumPayments: allocation.totalMinimumPayments,
                    extraPool: allocation.extraPool,
                    totalRecommendedPayments: allocation.totalRecommendedPayments,
                    projectedMonthlyInterestSaved: totalProjectedMonthlyInterestSaved,
                    projectedAnnualInterestSaved: roundMoney(totalProjectedMonthlyInterestSaved * 12),
                    paymentVector
                },
                memberContributionSummary,
                warnings,
                metrics: {
                    memberCount: members.length,
                    debtCount: debts.length,
                    sharedDebtCount: debts.filter(debt => debt.isShared).length,
                    generatedAt: new Date().toISOString()
                }
            }
        };
    }
}

export default new HouseholdDebtOptimizerService();
