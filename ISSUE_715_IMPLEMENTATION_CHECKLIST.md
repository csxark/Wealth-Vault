# Issue #715 - Goal Adjustment Explainability Timeline
## Implementation Checklist & Status

**Status**: ✅ Infrastructure & Core Implementation Complete  
**Date Started**: March 2, 2026  
**Target Completion**: March 15, 2026

---

## 1. Database Schema ✅

- [x] Create `goal_adjustment_explanations` table
  - [x] Fields: previous/new amounts, attribution factors, confidence, etc
  - [x] Indexes on user_id, goal_id, created_at, severity
- [x] Create `goal_adjustment_attribution_details` table
  - [x] Fields: factor category, impact %, severity indicator
  - [x] Link to parent explanation
- [x] Create `goal_adjustment_timeline` table
  - [x] Immutable chronological record
  - [x] User interaction tracking
  - [x] Engagement scoring
- [x] Create `goal_adjustment_insights` table
  - [x] Pre-computed insights for performance
  - [x] Top factors, volatility, trends, scores
- [x] Create `goal_adjustment_comparison` table
  - [x] Model prediction accuracy tracking
- [x] Add relations to schema.js
  - [x] Relations for all tables
  - [x] Back-references for easy querying

**Files Modified**:
- `backend/db/schema.js`
- `backend/drizzle/0007_goal_adjustment_explainability.sql`

---

## 2. Service Layer ✅

- [x] Create `GoalAdjustmentExplainabilityService`
  - [x] `logAdjustment()` - Store new adjustment with factors
  - [x] `getAdjustmentHistory()` - Paginated history retrieval
  - [x] `getAdjustmentDetails()` - Full single adjustment details
  - [x] `acknowledgeAdjustment()` - Track user acknowledgement
  - [x] `markAdjustmentAsViewed()` - Track engagement
  - [x] `updateInsights()` - Calculate insights
  - [x] Helper methods:
    - [x] `generateSummary()` - Human-readable explanation
    - [x] `determineSeverity()` - Classify change severity
    - [x] `analyzeTopFactors()` - Find common factors
    - [x] `analyzeAdjustmentFrequency()` - Volatility analysis
    - [x] `analyzeTrend()` - Directional trend
    - [x] `calculateTrustScore()` - User trust metrics
    - [x] `calculateClarityScore()` - Explanation clarity

**Files Created**:
- `backend/services/goalAdjustmentExplainabilityService.js`

---

## 3. API Routes ✅

- [x] Create API route handlers
  - [x] `GET /goals/:goalId/adjustments` - History with pagination
  - [x] `GET /goals/:goalId/adjustments/:explanationId` - Details
  - [x] `POST /goals/:goalId/adjustments/:explanationId/acknowledge` - Feedback
  - [x] `GET /goals/:goalId/adjustment-insights` - Insights
  - [x] `GET /goals/:goalId/adjustment-timeline/summary` - Dashboard summary

- [x] Add Swagger documentation to all endpoints
- [x] Implement proper error handling and validation
- [x] Add authentication/authorization checks

**Files Created**:
- `backend/routes/goalAdjustmentExplainability.js`

---

## 4. Documentation ✅

- [x] Create full feature documentation
  - [x] Problem statement
  - [x] Solution overview
  - [x] Schema documentation
  - [x] API endpoint documentation
  - [x] Service layer documentation
  - [x] Integration points
  - [x] Trigger types and scenarios
  - [x] Example explanations
  - [x] Metrics and insights
  - [x] Implementation checklist
  - [x] Future enhancements

- [x] Create quick start guide
  - [x] For backend developers
  - [x] For frontend developers
  - [x] Component examples
  - [x] Data flow diagram
  - [x] Testing procedures
  - [x] Troubleshooting guide

**Files Created**:
- `ISSUE_715_GOAL_EXPLAINABILITY.md`
- `ISSUE_715_QUICKSTART.md`

---

## 5. Integration Tasks (Next Steps)

- [ ] **Integrate with Goal Contribution Smoothing Service**
  - [ ] Modify `goalContributionSmoothingService.js` to call explainability logging
  - [ ] Extract attribution factors from smoothing calculations
  - [ ] Pass trigger source and confidence metrics

- [ ] **Implement Attribution Factor Analysis**
  - [ ] Create `goalAttributionAnalyzer.js` service
  - [ ] Calculate income delta from cashflow history
  - [ ] Calculate expense delta from spending patterns
  - [ ] Calculate deadline pressure score
  - [ ] Calculate priority shift metrics
  - [ ] Analyze macro economic factors
  - [ ] Analyze user behavior patterns

- [ ] **Add Dashboard Components**
  - [ ] Timeline visualization component
  - [ ] Attribution factor breakdown component
  - [ ] Insights dashboard widget
  - [ ] Adjustment history list component
  - [ ] User feedback collection UI

- [ ] **Frontend Integration**
  - [ ] Add routes to react-router
  - [ ] Create pages/modals for adjustment details
  - [ ] Implement timeline visualization
  - [ ] Add engagement tracking
  - [ ] Create settings for explanation preferences

---

## 6. Testing Strategy (Planned)

### Unit Tests
- [ ] Attribution factor calculations
- [ ] Summary generation logic
- [ ] Severity determination
- [ ] Score calculations (trust, clarity)
- [ ] Timeline sequence generation

### Integration Tests
- [ ] Full adjustment logging workflow
- [ ] Database transactions
- [ ] API endpoint responses
- [ ] Foreign key relationships
- [ ] Cascade deletes

