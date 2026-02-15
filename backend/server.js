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
import { connectRedis } from "./config/redis.js";
import { scheduleCleanup } from "./jobs/tokenCleanup.js";
import { scheduleRatesSync, runImmediateSync } from "./jobs/syncRates.js";
import { initializeUploads } from "./middleware/fileUpload.js";
import { createFileServerRoute } from "./middleware/secureFileServer.js";
import {
  generalLimiter,
  aiLimiter,
  userLimiter,
} from "./middleware/rateLimiter.js";
import { requestIdMiddleware, requestLogger, errorLogger, analyticsMiddleware } from "./middleware/requestLogger.js";
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
import governanceRoutes from "./routes/governance.js";
import taxRoutes from "./routes/tax.js";
import debtRoutes from "./routes/debts.js";
import walletRoutes from "./routes/wallets.js";
import fxRoutes from "./routes/fx_ledger.js";
import simulationRoutes from "./routes/simulations.js";
import businessRoutes from "./routes/business.js";
import payrollRoutes from "./routes/payroll.js";
import vaultConsolidationRoutes from "./routes/vault-consolidation.js";
import recurringPaymentsRoutes from "./routes/recurring-payments.js";
import categorizationRoutes from "./routes/categorization.js";
import currencyPortfolioRoutes from "./routes/currency-portfolio.js";
import budgetRoutes from "./routes/budgets.js";
import expenseSharesRoutes from "./routes/expenseShares.js";
import reimbursementsRoutes from "./routes/reimbursements.js";
import forecastRoutes from "./routes/forecasts.js";
import liquidityOptimizerRoutes from "./routes/liquidityOptimizer.js";
import forensicRoutes from "./routes/forensic.js";
import rebalancingRoutes from "./routes/rebalancing.js";
import replayRoutes from "./routes/replay.js";
import successionRoutes from "./routes/succession.js";
import entityRoutes from "./routes/entities.js";
import yieldsRoutes from "./routes/yields.js";
import { presenceTracker } from "./middleware/successionMiddleware.js";
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
import riskBaselineJob from "./jobs/riskBaselineJob.js";
import yieldMonitorJob from "./jobs/yieldMonitorJob.js";
import simulationJob from "./jobs/simulationJob.js";
import payoutMonitor from "./jobs/payoutMonitor.js";
import taxAuditJob from "./jobs/taxAuditJob.js";
import { securityGuard } from "./middleware/securityGuard.js";
import { auditRequestIdMiddleware } from "./middleware/auditMiddleware.js";
import { initializeDefaultTaxCategories } from "./services/taxService.js";
import marketData from "./services/marketData.js";

// Event Listeners
import { initializeBudgetListeners } from "./listeners/budgetListeners.js";
import { initializeNotificationListeners } from "./listeners/notificationListeners.js";
import { initializeAnalyticsListeners } from "./listeners/analyticsListeners.js";
import { initializeSubscriptionListeners } from "./listeners/subscriptionListeners.js";
import { initializeSavingsListeners } from "./listeners/savingsListeners.js";



// Load environment variables
dotenv.config();

// Initialize Redis connection
connectRedis().catch((err) => {
  console.warn("⚠️ Redis connection failed, using memory-based rate limiting");
});

// Schedule token cleanup job
scheduleCleanup();

// Schedule exchange rates sync job
scheduleRatesSync();

// Run initial exchange rates sync
runImmediateSync().then(() => {
  console.log('✅ Initial exchange rates sync completed');
}).catch(err => {
  console.warn('⚠️ Initial exchange rates sync failed:', err.message);
});

// Schedule weekly habit digest job
scheduleWeeklyHabitDigest();

// Initiliz uplod directorys
initializeUploads().catch((err) => {
  console.error("❌ Failed to initialize upload directories:", err);
});

// Initialize Event Listeners
initializeBudgetListeners();
initializeNotificationListeners();
initializeAnalyticsListeners();
initializeSubscriptionListeners();
initializeSavingsListeners();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
// Configure Helmet with CORS-friendly settings
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }),
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

// Logng and monitrng midlware
app.use(requestIdMiddleware);
app.use(auditRequestIdMiddleware); // Add audit request correlation
app.use(requestLogger);
app.use(performanceMiddleware);
app.use(analyticsMiddleware);

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
  }),
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userLimiter, userRoutes);
app.use("/api/expenses", userLimiter, securityGuard, expenseRoutes);
app.use("/api/goals", userLimiter, goalRoutes);
app.use("/api/categories", userLimiter, categoryRoutes);
app.use("/api/analytics", userLimiter, analyticsRoutes);
// Apply presence tracker to all protected routes
app.use("/api", presenceTracker);
app.use("/api/vaults", userLimiter, vaultRoutes);
app.use("/api/budgets", userLimiter, budgetRoutes);
app.use("/api/expense-shares", userLimiter, expenseSharesRoutes);
app.use("/api/reimbursements", userLimiter, reimbursementsRoutes);
app.use("/api/reports", userLimiter, reportRoutes);
app.use("/api/debts", userLimiter, debtRoutes);
app.use("/api/wallets", userLimiter, walletRoutes);
app.use("/api/fx", userLimiter, fxRoutes);
app.use("/api/forecasts", userLimiter, forecastRoutes);
app.use("/api/gemini", aiLimiter, geminiRouter);
app.use("/api/currencies", userLimiter, currenciesRoutes);
app.use("/api/audit", userLimiter, auditRoutes);
app.use("/api/security", userLimiter, securityRoutes);
app.use("/api/subscriptions", userLimiter, subscriptionRoutes);
app.use("/api/assets", userLimiter, assetRoutes);
app.use("/api/governance", userLimiter, governanceRoutes);
app.use("/api/tax", userLimiter, taxRoutes);
app.use("/api/simulations", userLimiter, simulationRoutes);
app.use("/api/business", userLimiter, businessRoutes);
app.use("/api/payroll", userLimiter, payrollRoutes);
app.use("/api/vault-consolidation", userLimiter, vaultConsolidationRoutes);
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





// Secur fil servr for uploddd fils



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

// Centralized error handling middleware (must be last)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logInfo('Server started successfully', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000"
    });

    console.log(`🚀 Server running on port ${PORT}`);
    console.log(
      `📱 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`,
    );
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);

    // Start background jobs
    scheduleMonthlyReports();
    scheduleWeeklyHabitDigest();
    scheduleTaxReminders();
    subscriptionMonitor.initialize();
    fxRateSync.start();
    valuationUpdater.start();
    inactivityMonitor.start();
    taxEstimator.start();
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
    riskBaselineJob.start();
    yieldMonitorJob.start();
    simulationJob.start();
    payoutMonitor.start();
    taxAuditJob.start();

    // Add debt services to app.locals for middleware/route access
    app.locals.debtEngine = debtEngine;
    app.locals.payoffOptimizer = payoffOptimizer;
    app.locals.refinanceScout = refinanceScout;

    // Initialize default tax categories and market indices
    initializeDefaultTaxCategories().catch(err => {
      console.warn('⚠️ Tax categories initialization skipped (may already exist):', err.message);
    });

    marketData.initializeDefaults().catch(err => {
      console.warn('⚠️ Market indices initialization skipped:', err.message);
    });
  });
}

export default app;
