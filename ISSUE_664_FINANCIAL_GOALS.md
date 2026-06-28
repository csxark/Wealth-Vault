# Issue #664: Financial Goals & Savings Tracker

**Status:** Implementation  
**Priority:** High  
**Components:** 6 services, 8 database tables  
**Estimated Complexity:** Advanced goal modeling with timeline projections  

---

## Problem Statement

Users currently lack a structured framework for setting and tracking financial goals. Key issues:

1. **No Goal Hierarchy** - Can't organize goals by priority, timeline, or category
2. **Invisible Progress** - No visualization of how contributions relate to targets
3. **No Planning Logic** - Can't calculate required monthly savings to reach goals
4. **Timeline Confusion** - Don't know if goals are achievable by target dates
5. **Unmotivated Tracking** - Missing milestones and progress celebrations
6. **No Prioritization** - Can't determine which goals to focus on first
7. **Risk Assessment** - No analysis of goal achievability under different scenarios

---

## Proposed Solution

Comprehensive goal management system with:

### Core Components

1. **Goal Framework** - Multiple goal types with flexible targets and timelines
2. **Progress Tracking** - Real-time tracking via linked transactions
3. **Savings Planning** - Automated calculation of required contributions
4. **Timeline Projections** - Monte Carlo modeling for achievability
5. **Milestone Management** - Intermediate checkpoints for motivation
6. **Analytics Engine** - Goal health, priority scoring, outcome prediction

---

## Feature Specifications

### 1. Goal Types & Categories

**Goal Types:**
- Savings Goals (amount targets: $10k emergency fund)
- Investment Goals (growth targets: reach $100k retirement at 60)
- Debt Reduction (paydown targets: eliminate $25k student loans)
- Milestone Goals (event-based: save for wedding by 2025)
- Habit Goals (behavioral: consistent monthly contributions)

**Categories:**
- Emergency Fund
- Retirement
- Education
- Home Purchase
- Vehicle
- Travel
- Wedding
- Business
- Debt Payoff
- Custom

### 2. Goal States & Lifecycle

**States:**
- `planning` - Initial goal creation
- `active` - Currently saving towards goal
- `paused` - Temporarily inactive
- `on_track` - Meeting targets
- `off_track` - Behind schedule
- `achieved` - Target reached
- `abandoned` - Cancelled
- `exceeded` - Surpassed target

**Transitions:**
- planning → active (when contributions start)
- active → paused/on_track/off_track (based on progress)
- on_track → achieved (at target)
- off_track → on_track (when pace improves)
- any → abandoned (user cancels)

### 3. Progress Tracking

**Progress Calculation:**
- Target Amount (goal)
- Current Amount (sum of linked transactions)
- Contributed Percentage (current / target * 100)
- Days Elapsed (creation date → now)
- Days Remaining (now → target date)
- Pace Ratio (days elapsed / total days)

**Status Determination:**
- On Track: contributed % ≥ pace ratio
- Off Track: contributed % < pace ratio
- At Risk: contributed % < (pace ratio - 10%)

### 4. Savings Plan Generation

**Plan Components:**
1. **Required Monthly Amount** = (target - current) / months remaining
2. **Contribution Frequency** = customizable (weekly, biweekly, monthly, quarterly)
3. **Payment Method** = auto-debit, manual, investment allocation
4. **Buffer Strategy** = add 10% buffer for missed months

**Plan Adjustments:**
- Increase frequency if behind schedule
- Decrease frequency if ahead of schedule
- Calculate impact of different contribution amounts

### 5. Timeline Projections

**Projection Models:**

**Deterministic Model:**
- Linear: constant monthly contributions
- Stepped: increasing contributions over time
- Target: achieve by specific date

**Stochastic Model (Monte Carlo):**
- Variable market returns (6-10% annually)
- Income fluctuation factors
- 1000 iteration simulations
- Success probability calculation (% chance of achievement)

**Confidence Levels:**
- 90% confidence: conservative scenario
- 50% confidence: realistic scenario  
- 10% confidence: optimistic scenario

### 6. Milestone Tracking

**Milestone Types:**
- Percentage Milestones (25%, 50%, 75%, 100%)
- Amount Milestones ($5k, $10k, $25k)
- Time Milestones (3 months, 6 months, 1 year)
- Custom Milestones (user-defined)

**Milestone Events:**
- Achievement date/time
- Celebration notifications
- Progress badges
- Motivation messages

