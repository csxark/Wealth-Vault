import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import db from '../config/db.js';
import { goals, users, tenants } from '../db/schema.js';
import { goalDependencies, goalCascadeAnalyses } from '../db/schema-goal-cascade.js';
import { eq, and } from 'drizzle-orm';

/**
 * Goal Cascade Risk Propagation Service Tests - Issue #731
 */

describe('Goal Cascade Risk Propagation Engine', () => {
  let authToken;
  let testUserId;
  let testTenantId;
  let emergencyFundGoalId;
  let vacationGoalId;
  let homeDownPaymentGoalId;

  // Test Data Setup
  beforeAll(async () => {
    // Create test tenant
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Test Tenant Cascade',
        slug: 'test-cascade',
        status: 'active',
      })
      .returning();
    testTenantId = tenant.id;

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: 'cascade-test@example.com',
        password: 'hashed_password',
        tenantId: testTenantId,
      })
      .returning();
    testUserId = user.id;

    // Mock auth token (replace with actual token generation in real tests)
    authToken = 'test-auth-token';
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(goalDependencies).where(eq(goalDependencies.userId, testUserId));
    await db.delete(goalCascadeAnalyses).where(eq(goalCascadeAnalyses.userId, testUserId));
    await db.delete(goals).where(eq(goals.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  beforeEach(async () => {
    // Create test goals before each test
    const now = new Date();
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    const [emergencyFund] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        tenantId: testTenantId,
        title: 'Emergency Fund',
        targetAmount: '10000.00',
        currentAmount: '3000.00',
        type: 'emergency_fund',
        status: 'active',
        deadline: sixMonthsLater,
      })
      .returning();
    emergencyFundGoalId = emergencyFund.id;

    const [vacation] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        tenantId: testTenantId,
        title: 'Vacation Fund',
        targetAmount: '5000.00',
        currentAmount: '500.00',
        type: 'vacation',
        status: 'active',
        deadline: sixMonthsLater,
      })
      .returning();
    vacationGoalId = vacation.id;

    const [homeDP] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        tenantId: testTenantId,
        title: 'Home Down Payment',
        targetAmount: '50000.00',
        currentAmount: '5000.00',
        type: 'home_purchase',
        status: 'active',
        deadline: new Date(now.setMonth(now.getMonth() + 12)),
      })
      .returning();
    homeDownPaymentGoalId = homeDP.id;
  });

  describe('Goal Dependencies', () => {
    it('should create a goal dependency successfully', async () => {
      const res = await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: emergencyFundGoalId,
          downstreamGoalId: vacationGoalId,
          dependencyType: 'sequential',
          requiredProgress: 100.0,
          isBlocking: true,
          relationshipReason: 'Emergency fund must complete before vacation',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dependency).toHaveProperty('id');
      expect(res.body.data.dependency.upstreamGoalId).toBe(emergencyFundGoalId);
      expect(res.body.data.dependency.downstreamGoalId).toBe(vacationGoalId);
    });

    it('should prevent circular dependencies', async () => {
      // Create dependency: Emergency Fund → Vacation
      await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: emergencyFundGoalId,
          downstreamGoalId: vacationGoalId,
          dependencyType: 'sequential',
        });

      // Try to create reverse dependency: Vacation → Emergency Fund (circular)
      const res = await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: vacationGoalId,
          downstreamGoalId: emergencyFundGoalId,
          dependencyType: 'sequential',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Circular dependency detected');
    });

    it('should prevent self-dependency', async () => {
      const res = await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: emergencyFundGoalId,
          downstreamGoalId: emergencyFundGoalId,
          dependencyType: 'sequential',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot depend on itself');
    });

    it('should retrieve all user dependencies', async () => {
      // Create a dependency
      await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: emergencyFundGoalId,
          downstreamGoalId: vacationGoalId,
          dependencyType: 'sequential',
        });

      const res = await request(app)
        .get('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dependencies).toBeInstanceOf(Array);
      expect(res.body.data.count).toBeGreaterThan(0);
    });
  });

  describe('Slippage Detection', () => {
    it('should detect goal slippage correctly', async () => {
      const res = await request(app)
        .get(`/api/goal-cascade/analyze/${emergencyFundGoalId}/slippage`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slippage).toHaveProperty('isSlipping');
      expect(res.body.data.slippage).toHaveProperty('severity');
      expect(res.body.data.slippage).toHaveProperty('progressGap');
      expect(res.body.data).toHaveProperty('shouldTriggerCascade');
    });

    it('should calculate progress gap accurately', async () => {
      const res = await request(app)
        .get(`/api/goal-cascade/analyze/${emergencyFundGoalId}/slippage`)
        .set('Authorization', `Bearer ${authToken}`);

      const { slippage } = res.body.data;
      
      // Emergency fund is at 30% (3000/10000) but should be further along
      expect(slippage.actualProgress).toBe(30.0);
      expect(slippage.expectedProgress).toBeGreaterThan(30.0);
      expect(slippage.progressGap).toBeGreaterThan(0);
    });
  });

  describe('Cascade Analysis', () => {
    beforeEach(async () => {
      // Create dependency chain: Emergency Fund → Vacation → Home DP
      await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: emergencyFundGoalId,
          downstreamGoalId: vacationGoalId,
          dependencyType: 'sequential',
          requiredProgress: 100.0,
        });

      await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: vacationGoalId,
          downstreamGoalId: homeDownPaymentGoalId,
          dependencyType: 'sequential',
          requiredProgress: 100.0,
        });
    });

    it('should run cascade analysis successfully', async () => {
      const res = await request(app)
        .post(`/api/goal-cascade/analyze/${emergencyFundGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'progress_decline',
          maxDepth: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('analysis');
      expect(res.body.data).toHaveProperty('impacts');
      expect(res.body.data).toHaveProperty('mitigations');
      expect(res.body.data).toHaveProperty('summary');
    });

    it('should identify all affected goals', async () => {
      const res = await request(app)
        .post(`/api/goal-cascade/analyze/${emergencyFundGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'progress_decline',
          maxDepth: 3,
        });

      const { impacts, summary } = res.body.data;

      // Should find vacation and home DP as affected
      expect(impacts.length).toBeGreaterThan(0);
      expect(summary.totalAffectedGoals).toBeGreaterThan(0);
      
      // Check that downstream goals are identified
      const affectedGoalIds = impacts.map((i) => i.affectedGoalId);
      expect(affectedGoalIds).toContain(vacationGoalId);
    });

    it('should calculate deadline slips correctly', async () => {
      const res = await request(app)
        .post(`/api/goal-cascade/analyze/${emergencyFundGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'progress_decline',
          maxDepth: 3,
        });

      const { impacts } = res.body.data;

      for (const impact of impacts) {
        expect(impact).toHaveProperty('deadlineSlipDays');
        expect(impact).toHaveProperty('revisedDeadline');
        expect(impact.deadlineSlipDays).toBeGreaterThan(0);
        expect(new Date(impact.revisedDeadline)).toBeInstanceOf(Date);
      }
    });

    it('should generate impact graph', async () => {
      const res = await request(app)
        .post(`/api/goal-cascade/analyze/${emergencyFundGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'progress_decline',
          maxDepth: 3,
        });

      const { analysis } = res.body.data;

      expect(analysis.impactGraph).toHaveProperty('nodes');
      expect(analysis.impactGraph).toHaveProperty('edges');
      expect(analysis.impactGraph.nodes.length).toBeGreaterThan(0);
    });

    it('should calculate risk score', async () => {
      const res = await request(app)
        .post(`/api/goal-cascade/analyze/${emergencyFundGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'progress_decline',
          maxDepth: 3,
        });

      const { analysis, summary } = res.body.data;

      expect(analysis.cascadeRiskScore).toBeGreaterThanOrEqual(0);
      expect(analysis.cascadeRiskScore).toBeLessThanOrEqual(100);
      expect(summary).toHaveProperty('riskLevel');
      expect(['low', 'medium', 'high', 'severe']).toContain(summary.riskLevel);
    });
  });

  describe('Mitigation Strategies', () => {
    let analysisId;

    beforeEach(async () => {
      // Create dependency and run analysis
      await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: emergencyFundGoalId,
          downstreamGoalId: vacationGoalId,
          dependencyType: 'sequential',
        });

      const analysisRes = await request(app)
        .post(`/api/goal-cascade/analyze/${emergencyFundGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'progress_decline',
          maxDepth: 3,
        });

      analysisId = analysisRes.body.data.analysis.id;
    });

    it('should generate mitigation strategies', async () => {
      const res = await request(app)
        .get(`/api/goal-cascade/mitigations/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mitigations).toBeInstanceOf(Array);
      expect(res.body.data.mitigations.length).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty('primaryRecommendation');
    });

    it('should include required mitigation details', async () => {
      const res = await request(app)
        .get(`/api/goal-cascade/mitigations/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const mitigations = res.body.data.mitigations;

      for (const mitigation of mitigations) {
        expect(mitigation).toHaveProperty('strategyType');
        expect(mitigation).toHaveProperty('strategyTitle');
        expect(mitigation).toHaveProperty('strategyDescription');
        expect(mitigation).toHaveProperty('recommendationScore');
        expect(mitigation).toHaveProperty('implementationDifficulty');
      }
    });

    it('should apply mitigation strategy', async () => {
      const mitigationsRes = await request(app)
        .get(`/api/goal-cascade/mitigations/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const strategyId = mitigationsRes.body.data.mitigations[0].id;

      const res = await request(app)
        .post(`/api/goal-cascade/mitigations/${strategyId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('results');
      expect(res.body.data.appliedActions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Dashboard and History', () => {
    it('should retrieve cascade dashboard', async () => {
      const res = await request(app)
        .get('/api/goal-cascade/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body. data).toHaveProperty('recentCascades');
      expect(res.body.data).toHaveProperty('dependencyGraph');
    });

    it('should retrieve cascade history', async () => {
      const res = await request(app)
        .get('/api/goal-cascade/history?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analyses).toBeInstanceOf(Array);
      expect(res.body.data).toHaveProperty('pagination');
    });

    it('should preview impact for goal', async () => {
      const res = await request(app)
        .get(`/api/goal-cascade/goals/${emergencyFundGoalId}/impact-preview`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('currentSlippage');
      expect(res.body.data).toHaveProperty('potentiallyAffectedGoals');
      expect(res.body.data).toHaveProperty('wouldTriggerCascade');
    });
  });

  describe('Edge Cases', () => {
    it('should handle goal with no dependencies', async () => {
      const res = await request(app)
        .post(`/api/goal-cascade/analyze/${homeDownPaymentGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'manual_trigger',
          maxDepth: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.summary.totalAffectedGoals).toBe(0);
    });

    it('should handle deep dependency chains', async () => {
      // Create deep chain (depth > maxDepth)
      let prevGoalId = emergencyFundGoalId;
      
      for (let i = 0; i < 6; i++) {
        const [newGoal] = await db
          .insert(goals)
          .values({
            userId: testUserId,
            tenantId: testTenantId,
            title: `Goal Level ${i}`,
            targetAmount: '1000.00',
            currentAmount: '100.00',
            status: 'active',
            deadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
          })
          .returning();

        await request(app)
          .post('/api/goal-cascade/dependencies')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            upstreamGoalId: prevGoalId,
            downstreamGoalId: newGoal.id,
            dependencyType: 'sequential',
          });

        prevGoalId = newGoal.id;
      }

      const res = await request(app)
        .post(`/api/goal-cascade/analyze/${emergencyFundGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          triggerEvent: 'progress_decline',
          maxDepth: 3,
        });

      // Should limit to maxDepth
      expect(res.status).toBe(201);
      expect(res.body.data.analysis.analysisDepth).toBeLessThanOrEqual(3);
    });

    it('should handle inactive dependencies', async () => {
      // Create and deactivate a dependency
      const depRes = await request(app)
        .post('/api/goal-cascade/dependencies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          upstreamGoalId: emergencyFundGoalId,
          downstreamGoalId: vacationGoalId,
          dependencyType: 'sequential',
        });

      const dependencyId = depRes.body.data.dependency.id;

      await request(app)
        .delete(`/api/goal-cascade/dependencies/${dependencyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .get('/api/goal-cascade/dependencies?includeInactive=false')
        .set('Authorization', `Bearer ${authToken}`);

      // Should not include deactivated dependency
      const deps = res.body.data.dependencies;
      expect(deps.find((d) => d.id === dependencyId)).toBeUndefined();
    });
  });
});
