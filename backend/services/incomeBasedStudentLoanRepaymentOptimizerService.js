// incomeBasedStudentLoanRepaymentOptimizerService.js
// Service to optimize student loan repayment plans based on user income and scenario

class IncomeBasedStudentLoanRepaymentOptimizerService {
    constructor({ loans, income, familySize, employmentHistory, publicServiceMonths, povertyLine, incomeHistory }) {
        this.loans = loans; // Array of loan objects: { balance, interestRate, type }
        this.income = income; // Current annual income
        this.familySize = familySize; // Household size
        this.employmentHistory = employmentHistory || [];
        this.publicServiceMonths = publicServiceMonths || 0;
        this.povertyLine = povertyLine || 14580; // Default US poverty line for 1 person
        this.incomeHistory = incomeHistory || [{ year: new Date().getFullYear(), income }];
    }

    // Calculate monthly payment for each plan
    calculatePayments() {
        const plans = ["Standard", "PAYE", "IBR", "SAVE", "ICR"];
        const results = {};
        for (const plan of plans) {
            results[plan] = this._simulatePlan(plan);
        }
        return results;
    }

    // Simulate a repayment plan
    _simulatePlan(plan) {
        // Placeholder logic for each plan
        // In production, use official formulas and regulatory rules
        const totalBalance = this.loans.reduce((sum, l) => sum + l.balance, 0);
        let monthlyPayment = 0;
        let forgivenessTimeline = 0;
        let totalInterest = 0;
        let forgivenAmount = 0;
        let paymentSchedule = [];
        let pslfEligible = this.publicServiceMonths >= 120;
        // Poverty threshold for income-based plans
        const povertyThreshold = this.povertyLine * 1.5 * this.familySize;
        switch (plan) {
            case "Standard":
                monthlyPayment = totalBalance / 120 + totalBalance * 0.06 / 12; // 10 years, 6% avg interest
                forgivenessTimeline = 10;
                totalInterest = totalBalance * 0.06 * 10;
                forgivenAmount = 0;
                break;
            case "PAYE":
                monthlyPayment = this.income < povertyThreshold ? 0 : 0.1 * (this.income - povertyThreshold) / 12;
                forgivenessTimeline = 20;
                totalInterest = totalBalance * 0.05 * 20;
                forgivenAmount = totalBalance * 0.5; // Estimate
                break;
            case "IBR":
                monthlyPayment = this.income < povertyThreshold ? 0 : 0.15 * (this.income - povertyThreshold) / 12;
                forgivenessTimeline = 20;
                totalInterest = totalBalance * 0.055 * 20;
                forgivenAmount = totalBalance * 0.4;
                break;
            case "SAVE":
                monthlyPayment = this.income < povertyThreshold ? 0 : 0.05 * (this.income - povertyThreshold) / 12;
                forgivenessTimeline = 20;
                totalInterest = totalBalance * 0.045 * 20;
                forgivenAmount = totalBalance * 0.6;
                break;
            case "ICR":
                monthlyPayment = Math.min(0.2 * (this.income - povertyThreshold) / 12, totalBalance / 180 + totalBalance * 0.07 / 12);
                forgivenessTimeline = 25;
                totalInterest = totalBalance * 0.07 * 25;
                forgivenAmount = totalBalance * 0.3;
                break;
        }
        // PSLF benefit
        if (pslfEligible) {
            forgivenessTimeline = Math.min(forgivenessTimeline, 10);
            forgivenAmount = totalBalance;
            totalInterest = totalBalance * 0.03 * forgivenessTimeline;
        }
        // Month-by-month schedule (simplified)
        for (let m = 1; m <= forgivenessTimeline * 12; m++) {
            paymentSchedule.push({ month: m, payment: monthlyPayment });
        }
        return {
            plan,
            monthlyPayment: Math.round(monthlyPayment * 100) / 100,
            forgivenessTimeline,
            totalInterest: Math.round(totalInterest * 100) / 100,
            forgivenAmount: Math.round(forgivenAmount * 100) / 100,
            paymentSchedule,
            pslfEligible
        };
    }

    // Rank plans by criteria
    rankPlans(criteria = "lowestMonthlyPayment") {
        const results = this.calculatePayments();
        const plans = Object.values(results);
        let ranked;
        switch (criteria) {
            case "lowestMonthlyPayment":
                ranked = plans.sort((a, b) => a.monthlyPayment - b.monthlyPayment);
                break;
            case "lowestTotalInterest":
                ranked = plans.sort((a, b) => a.totalInterest - b.totalInterest);
                break;
            case "fastestForgiveness":
                ranked = plans.sort((a, b) => a.forgivenessTimeline - b.forgivenessTimeline);
                break;
            default:
                ranked = plans;
        }
        return ranked;
    }
}

module.exports = IncomeBasedStudentLoanRepaymentOptimizerService;
