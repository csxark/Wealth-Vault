import express from "express";
import chatbotRoutes from "./routes/chatbot.routes.js";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import { connectRedis, getConnectionState, isRedisAvailable, disconnectRedis } from "./config/redis.js";
import { connectDatabase, disconnectDatabase, getDatabaseState, isDatabaseHealthy } from "./config/db.js";
import { scheduleCleanup } from "./jobs/tokenCleanup.js";
import { scheduleRatesSync, runImmediateSync } from "./jobs/syncRates.js";
import { initializeUploads } from "./middleware/fileUpload.js";
import outboxDispatcher from "./jobs/outboxDispatcher.js";
import certificateRotation from "./jobs/certificateRotation.js";
import financialReconciliation from "./jobs/financialReconciliation.js";
import budgetRollupReconciliation from "./jobs/budgetRollupReconciliation.js";
import RecurringPaymentScheduler from "./jobs/recurringPaymentScheduler.js";
import fxReconciliation from "./jobs/fxReconciliation.js";
import forecastReconciliation from "./jobs/forecastReconciliation.js";
import integrityService from "./services/integrityService.js";
import milestoneReconciliation from "./jobs/milestoneReconciliation.js";
import "./services/sagaDefinitions.js"; // Register saga definitions
import { createFileServerRoute } from "./middleware/secureFileServer.js";
import {
  generalLimiter,
  aiLimiter,
  userLimiter,
} from "./middleware/rateLimiter.js";
import { requestIdMiddleware, requestLogger, errorLogger, analyticsMiddleware } from "./middleware/requestLogger.js";
import { auditLogger } from "./middleware/auditLogger.js";
import { apiIdempotency } from "./middleware/apiIdempotency.js";
import { performanceMiddleware } from "./services/performanceMonitor.js";
import { logInfo, logError } from "./utils/logger.js";
import { sanitizeInput, sanitizeMongo } from "./middleware/sanitizer.js";
import { responseWrapper } from "./middleware/responseWrapper.js";
import { paginationMiddleware } from "./utils/pagination.js";
import { notFound } from "./middleware/errorHandler.js";
import { globalErrorHandler } from "./middleware/globalErrorHandler.js";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import expenseRoutes from "./routes/expenses.js";
import goalRoutes from "./routes/goals.js";
import categoryRoutes from "./routes/categories.js";
import geminiRouter from "./routes/gemini.js";
import analyticsRoutes from "./routes/analytics.js";
import vaultRoutes from "./routes/vaults.js";
import reportRoutes from "./routes/reports.js";
import currenciesRoutes from "./routes/currencies.js";
import auditRoutes from "./routes/audit.js";
import securityRoutes from "./routes/security.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import assetRoutes from "./routes/assets.js";
import notificationRoutes from "./routes/notifications.js";
import governanceRoutes from "./routes/governance.js";
import taxRoutes from "./routes/tax.js";
import debtRoutes from "./routes/debts.js";
import privateDebtRoutes from "./routes/privateDebt.js";
import walletRoutes from "./routes/wallets.js";
import fxRoutes from "./routes/fx_ledger.js";
import simulationRoutes from "./routes/simulations.js";
import businessRoutes from "./routes/business.js";
import payrollRoutes from "./routes/payroll.js";
import vaultConsolidationRoutes from "./routes/vault-consolidation.js";
import recurringPaymentsRoutes from "./routes/recurring-payments.js";
import categorizationRoutes from "./routes/categorization.js";
import smartCategorizationRoutes from "./routes/smartCategorization.js";
import currencyPortfolioRoutes from "./routes/currency-portfolio.js";
import budgetRoutes from "./routes/budgets.js";
import smartAlerts from "./routes/smartAlerts.js";
import expenseSharesRoutes from "./routes/expenseShares.js";
import reimbursementsRoutes from "./routes/reimbursements.js";
import interlockRoutes from "./routes/interlock.js";
import liquiditySweepJob from "./jobs/liquiditySweepJob.js";
import interlockAccrualSync from "./jobs/interlockAccrualSync.js";
import forecastRoutes from "./routes/forecasts.js";
import liquidityOptimizerRoutes from "./routes/liquidityOptimizer.js";
import forensicRoutes from "./routes/forensic.js";
import rebalancingRoutes from "./routes/rebalancing.js";
import replayRoutes from "./routes/replay.js";
import successionRoutes from "./routes/succession.js";
import entityRoutes from "./routes/entities.js";
import yieldsRoutes from "./routes/yields.js";
import arbitrageRoutes from "./routes/arbitrage.js";
import autopilotRoutes from "./routes/autopilot.js";
import scheduleWorkflowDaemon from "./jobs/workflowDaemon.js";
import { triggerInterceptor } from "./middleware/triggerInterceptor.js";
import { initializeAutopilotListeners } from "./listeners/autopilotListeners.js";
import inventoryRoutes from "./routes/inventory.js";
import marginRoutes from "./routes/margin.js";
import clearingRoutes from "./routes/clearing.js";
import scheduleMarketOracle from "./jobs/marketOracleSync.js";
import schedulePrecomputePaths from "./jobs/precomputePaths.js";
import escrowRoutes from "./routes/escrow.js";
import { presenceTracker } from "./middleware/successionMiddleware.js";
import successionHeartbeatService from "./services/successionHeartbeatService.js";
import successionStateMachine from "./services/successionStateMachine.js";
import debtEngine from "./services/debtEngine.js";
import payoffOptimizer from "./services/payoffOptimizer.js";
import refinanceScout from "./services/refinanceScout.js";
import { scheduleMonthlyReports } from "./jobs/reportGenerator.js";
import subscriptionMonitor from "./jobs/subscriptionMonitor.js";
import fxRateSync from "./jobs/fxRateSync.js";
import valuationUpdater from "./jobs/valuationUpdater.js";
import inactivityMonitor from "./jobs/inactivityMonitor.js";
import snapshotGenerator from "./jobs/snapshotGenerator.js";
import riskAuditor from "./jobs/riskAuditor.js";
import taxEstimator from "./jobs/taxEstimator.js";
import debtRecalculator from "./jobs/debtRecalculator.js";
import { scheduleDebtStressTest } from "./jobs/debtStressTestJob.js";
import rateSyncer from "./jobs/rateSyncer.js";
import forecastUpdater from "./jobs/forecastUpdater.js";
import consolidationSync from "./jobs/consolidationSync.js";
import recurringPaymentProcessor from "./jobs/recurringPaymentProcessor.js";
import categorizationTrainer from "./jobs/categorizationTrainer.js";
import fxRateUpdater from "./jobs/fxRateUpdater.js";
import driftMonitor from "./jobs/driftMonitor.js";
import { scheduleWeeklyHabitDigest } from "./jobs/weeklyHabitDigest.js";
import { scheduleTaxReminders } from "./jobs/taxReminders.js";
import leaseMonitor from "./jobs/leaseMonitor.js";
import dividendProcessor from "./jobs/dividendProcessor.js";
import liquidityOptimizerJob from "./jobs/liquidityOptimizerJob.js";
import arbitrageJob from "./jobs/arbitrageJob.js";
import riskMonitorJob from "./jobs/riskMonitorJob.js";
import clearingJob from "./jobs/clearingJob.js";
import taxHarvestJob from "./jobs/taxHarvestJob.js";
import scheduleTaxHarvestSync from "./jobs/taxHarvestSync.js";
import { initializeTaxListeners } from "./events/taxListeners.js";
import riskBaselineJob from "./jobs/riskBaselineJob.js";
import yieldMonitorJob from "./jobs/yieldMonitorJob.js";
import scheduleOracleSync from "./jobs/oracleSync.js";
import simulationJob from "./jobs/simulationJob.js";
import payoutMonitor from "./jobs/payoutMonitor.js";
import taxAuditJob from "./jobs/taxAuditJob.js";
import riskScanner from "./jobs/riskScanner.js";
import marketRateSyncJob from "./jobs/marketRateSyncJob.js";
import velocityJob from "./jobs/velocityJob.js";
import scheduleMacroDataSync from "./jobs/macroDataSync.js";
import scheduleLotReconciliation from "./jobs/lotReconciliation.js";
import scheduleStressTests from "./jobs/stressTestSync.js";
import scheduleResolutionCleanup from "./jobs/resolutionCleanup.js";
import marketMonitor from "./jobs/marketMonitor.js";
import { securityGuard } from "./middleware/securityGuard.js";
import { auditRequestIdMiddleware } from "./middleware/auditMiddleware.js";
import { initializeDefaultTaxCategories } from "./services/taxService.js";
import marketData from "./services/marketData.js";
import cascadeMonitorJob from "./jobs/cascadeMonitorJob.js";
import topologyGarbageCollector from "./jobs/topologyGarbageCollector.js";
import escrowValuationJob from "./jobs/escrowValuationJob.js";
import hedgeDecayMonitor from "./jobs/hedgeDecayMonitor.js";
import dynastyTrustsRoutes from "./routes/dynastyTrusts.js";
import irsRateSyncJob from "./jobs/irsRateSyncJob.js";
import annuityExecutionJob from "./jobs/annuityExecutionJob.js";
import spvOwnershipRoutes from "./routes/spvOwnership.js";
import capitalCallIssuerJob from "./jobs/capitalCallIssuer.js";
import derivativesRoutes from "./routes/derivatives.js";
import optionsRollEvaluator from "./jobs/optionsRollEvaluator.js";
import volatilitySyncJob from "./jobs/volatilitySyncJob.js";
import passionAssetsRoutes from "./routes/passionAssets.js";
import passionAppraisalSyncJob from "./jobs/passionAppraisalSync.js";

