# Issue #641: Real-Time Tax Optimization & Deduction Tracking

## Overview
Implement a proactive tax planning engine that tracks deductible expenses, estimates tax liability in real-time, suggests optimization strategies, and helps users maximize deductions throughout the year.

## Problem Statement
- Tax deductions discovered after year-end, too late to optimize
- Manual deduction tracking is forgotten or incomplete
- No visibility into estimated tax liability during the year
- Miss opportunities for tax-advantaged accounts (401k, HSA, IRA)
- No guidance on timing large purchases for tax efficiency
- Freelancers/contractors uncertain about quarterly estimated payments

## Solution Architecture

### 1. Core Features

#### 1.1 Real-Time Tax Estimation
- Live tax liability projection based on YTD income and expenses
- Scenario updates ("What if I earn $X more?")
- Federal and state tax calculation
- Marginal vs effective tax rate display
- Monthly/quarterly projections

#### 1.2 Deduction Auto-Detection
- Automatic categorization of deductible expenses
- Business expense tracking for self-employed
- Home office deduction calculator
- Mileage tracking and deduction
- Charitable contribution tracking
- Medical expense aggregation

#### 1.3 Tax-Advantaged Recommendations
- 401(k) contribution optimization
- HSA/FSA recommendations
- IRA contribution suggestions
- Tax-loss harvesting opportunities
- 529 education savings recommendations
- Energy-efficient purchase incentives

#### 1.4 Quarterly Estimated Tax Calculator
- Compute quarterly tax payments for self-employed
- Safe harbor calculations
- Payment schedule and due dates
- Penalty avoidance strategies

#### 1.5 Tax Deadline Reminders
- Timeline of key tax dates
- Estimated payment deadlines
- Filing deadline alerts
- Extension reminders
- Document preparation checklist

#### 1.6 Optimization Engine
- Timing strategies for deductions
- Income deferral suggestions
- Expense acceleration recommendations
- Tax bracket management
- Year-end tax moves

#### 1.7 Receipt Management Integration
- Link receipts to deductible expenses
- AI extraction for proof of deduction
- Digital receipt vault
- Audit-ready documentation

#### 1.8 Tax Summary Reports
- YTD deductions by category
- Accountant-ready summaries
- Export to tax software (CSV, PDF)
- Deduction proof package

### 2. Database Schema Enhancements

#### New Tables to Create:
1. **tax_profiles** - User tax filing status and details
2. **tax_deductions** - Tracked deductible expenses
3. **tax_estimates** - Real-time tax liability estimates
4. **tax_optimization_suggestions** - Engine recommendations
5. **quarterly_tax_payments** - Estimated payment tracking
6. **tax_deadlines** - Important date tracking
7. **tax_advantaged_accounts** - 401k, IRA, HSA tracking
8. **tax_scenarios** - "What if" tax planning
9. **tax_documents** - Receipt and document vault
10. **tax_brackets** - Federal/state bracket data

### 3. Tax Calculation Engine

#### Income Calculation:
- W-2 income tracking
- 1099 income (freelance, contract)
- Investment income (dividends, capital gains)
- Rental income
- Other income sources

#### Deduction Categories:
- **Standard vs Itemized**: Auto-select better option
- **Business Expenses**: Office, equipment, software, supplies
- **Home Office**: Simplified vs regular method
- **Vehicle**: Mileage or actual expenses
- **Health**: Insurance premiums, medical expenses
- **Education**: Tuition, student loan interest
- **Charitable**: Cash and non-cash donations
- **State/Local Taxes**: SALT deduction (capped)

#### Tax Rates (2026 Estimate):
```
Single Filers:
$0 - $11,600: 10%
$11,601 - $47,150: 12%
$47,151 - $100,525: 22%
$100,526 - $191,950: 24%
$191,951 - $243,725: 32%
$243,726 - $609,350: 35%
$609,351+: 37%
```

### 4. Optimization Strategies

#### Income Timing:
- Defer income to next year if in high bracket
- Accelerate income if moving to higher bracket next year
- Harvest capital gains in low-income years

#### Deduction Timing:
- Bunch itemized deductions every other year
- Accelerate expenses into current year
- Defer expenses to next year if beneficial

#### Tax-Advantaged Contributions:
- Max out 401(k) ($23,000 + $7,500 catch-up)
- Utilize HSA triple tax advantage
- IRA contributions before April deadline
- Backdoor Roth conversions

#### Tax-Loss Harvesting:
- Sell losing investments to offset gains
- Avoid wash sale rules
- Harvest up to $3,000 against ordinary income

### 5. Quarterly Tax Estimator

#### Calculation Method:
```
Quarterly Payment = (Estimated Annual Tax - Withholding) / 4

Or Safe Harbor:
- 100% of prior year tax (110% if high earner)
- 90% of current year tax
```

#### Payment Schedule:
- Q1: April 15
- Q2: June 15
- Q3: September 15
- Q4: January 15 (next year)

### 6. API Endpoints

#### Tax Profile & Estimates
- `GET /api/tax/profile` - Get user tax profile
- `PUT /api/tax/profile` - Update tax settings
- `GET /api/tax/estimate` - Real-time tax estimate
- `POST /api/tax/scenario` - Run "what if" scenario
- `GET /api/tax/liability/:year` - Get tax liability for year

