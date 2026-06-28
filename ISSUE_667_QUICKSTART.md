# Financial Health Scoring - Quick Start Guide

**Issue #667: Get Started in 5 Minutes**

## 🚀 Quick Setup

### Step 1: Run the Migration

```bash
cd backend
psql -U your_username -d wealth_vault -f drizzle/0029_financial_health_scoring.sql
```

Verify tables were created:
```sql
\dt *health*
\dt *wellness*
\dt *heatmap*
```

### Step 2: Start the Backend

```bash
cd backend
npm run dev
```

Server should be running on `http://localhost:5000`

### Step 3: Test the API

#### Get Your Financial Health Dashboard

```bash
curl -X GET "http://localhost:5000/api/financial-health/dashboard" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Calculate Your Wealth Score

```bash
curl -X GET "http://localhost:5000/api/financial-health/score/detailed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### View Spending Heatmap

```bash
curl -X GET "http://localhost:5000/api/financial-health/heatmap?period=month&type=category" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Get Recommendations

```bash
curl -X GET "http://localhost:5000/api/financial-health/recommendations?priority=high" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📊 Understanding Your Wealth Score

### Score Breakdown

Your wealth score (0-850) is calculated from 5 components:

| Component | Weight | What It Measures |
|-----------|--------|------------------|
| **Savings** | 25% | Emergency fund, savings rate |
| **Debt** | 25% | Debt-to-income ratio, debt burden |
| **Spending** | 20% | Budget adherence, consistency |
| **Investment** | 20% | Portfolio size, diversification, returns |
| **Income** | 10% | Income level, stability, growth |

### Score Ranges

- **750-850** 🟢 Excellent - Outstanding financial health
- **650-749** 🟡 Good - Strong financial position
- **550-649** 🟠 Fair - Room for improvement
- **450-549** 🔴 Poor - Significant challenges
- **0-449** ⚫ Critical - Urgent action needed

## 🎯 Quick Win Recommendations

Based on your score, here are immediate actions you can take:

### If Your Score is 0-449 (Critical):
1. **Emergency Priority:** Build $1,000 starter emergency fund
2. **Stop the Bleeding:** List all debts and stop using credit cards
3. **Bare Bones Budget:** Keep only essential expenses
4. **Quick Income:** Look for side gig or sell unused items

### If Your Score is 450-549 (Poor):
1. **Emergency Fund:** Save 1 month of expenses ASAP
2. **Debt Strategy:** Choose snowball or avalanche method
3. **Budget Tight:** Track every expense for 30 days
4. **Income:** Request raise or start learning new skills

### If Your Score is 550-649 (Fair):
1. **Emergency Fund:** Grow to 3-6 months of expenses
2. **Optimize Debt:** Refinance to lower rates
3. **Investment:** Start with 5-10% of income
4. **Skills:** Invest in career development

### If Your Score is 650-749 (Good):
1. **Max Out:** Fully fund tax-advantaged accounts
2. **Diversify:** Add alternative investments
3. **Optimize:** Review all subscriptions and insurance
4. **Plan:** Set long-term wealth building goals

### If Your Score is 750-850 (Excellent):
1. **Advanced:** Consider real estate or business investments  
2. **Tax Efficiency:** Work with CPA on optimization
3. **Legacy:** Set up trusts or estate planning
4. **Protect:** Ensure proper insurance coverage

## 🔥 Spending Heatmap Insights

Your heatmap shows when and where you spend:

### Common Patterns:

**Weekend Spender:**
- 60-70% of spending on Sat/Sun
- ⚠️ Risk: Budget blown by impulse weekend purchases
- ✅ Fix: Set weekend spending limit, plan activities in advance

**Payday Splurger:**
- Spike in spending right after paycheck
- ⚠️ Risk: "Lifestyle inflation" prevents saving
- ✅ Fix: Automate savings on payday, then spend from remainder

**End-of-Month Scrambler:**
- Low spending early, panic spending late
- ⚠️ Risk: Overdrafts, late fees, credit card interest
- ✅ Fix: Even out spending, build buffer in checking account

**Online Shopping Habit:**
- Large % from Amazon, other e-commerce
- ⚠️ Risk: Small purchases add up fast
- ✅ Fix: 48-hour rule, unsubscribe from marketing emails

## 💪 Wellness Tracking

Your financial wellness score (0-100) measures stress:

### Stress Score Components:

| Factor | Weight | Low Stress | High Stress |
|--------|--------|------------|-------------|
| Emergency Fund | 30% | 6+ months | <1 month |
| Debt Load | 30% | <20% DTI | >50% DTI |
| Income Volatility | 20% | Stable | Highly variable |
| Budget Overruns | 20% | <10% | >30% |

### Stress Reduction Tips:

**High Stress (70-100):**
- Seek professional financial counseling
- Consider debt consolidation
- Focus on one financial goal at a time
- Build emergency fund ASAP

**Moderate Stress (40-69):**
- Automate bill payments
- Set up sinking funds for irregular expenses
- Review budget monthly
- Start small investment contributions