### 7. Goal Prioritization

**Priority Scoring (0-100):**
- Urgency (40%): days until target date
- Importance (30%): user-defined importance score
- Achievability (20%): success probability
- Impact (10%): financial impact of achievement

**Auto-Prioritization:**
- Order goals by score
- Highlight critical priorities
- Suggest contribution allocation

### 8. Analytics & Insights

**Goal Health:**
- Overall portfolio health score (0-100)
- Risk assessment (low/medium/high)
- Achievability prediction

**Insights Generated:**
- "You're 15% ahead of schedule"
- "Increase savings by $200/month to stay on track"
- "This goal has 87% success probability"
- "Priority shift: Goal A now more urgent than Goal B"

---

## Database Schema

### Table: financial_goals
Purpose: Core goal definitions
- Columns: id, userId, vaultId, goalName, goalType, category, targetAmount, currentAmount, targetDate, priority, importance, riskTolerance, status, autoCalculateSavings, notes, createdAt, updatedAt

### Table: goal_progress_snapshots
Purpose: Historical progress tracking with versioning
- Columns: id, goalId, userId, contributedAmount, percentageComplete, status, snapshotDate, daysUntilTarget, requiredMonthlyAmount, achievementProbability, confidence, createdAt

### Table: savings_plans
Purpose: Calculated contribution plans
- Columns: id, goalId, userId, currentAmount, targetAmount, timeToTargetMonths, requiredMonthlyAmount, contributionFrequency, recommendedStartDate, bufferAmount, paymentMethod, autoDebitEnabled, createdAt, updatedAt

### Table: goal_milestones
Purpose: Progress checkpoints and celebrations
- Columns: id, goalId, userId, milestoneType, milestoneValue, targetDate, status, achievedDate, celebrationMessage, notificationSent, createdAt

### Table: milestone_achievements
Purpose: Track milestone completions with badges
- Columns: id, milestoneId, goalId, userId, achievedDate, timeToAchieve, motivationFactor, badgeEarned, shareableLink, createdAt

### Table: goal_transactions_link
Purpose: Link transactions to goals for tracking
- Columns: id, goalId, transactionId, userId, contributedAmount, contributionDate, transactionType, notes, linkedAt

### Table: goal_timeline_projections
Purpose: Timeline and achievability projections
- Columns: id, goalId, userId, projectionType, simulationCount, successProbability, achievementConfidence, projectedCompletionDate, monthlyVariance, bestCaseAmount, worstCaseAmount, mostLikelyAmount, generatedAt

### Table: goal_analytics_snapshots
Purpose: Historical analytics and insights
- Columns: id, goalId, userId, snapshotMonth, healthScore, riskLevel, priorityScore, achievabilityScore, trendDirection, recommendedAction, analyticsData (JSON), generatedAt

---

## Service Components

### 1. Goal Manager Service
CRUD operations, state management, priority calculation, goal lifecycle

### 2. Savings Plan Calculator
Calculate required contributions, payment schedules, buffer strategies, adjustments

### 3. Progress Tracker
Track contributions, update status, calculate metrics, generate snapshots

### 4. Milestone Celebrator
Create milestones, track achievements, generate badges, send celebrations

### 5. Timeline Projector
Monte Carlo simulations, probability calculations, scenario modeling, predictions

### 6. Goal Analytics Engine
Health scoring, risk assessment, insights generation, trend analysis

---

## Success Criteria

✅ Create goals with flexible types and timelines  
✅ Auto-link transactions to goals for progress  
✅ Generate savings plans with contribution schedules  
✅ Calculate success probability via simulations  
✅ Track milestones with celebration notifications  
✅ Provide priority scoring and recommendations  
✅ Generate analytics and insights  
✅ Support goal state transitions  

---

## Implementation Timeline

- Phase 1 (Week 1): Planning + Schema + Goal Manager
- Phase 2 (Week 1): Calculators + Progress Tracker  
- Phase 3 (Week 2): Milestones + Timeline + Analytics
- Phase 4 (Week 2): API endpoints + Frontend (pending)

---

## Dependencies

- date-fns (timeline calculations)
- lodash (utilities)
- Existing transaction service
- Existing vault/user models

---

## Related Issues

- #653 Portfolio Analytics (financial data)
- #641 Tax Optimization (goal categorization)
- #663 Recurring Bills (savings plan coordination)