### E2E Tests
- [ ] View adjustment history flow
- [ ] Acknowledge adjustment flow
- [ ] View detailed explanation
- [ ] Provide feedback flow
- [ ] Dashboard insights update

### Performance Tests
- [ ] Query performance with indexes
- [ ] Bulk adjustment logging
- [ ] Insights calculation time
- [ ] API response times

---

## 7. Configuration & Deployment

- [ ] Database migration strategy
- [ ] Rollback procedure
- [ ] Feature flag (if needed)
- [ ] Performance monitoring
- [ ] Error tracking setup
- [ ] Logging configuration

---

## 8. Dependencies & Requirements

### Required Packages
- `drizzle-orm` - Already installed ✅
- `date-fns` - For date calculations (likely already installed)
- PostgreSQL 13+ - For JSON/UUID support

### Database Requirements
- PostgreSQL 13+
- Drizzle migration capability

### Node/API Requirements
- Express.js - Routing ✅
- UUID support ✅
- JSON field support ✅

---

## 9. Files Summary

### Newly Created Files (3)
1. `backend/drizzle/0007_goal_adjustment_explainability.sql` (270 lines)
   - SQL migration for all 5 new tables with indexes

2. `backend/services/goalAdjustmentExplainabilityService.js` (500+ lines)
   - Core service implementation with 10+ methods

3. `backend/routes/goalAdjustmentExplainability.js` (400+ lines)
   - API route handlers with 5 endpoints

### Modified Files (1)
1. `backend/db/schema.js`
   - Added 5 new table definitions
   - Added 5 new relation objects

### Documentation Files (2)
1. `ISSUE_715_GOAL_EXPLAINABILITY.md` (350+ lines)
   - Comprehensive feature documentation

2. `ISSUE_715_QUICKSTART.md` (300+ lines)
   - Developer quick start guide

---

## 10. Trigger Sources & Attribution Examples

### Cashflow Change
```
Factors:
- Income Increase: +$500/month (40% impact)
- Expense Decrease: -$200/month (15% impact)
Result: Increase recommendation by $300
```

### Goal Progress Update
```
Factors:
- User made $2000 contribution (50% impact)
- Goal is 75% complete (25% impact)
Result: Decrease recommendation, goal on track
```

### Deadline Pressure
```
Factors:
- 60 days remaining vs 90 original (45% impact)
- $2000 shortfall to target (35% impact)
Result: Increase recommendation significantly
```

### Priority Shift
```
Factors:
- Priority increased from medium to high (50% impact)
- Other goals deprioritized (25% impact)
Result: Increase recommendation
```

---

## 11. Success Metrics

### Adoption Metrics
- [ ] X% of users view adjustment history
- [ ] X% acknowledge adjustments
- [ ] X% provide feedback on explanations

### Quality Metrics
- [ ] Trust score > 0.7 (out of 1.0)
- [ ] Clarity score > 0.65 (out of 1.0)
- [ ] <5% "confused" feedback responses

### Performance Metrics
- [ ] API responses < 500ms (p95)
- [ ] Adjustment logging < 100ms
- [ ] Insights calculation < 2 seconds

---

## 12. Known Limitations & Future Work

### Current Limitations
- [ ] Explanations generated with hardcoded templates
- [ ] No real-time notification system
- [ ] No comparison to similar user goals
- [ ] Limited to single language

### Future Enhancements (v2)
- [ ] ML-powered explanation generation (GPT-4)
- [ ] Real-time push notifications
- [ ] "How does this compare?" analysis
- [ ] Multi-language support
- [ ] Predictive adjustment warnings
- [ ] User preference customization
- [ ] Mobile app explainability UI

---

## 13. Risk Assessment & Mitigation

### Risks
1. **Data Integrity**: Incorrect attribution factors
   - Mitigation: Comprehensive unit tests

2. **Performance**: Large adjustment histories
   - Mitigation: Pagination, pre-computed insights

3. **User Confusion**: Over-complex explanations
   - Mitigation: Template-based simple language, clarity score tracking

4. **Database Migration**: Handling existing goal data
   - Mitigation: Migration scripts create default entries

### Assumptions
- Goal contribution smoothing service will call explainability logger
- Frontend team will implement UI components
- Users want detailed explanations (confirmed in requirements)

---

## Next Steps (Priority Order)

1. **DONE**: ✅ Database schema design and migration
2. **DONE**: ✅ Service layer implementation  
3. **DONE**: ✅ API routes and documentation
4. **NEXT**: 🔄 Integrate with goal contribution smoother service
5. **NEXT**: 🔄 Implement attribution analyzer
6. **NEXT**: 🔄 Frontend components
7. **NEXT**: 🔄 Testing (unit, integration, E2E)
8. **NEXT**: 🔄 Performance optimization
9. **NEXT**: 🔄 Deployment and monitoring

---

## Questions & Notes

**Q**: Should we notify users immediately when adjustments occur?  
**A**: Start with history view only, add notifications in v2

**Q**: How detailed should explanations be?  
**A**: Use simple 2-3 sentence templates initially, expand based on user feedback

**Q**: What's the retention policy for old adjustments?  
**A**: Keep indefinitely for audit trail, consider archiving after 2 years

**Q**: Should explanations be editable by admins?  
**A**: No, maintain audit trail integrity. Provide feedback mechanism instead.

---

**Last Updated**: March 2, 2026  
**Status**: Core implementation complete, awaiting integration with existing services