#### Deductions
- `GET /api/tax/deductions` - List tracked deductions
- `POST /api/tax/deductions/:expenseId` - Mark expense as deductible
- `PUT /api/tax/deductions/:id` - Update deduction details
- `GET /api/tax/deductions/summary/:year` - YTD summary

#### Optimization
- `GET /api/tax/optimization/suggestions` - Get recommendations
- `POST /api/tax/optimization/apply/:id` - Apply suggestion
- `GET /api/tax/advantaged-accounts` - Tax-advantaged account info
- `POST /api/tax/advantaged-accounts/recommend` - Get contribution recommendations

#### Quarterly Payments
- `GET /api/tax/quarterly/estimate` - Calculate quarterly payments
- `POST /api/tax/quarterly/payment` - Record payment made
- `GET /api/tax/quarterly/schedule/:year` - Payment schedule

#### Reports & Documents
- `GET /api/tax/report/:year` - Generate tax summary
- `GET /api/tax/documents` - List tax documents
- `POST /api/tax/documents/upload` - Upload tax document
- `GET /api/tax/export/:year` - Export for tax software

### 7. Frontend Components

#### New Components
- `TaxDashboard.tsx` - Main tax overview
- `TaxEstimator.tsx` - Real-time liability display
- `DeductionTracker.tsx` - Deduction management
- `QuarterlyTaxCalculator.tsx` - Estimated payments
- `TaxOptimizationPanel.tsx` - Suggestion display
- `TaxCalendar.tsx` - Deadline reminders
- `TaxScenarioSimulator.tsx` - "What if" modeling
- `TaxReportGenerator.tsx` - Summary reports
- `TaxBracketVisualizer.tsx` - Visual tax bracket chart

### 8. Implementation Phases

#### Phase 1: Core Infrastructure (3-4 days)
- [ ] Database schema and migrations
- [ ] Tax profile management
- [ ] Basic tax calculation engine
- [ ] Deduction tracking system

#### Phase 2: Real-Time Estimation (2-3 days)
- [ ] Live tax liability calculator
- [ ] Income aggregation
- [ ] Deduction aggregation
- [ ] Marginal/effective rate calculation

#### Phase 3: Deduction Auto-Detection (2-3 days)
- [ ] Expense categorization rules
- [ ] Business expense tracking
- [ ] Home office calculator
- [ ] Mileage tracking integration

#### Phase 4: Optimization Engine (3-4 days)
- [ ] Timing strategy algorithms
- [ ] Tax-advantaged recommendations
- [ ] Tax-loss harvesting detection
- [ ] Optimization scoring

#### Phase 5: Quarterly Estimator (2 days)
- [ ] Quarterly payment calculator
- [ ] Safe harbor logic
- [ ] Payment tracking
- [ ] Reminder system

#### Phase 6: UI & Reports (3-4 days)
- [ ] Tax dashboard
- [ ] API endpoints
- [ ] Frontend components
- [ ] Report generation

#### Phase 7: Testing & Polish (2-3 days)
- [ ] Unit tests
- [ ] Integration tests
- [ ] Tax calculation accuracy validation
- [ ] Documentation

### 9. Tax Rules & Compliance

#### Standard Deductions (2026):
- Single: $14,600
- Married Filing Jointly: $29,200
- Head of Household: $21,900

#### Key Limits:
- 401(k): $23,000 ($30,500 with catch-up)
- IRA: $7,000 ($8,000 with catch-up)
- HSA: $4,150 individual / $8,300 family
- SALT Deduction Cap: $10,000
- Charitable Deduction: Up to 60% AGI

#### Self-Employment:
- Self-employment tax: 15.3% (Social Security + Medicare)
- Deductible portion: 50% of SE tax
- QBI Deduction: Up to 20% of qualified business income

### 10. Success Metrics

- **90%+** deduction capture rate
- **95%+** tax calculation accuracy
- **60%+** users optimize based on suggestions
- **80%+** self-employed users pay quarterly on time
- **$1000+** average tax savings per user

### 11. Technical Requirements

#### Backend Dependencies
- Tax calculation libraries
- Receipt OCR integration (already built)
- PDF generation for reports
- Tax bracket data management

#### Data Sources
- IRS tax brackets (updated annually)
- State tax tables
- Standard deduction amounts
- Contribution limits

### 12. Timeline Estimate

- Phase 1: 3-4 days
- Phase 2: 2-3 days
- Phase 3: 2-3 days
- Phase 4: 3-4 days
- Phase 5: 2 days
- Phase 6: 3-4 days
- Phase 7: 2-3 days
- **Total: 17-23 days**

## Implementation Status

- [ ] Database schema created
- [ ] Tax calculation engine implemented
- [ ] Deduction tracking system built
- [ ] Optimization engine created
- [ ] Quarterly estimator built
- [ ] API endpoints created
- [ ] Frontend components built
- [ ] Testing completed

---

**Assignee**: Ayaanshaikh12243  
**Label**: enhancement, ECWoC26  
**Issue**: #641