// Event Listeners
import { initializeBudgetListeners } from "./listeners/budgetListeners.js";
import { initializeNotificationListeners } from "./listeners/notificationListeners.js";
import { initializeAnalyticsListeners } from "./listeners/analyticsListeners.js";
import { initializeSubscriptionListeners } from "./listeners/subscriptionListeners.js";
import { initializeSavingsListeners } from "./listeners/savingsListeners.js";
import thresholdMonitor from "./services/thresholdMonitor.js";
import liquidityRechargeJob from "./jobs/liquidityRechargeJob.js";
import auditTrailSealer from "./jobs/auditTrailSealer.js";
import taxOptimizationRoutes from "./routes/taxOptimization.js";
import taxHarvestScanner from "./jobs/taxHarvestScanner.js";
import washSaleExpirationJob from "./jobs/washSaleExpirationJob.js";
import { initializeLiquidityListeners } from "./listeners/liquidityListeners.js";
import workflowEngine from "./services/workflowEngine.js"; // Bootstrap event hooks
import healthRoutes from "./routes/health.js";
import performanceRoutes from "./routes/performance.js";
import tenantRoutes from "./routes/tenants.js";
import auditRoutes from "./routes/audit.js";
import servicesRoutes from "./routes/services.js";
import dbRouterRoutes from "./routes/dbRouter.js";
import authorizationRoutes from "./routes/authorization.js";
import outboxRoutes from "./routes/outbox.js";
import softDeleteRoutes from "./routes/softDelete.js";
import milestoneRoutes from "./routes/milestones.js";
import forecastRoutes from "./routes/forecasts.js";
import goalSharingRoutes from "./routes/goalSharing.js";
import anomalyRoutes from "./routes/anomalies.js";
import rebalancingRoutes from "./routes/rebalancing.js";

