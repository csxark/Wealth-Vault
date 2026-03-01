import express from "express";

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
import { initializeUploads } from "./middleware/fileUpload.js";
import outboxDispatcher from "./jobs/outboxDispatcher.js";
import certificateRotation from "./jobs/certificateRotation.js";
import financialReconciliation from "./jobs/financialReconciliation.js";
import budgetRollupReconciliation from "./jobs/budgetRollupReconciliation.js";
import RecurringPaymentScheduler from "./jobs/recurringPaymentScheduler.js";
import fxReconciliation from "./jobs/fxReconciliation.js";
import integrityService from "./services/integrityService.js";
import milestoneReconciliation from "./jobs/milestoneReconciliation.js";
import "./services/sagaDefinitions.js"; // Register saga definitions
import { createFileServerRoute } from "./middleware/secureFileServer.js";
import { requestIdMiddleware, requestLogger, errorLogger, analyticsMiddleware } from "./middleware/requestLogger.js";
import { auditLogger } from "./middleware/auditLogger.js";
import { apiIdempotency } from "./middleware/apiIdempotency.js";
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

    // Initialize Database Connection (CRITICAL - must succeed)
    try {
      console.log('🔄 Connecting to database...');
      await connectDatabase();
      console.log('✅ Database connected successfully');
    } catch (err) {
      console.error('❌ CRITICAL: Database connection failed:', err.message);
      console.error('   Server cannot start without database connection.');
      process.exit(1); // Fail fast
    }

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

    // Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/users", userLimiter, userRoutes);
    app.use("/api/expenses", userLimiter, expenseRoutes);
    app.use("/api/goals", userLimiter, apiIdempotency(), goalRoutes);
    app.use("/api/outbox", userLimiter, outboxRoutes);
    app.use("/api/soft-delete", userLimiter, softDeleteRoutes);
    app.use("/api/integrity", userLimiter, softDeleteRoutes);
    app.use("/api/milestones", userLimiter, milestoneRoutes);
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
            isConnected: redisState.isConn,
        databaseConnected: getDatabaseState().isConnected
      });
      
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(
        `📱 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
      );
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
      
      // Database status
      const dbState = getDatabaseState();
      if (dbState.isConnected) {
        console.log('✅ Database: Connected');
      } else {
        console.log('❌ Database: Not connected');
      }
      
      // Redis statusp.use(errorLogger);

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
    console.log('✅ Background jobs stopped');
    
    // Disconnect from Redis
    await disconnectRedis();
    
    // Disconnect from Database
    await disconnectDatabaseerver running on port ${PORT}`);
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

