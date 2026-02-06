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
import { generalLimiter, aiLimiter, userLimiter } from "./middleware/rateLimiter.js";
import { sanitizeInput, sanitizeMongo } from "./middleware/sanitizer.js";
import { responseWrapper } from "./middleware/responseWrapper.js";
import { paginationMiddleware } from "./utils/pagination.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

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
import debtsRouter from "./routes/debts.js";

// Import debt management services
import debtEngine from "./services/debtEngine.js";
import payoffOptimizer from "./services/payoffOptimizer.js";
import refinanceScout from "./services/refinanceScout.js";
import { scheduleMonthlyReports } from "./jobs/reportGenerator.js";
import subscriptionMonitor from "./jobs/subscriptionMonitor.js";
import fxRateSync from "./jobs/fxRateSync.js";
import valuationUpdater from "./jobs/valuationUpdater.js";
import inactivityMonitor from "./jobs/inactivityMonitor.js";
import taxEstimator from "./jobs/taxEstimator.js";
import { scheduleWeeklyHabitDigest } from "./jobs/weeklyHabitDigest.js";
import { scheduleTaxReminders } from "./jobs/taxReminders.js";
import debtRecalculator from "./jobs/debtRecalculator.js";
import { auditRequestIdMiddleware } from "./middleware/auditMiddleware.js";
import { initializeDefaultTaxCategories } from "./services/taxService.js";
import marketData from "./services/marketData.js";

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
app.use("/api/expenses", userLimiter, expenseRoutes);
app.use("/api/goals", userLimiter, goalRoutes);
app.use("/api/categories", userLimiter, categoryRoutes);
app.use("/api/analytics", userLimiter, analyticsRoutes);
app.use("/api/vaults", userLimiter, vaultRoutes);
app.use("/api/reports", userLimiter, reportRoutes);
app.use("/api/gemini", aiLimiter, geminiRouter);
app.use("/api/currencies", userLimiter, currenciesRoutes);
app.use("/api/audit", userLimiter, auditRoutes);
app.use("/api/security", userLimiter, securityRoutes);
app.use("/api/subscriptions", userLimiter, subscriptionRoutes);
app.use("/api/assets", userLimiter, assetRoutes);
app.use("/api/governance", userLimiter, governanceRoutes);
app.use("/api/tax", userLimiter, taxRoutes);
app.use("/api/debts", userLimiter, debtsRouter);

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
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

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
  
  // Start debt recalculator scheduled job
  debtRecalculator.startScheduledJob();

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