// Import DB Router
import { initializeDBRouter } from "./services/dbRouterService.js";
import { attachDBConnection, dbRoutingErrorHandler } from "./middleware/dbRouting.js";
import policyEngineService from "./services/policyEngineService.js";

// Load environment variables
dotenv.config();

/**
 * Startup sequence with proper initialization order
 */
const startServer = async () => {
  try {
    console.log('🚀 Starting Wealth Vault Server...');
    console.log('⏳ Initializing services...');

    // Initialize DB Router (with read/write split)
    try {
      await initializeDBRouter();
      console.log('✅ DB Router initialized (read/write split enabled)');
    } catch (err) {
      console.warn('⚠️ DB Router initialization failed, using primary only:', err.message);
    }

    // Initialize Policy Engine (policy-as-code authorization)
    try {
      await policyEngineService.initialize();
      console.log('✅ Policy Engine initialized (authorization centralized)');
    } catch (err) {
      console.warn('⚠️ Policy Engine initialization failed:', err.message);
    }

    // Initialize Redis connection with retry logic
    // Note: Server will start even if Redis fails (graceful degradation to memory-based rate limiting)
    try {
      console.log('🔄 Connecting to Redis...');
      await connectRedis(false); // Don't block server startup on Redis failure
      
      if (isRedisAvailable()) {
        console.log('✅ Redis connected successfully - distributed rate limiting enabled');
      } else {
        console.warn('⚠️ Redis not available - using memory-based rate limiting (not distributed)');
      }
    } catch (err) {
      console.warn('⚠️ Redis connection failed:', err.message);
      console.warn('   Using memory-based rate limiting (not distributed across instances)');
    }

    // Schedule token cleanup job
    scheduleCleanup();
    console.log('🗑️  Token cleanup job scheduled');

    // Start outbox event dispatcher
    outboxDispatcher.start();
    console.log('📤 Outbox dispatcher started');

    // Start certificate rotation job
    certificateRotation.start();
    console.log('🔐 Certificate rotation job started');

    // Start distributed financial reconciliation job
    financialReconciliation.start();
    console.log('🧮 Financial reconciliation job started');

    // Start recurring payment scheduler
    const paymentScheduler = new RecurringPaymentScheduler();
    await paymentScheduler.start();
    console.log('📅 Recurring payment scheduler started');

    // Start budget rollup reconciliation job
    budgetRollupReconciliation.start(60); // Run every 60 minutes
    console.log('💰 Budget rollup reconciliation job started');

    // Start FX reconciliation job
    fxReconciliation.start(60 * 60 * 1000); // Run every 60 minutes
    console.log('💱 FX reconciliation job started');

    // Start integrity check job for soft-delete safety
    // Note: This will run once immediately, then every 60 minutes
    // Each tenant's integrity check is independent
    console.log('✅ Integrity check service initialized (will run per-tenant)');

    // Start milestone reconciliation job
    milestoneReconciliation.schedule(60); // Run every 60 minutes
    console.log('🎯 Milestone reconciliation job started');

    // Start forecast reconciliation job
    forecastReconciliation.start(120); // Run every 2 hours
    console.log('📊 Forecast reconciliation job started');

    // Initialize upload directories
    try {
      await initializeUploads();
      console.log('📁 Upload directories initialized');
    } catch (err) {
      console.error('❌ Failed to initialize upload directories:', err);
    }

    // Configure Express app
    const app = express();
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Middleware
    // Configure Helmet with CORS-friendly settings
    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
      })
    );

    // Configure CORS
    app.use(
      cors({
        origin: function (origin, callback) {
          const allowedOrigins = [
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
            "http://localhost:3003",
            "http://127.0.0.1:3003",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            process.env.FRONTEND_URL,
          ].filter(Boolean);

          // Allow requests with no origin (like mobile apps or curl requests)
          if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Accept",
          "Origin",
          "Access-Control-Request-Method",
          "Access-Control-Request-Headers",
        ],
        exposedHeaders: ["Content-Range", "X-Content-Range", "Authorization"],
        preflightContinue: false,
        optionsSuccessStatus: 204,
      })
    );
    app.use(morgan("combined"));
    app.use(compression());
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Security: Sanitize user input to prevent XSS and NoSQL injection
    app.use(sanitizeMongo);
    app.use(sanitizeInput);

    // Response wrapper and pagination middleware
    app.use(responseWrapper);
    app.use(paginationMiddleware());

    // Database routing middleware (read/write split)
    app.use(attachDBConnection({
      enableSessionTracking: true,
      preferReplicas: process.env.PREFER_REPLICAS !== 'false'
    }));

    // Logng and monitrng midlware
    app.use(requestIdMiddleware);
    app.use(requestLogger);
    app.use(performanceMiddleware);
    app.use(analyticsMiddleware);
    app.use(auditLogger);

    // Additional CORS headers middleware
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", req.headers.origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, PATCH"
      );

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
      } else {
        next();
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);
app.use(morgan("combined"));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Security: Sanitize user input to prevent XSS and NoSQL injection
app.use(sanitizeMongo);
app.use(sanitizeInput);