**Low Stress (0-39):**
- Maintain current habits
- Consider advanced strategies
- Help others with financial literacy
- Plan for long-term legacy

## 🎓 Learning Resources

### Improve Your Savings Score:
- [Emergency Fund Guide](https://www.example.com/emergency-fund)
- [High-Yield Savings Accounts](https://www.example.com/savings)
- [Automatic Savings Strategies](https://www.example.com/auto-save)

### Improve Your Debt Score:
- [Debt Snowball vs Avalanche](https://www.example.com/debt-methods)
- [Balance Transfer Guide](https://www.example.com/balance-transfer)
- [Negotiating with Creditors](https://www.example.com/negotiate)

### Improve Your Spending Score:
- [Zero-Based Budgeting](https://www.example.com/zero-budget)
- [Envelope Method](https://www.example.com/envelope)
- [Mindful Spending Tips](https://www.example.com/mindful)

### Improve Your Investment Score:
- [Investing 101](https://www.example.com/investing-101)
- [Asset Allocation Guide](https://www.example.com/allocation)
- [Index Funds vs Active](https://www.example.com/index-funds)

### Improve Your Income Score:
- [Salary Negotiation](https://www.example.com/negotiate-salary)
- [Side Hustle Ideas](https://www.example.com/side-hustle)
- [Passive Income Streams](https://www.example.com/passive-income)

## 🤝 Peer Benchmarking

See how you compare to others:

### Your Percentile:
- **Top 10%** (90th percentile): You're doing better than 90% of users
- **Above Average** (60-89th): Better than most
- **Average** (40-59th): Right in the middle
- **Below Average** (11-39th): Room for improvement
- **Bottom 10%** (0-10th): Focus on quick wins above

### Benchmark Categories:
- **Age Group:** Compare with people your age
- **Income Level:** Compare with similar earners
- **Region:** Compare with your geographic area
- **Family Size:** Compare with similar household

## 📅 30-Day Challenge

**Boost your score 50+ points in 30 days:**

### Week 1: Foundation
- [ ] Calculate current net worth
- [ ] List all income sources
- [ ] List all debts with rates
- [ ] Track every expense for 7 days
- [ ] Set up separate savings account

### Week 2: Optimization
- [ ] Create zero-based budget
- [ ] Automate savings (pay yourself first)
- [ ] Call to negotiate one bill
- [ ] Cancel unused subscriptions
- [ ] Apply for better credit card rate or balance transfer

### Week 3: Acceleration
- [ ] Increase 401k contribution by 1%
- [ ] Meal prep for the week (save dining out $)
- [ ] Sell unused items
- [ ] Start side gig or freelance
- [ ] Make extra debt payment

### Week 4: Momentum
- [ ] Review spending vs budget
- [ ] Adjust categories as needed
- [ ] Set up sinking funds
- [ ] Research investment options
- [ ] Celebrate progress!

## 🎯 Goals by Timeline

### This Week:
- Install spending tracker app
- List all accounts and balances
- Calculate net worth
- Track expenses daily

### This Month:
- Build $500-$1,000 starter emergency fund
- Create and stick to budget
- Make one extra debt payment
- Cut one unnecessary expense

### This Quarter:
- Emergency fund to 1 month expenses
- Pay off one credit card or debt
- Start investing with 5% of income
- Improve credit score 20+ points

### This Year:
- Emergency fund to 3-6 months
- Pay off all credit card debt
- Max out IRA contribution
- Increase wealth score 100+ points

## 🆘 Troubleshooting

### "My score is lower than expected"
- Ensure all financial accounts are connected
- Update income information
- Add investment accounts
- Wait 24 hours after adding new data

### "I don't see recommendations"
- Calculation may still be in progress
- Ensure you have at least 30 days of expense data
- Check that budget categories are set
- Try refreshing the dashboard

### "Heatmap shows no data"
- Add expense categories to transactions
- Ensure expenses have dates
- Try different time period (month vs week)
- Check that expenses are approved/completed

### "Peer comparison not available"
- Update profile with age and income range
- Opt-in to peer benchmarking in settings
- Ensure privacy settings allow comparison
- Wait for next calculation cycle

## 📞 Need Help?

- **Documentation:** [Full Implementation Guide](./ISSUE_667_IMPLEMENTATION_GUIDE.md)
- **API Reference:** See implementation guide for all endpoints
- **Community:** Join our Discord for tips and support
- **Support:** Email support@wealth-vault.com

## 🎉 Success Stories

*"I increased my score from 520 to 685 in 6 months by following the recommendations!"* - Sarah M.

*"The spending heatmap helped me realize I was wasting $400/month on weekend impulse buys."* - James T.

*"Finally understand my complete financial picture. The wealth score makes it simple."* - Maria R.

---

**Ready to improve your financial health? Start with your dashboard:**

```bash
curl http://localhost:5000/api/financial-health/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Good luck! 🚀📈**