// Response wrapper and pagination middleware
app.use(responseWrapper);
app.use(paginationMiddleware());

// Database routing middleware (read/write split)
app.use(attachDBConnection({
  enableSessionTracking: true,
  preferReplicas: process.env.PREFER_REPLICAS !== 'false'
}));

// Logng and monitrng midlware
app.use(requestIdMiddleware);
app.use(auditRequestIdMiddleware); // Add audit request correlation
app.use(requestLogger);
app.use(performanceMiddleware);
app.use(analyticsMiddleware);
app.use(auditLogger);

// Additional CORS headers middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
  } else {
    next();
  }
});

// Import database configuration
// Database configuration is handled via Drizzle in individual modules
console.log("📦 Database initialized via Drizzle");

// Apply general rate limiting to all API routes
app.use("/api", generalLimiter);

// Autopilot trigger interceptor — fires workflow events post-response
app.use("/api", triggerInterceptor);

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Wealth Vault API Docs",
  }),
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userLimiter, userRoutes);
app.use("/api/expenses", userLimiter, securityGuard, expenseRoutes);
app.use("/api/goals", userLimiter, goalRoutes);
app.use("/api/categories", userLimiter, categoryRoutes);
app.use("/api/smart-categorization", userLimiter, smartCategorizationRoutes);
app.use("/api/analytics", userLimiter, analyticsRoutes);
app.use("/api/interlock", userLimiter, interlockRoutes);
// Apply presence tracker to all protected routes
app.use("/api", presenceTracker);
app.use("/api/vaults", userLimiter, vaultRoutes);
app.use("/api/budgets", userLimiter, budgetRoutes);
app.use("/api/smart-alerts", userLimiter, smartAlerts);
app.use("/api/expense-shares", userLimiter, expenseSharesRoutes);
app.use("/api/reimbursements", userLimiter, reimbursementsRoutes);
app.use("/api/interlock", userLimiter, interlockRoutes);
app.use("/api/reports", userLimiter, reportRoutes);
app.use("/api/private-debt", userLimiter, privateDebtRoutes);
app.use("/api/debts", userLimiter, debtRoutes);
app.use("/api/wallets", userLimiter, walletRoutes);
app.use("/api/fx", userLimiter, fxRoutes);
app.use("/api/forecasts", userLimiter, forecastRoutes);
app.use("/api/monte-carlo", userLimiter, monteCarloRoutes);
app.use("/api/gemini", aiLimiter, geminiRouter);
app.use("/api/currencies", userLimiter, currenciesRoutes);
app.use("/api/audit", userLimiter, auditRoutes);
app.use("/api/security", userLimiter, securityRoutes);
app.use("/api/subscriptions", userLimiter, subscriptionRoutes);
app.use("/api/assets", userLimiter, assetRoutes);
app.use("/api/governance", userLimiter, governanceRoutes);
app.use("/api/tax", userLimiter, taxRoutes);
app.use("/api/tax/optimization", userLimiter, taxOptimizationRoutes);
app.use("/api/simulations", userLimiter, simulationRoutes);
app.use("/api/business", userLimiter, businessRoutes);
app.use("/api/payroll", userLimiter, payrollRoutes);
app.use("/api/vault-consolidation", userLimiter, vaultConsolidationRoutes);
app.use("/api/inventory", userLimiter, inventoryRoutes);
app.use("/api/margin", userLimiter, marginRoutes);
app.use("/api/clearing", userLimiter, clearingRoutes);
app.use("/api/recurring-payments", userLimiter, recurringPaymentsRoutes);
app.use("/api/categorization", userLimiter, categorizationRoutes);
app.use("/api/currency-portfolio", userLimiter, currencyPortfolioRoutes);
app.use("/api/rebalancing", userLimiter, rebalancingRoutes);
app.use("/api/replay", userLimiter, replayRoutes);
app.use("/api/succession", userLimiter, successionRoutes);
app.use("/api/entities", userLimiter, securityGuard, entityRoutes);
app.use("/api/liquidity", userLimiter, liquidityOptimizerRoutes);
app.use("/api/forensic", userLimiter, forensicRoutes);
app.use("/api/yields", userLimiter, yieldsRoutes);
app.use("/api/arbitrage", userLimiter, arbitrageRoutes);
app.use("/api/autopilot", userLimiter, autopilotRoutes);
app.use("/api/escrow", userLimiter, escrowRoutes);
app.use("/api/risk-lab", userLimiter, riskLabRoutes);
app.use("/api/corporate", userLimiter, corporateRoutes);
app.use("/api/succession-plan", userLimiter, successionApiRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/liquidity/graph", userLimiter, liquidityGraphRoutes);
app.use("/api/dynasty-trusts", userLimiter, dynastyTrustsRoutes);
app.use("/api/spv", userLimiter, spvOwnershipRoutes);
app.use("/api/derivatives", userLimiter, derivativesRoutes);
app.use("/api/passion-assets", userLimiter, passionAssetsRoutes);


app.use("/api/health", healthRoutes);
app.use("/api/performance", userLimiter, performanceRoutes);
app.use("/api/tenants", userLimiter, tenantRoutes);
app.use("/api/audit", userLimiter, auditRoutes);
app.use("/api/db-router", userLimiter, dbRouterRoutes);


// Family Financial Planning routes
app.use("/api/family", userLimiter, familyRoutes);

// Secure file server for uploaded files
app.use("/uploads", createFileServerRoute());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Wealth Vault API is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler for undefined routes (must be before error handler)
app.use(notFound);

// Add error logging middleware
app.use(errorLogger);

// DB routing error handler (must be before general error handler)
app.use(dbRoutingErrorHandler());

// Centralized error handling middleware (must be last)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  cascadeMonitorJob.start();
  topologyGarbageCollector.start();
  wealthSimulationJob.start();
  app.listen(PORT, () => {
    logInfo('Server started successfully', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000"
    });

    // Import database configuration
    // Database configuration is handled via Drizzle in individual modules
    // import connectDB from './config/db.js';
    console.log("📦 Database initialized via Drizzle");

    // Apply general rate limiting to all API routes
    app.use("/api", generalLimiter);

    // Swagger API Documentation
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "Wealth Vault API Docs",
      })
    );
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);

    // Start background jobs
    scheduleMonthlyReports();
    scheduleWeeklyHabitDigest();
    scheduleTaxReminders();
    scheduleRecoveryExpirationJob();
    subscriptionMonitor.initialize();
    fxRateSync.start();
    valuationUpdater.start();
    inactivityMonitor.start();
    taxEstimator.start();
    scheduleDebtStressTest();
    debtRecalculator.startScheduledJob();
    rateSyncer.start();
    forecastUpdater.start();
    riskAuditor.start();
    leaseMonitor.start();
    dividendProcessor.start();
    consolidationSync.start();
    recurringPaymentProcessor.start();
    categorizationTrainer.start();
    fxRateUpdater.start();
    liquidityOptimizerJob.start();
    arbitrageJob.start();
    riskMonitorJob.start();
    clearingJob.start();
    taxHarvestJob.start();
    scheduleTaxHarvestSync();
    initializeTaxListeners();
    riskBaselineJob.start();
    yieldMonitorJob.start();
    simulationJob.start();
    payoutMonitor.start();
    taxAuditJob.start();
    riskScanner.start();
    marketRateSyncJob.start();
    velocityJob.start();
    scheduleWorkflowDaemon();
    scheduleMacroDataSync();
    driftMonitor();
    scheduleLotReconciliation();
    scheduleStressTests();
    scheduleMarketOracle();
    schedulePrecomputePaths();
    scheduleResolutionCleanup();
    marketMonitor.start();
    volatilityMonitor.start();
    payrollCycleJob.start();
    mortalityDaemon.start();
    residencyAuditJob.start();
    scheduleOracleSync();
    liquiditySweepJob.init();
    interlockAccrualSync.init();
    thresholdMonitor.start();
    escrowValuationJob.start();
    hedgeDecayMonitor.start();
    liquidityRechargeJob.start();
    auditTrailSealer.start();
    taxHarvestScanner.start();
    washSaleExpirationJob.start();
    irsRateSyncJob.start();
    annuityExecutionJob.start();
    capitalCallIssuerJob.start();
    optionsRollEvaluator.start();
    volatilitySyncJob.start();
    passionAppraisalSyncJob.start();
    scheduleNightlySimulations();

    // Add debt services to app.locals for middleware/route access
    app.locals.debtEngine = debtEngine;
    app.locals.payoffOptimizer = payoffOptimizer;
    app.locals.refinanceScout = refinanceScout;

    // Initialize default tax categories and market indices
    initializeDefaultTaxCategories().catch(err => {
      console.warn('⚠️ Tax categories initialization skipped (may already exist):', err.message);

    // Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/users", userLimiter, userRoutes);
    app.use("/api/expenses", userLimiter, expenseRoutes);
    app.use("/api/goals", userLimiter, apiIdempotency(), goalRoutes);
    app.use("/api/outbox", userLimiter, outboxRoutes);
    app.use("/api/soft-delete", userLimiter, softDeleteRoutes);
    app.use("/api/integrity", userLimiter, softDeleteRoutes);
    app.use("/api/milestones", userLimiter, milestoneRoutes);
    app.use("/api/forecasts", userLimiter, forecastRoutes);
    app.use("/api/goal-sharing", userLimiter, goalSharingRoutes);
    app.use("/api/anomalies", userLimiter, anomalyRoutes);
    app.use("/api/portfolio", userLimiter, rebalancingRoutes);
    app.use("/api/categories", userLimiter, categoryRoutes);
    app.use("/api/analytics", userLimiter, analyticsRoutes);
    app.use("/api/gemini", aiLimiter, geminiRouter);
    app.use("/api/transactions", userLimiter, softDeleteRoutes);
    app.use("/api/health", async (req, res) => {
      const redisState = getConnectionState();
      const dbState = getDatabaseState();
      const dbHealthy = await isDatabaseHealthy();
      
      const overallHealthy = dbHealthy && dbState.isConnected;
      
      res.status(overallHealthy ? 200 : 503).json({
        status: overallHealthy ? "OK" : "DEGRADED",
        message: overallHealthy 
          ? "Wealth Vault API is running" 
          : "API running with degraded services",
        timestamp: new Date().toISOString(),
        services: {
          database: {
            state: dbState.state,
            isConnected: dbState.isConnected,
            healthy: dbHealthy,
            attempts: dbState.attempts,
            ...(dbState.lastError && { lastError: dbState.lastError })
          },
    // Secur fil servr for uploddd fils
    app.use("/uploads", createFileServerRoute());

    // Health check endpoint (enhanced with Redis state)
    app.get("/api/health", (req, res) => {
      const redisState = getConnectionState();
      res.json({
        status: "OK",
        message: "Wealth Vault API is running",
        timestamp: new Date().toISOString(),
        services: {
          redis: {
            state: redisState.state,
            circuitBreaker: redisState.circuitBreaker,
            isConnected: redisState.isConnected
          }
        }
      });
    });

    // 404 handler for undefined routes (must be before error handler)
    app.use(notFound);

    // Add error logging middleware
    app.use(errorLogger);

    // DB routing error handler (must be before general error handler)
    app.use(dbRoutingErrorHandler());

    // Centralized error handling middleware (must be last)
    app.use(errorHandler);

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      logInfo('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
        redisAvailable: isRedisAvailable()
      });
      
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(
        `📱 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
      );
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
      
      const redisState = getConnectionState();
      if (redisState.isConnected) {
        console.log('✅ Redis: Connected (distributed rate limiting active)');
      } else {
        console.log('⚠️  Redis: Not connected (using memory-based rate limiting)');
      }
      
      console.log('\n✨ Server initialization complete!');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  try {
    // Stop background jobs
    outboxDispatcher.stop();
    certificateRotation.stop();
    
    // Disconnect from Redis
    const { disconnectRedis } = await import('./config/redis.js');
    await disconnectRedis();
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
startServer();

precomputePathsJob.start();

export default app;
