import express from "express";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import db from "../config/db.js";
import { users, categories, securityEvents } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { uploadProfilePicture, saveUploadedFile } from "../middleware/fileUpload.js";
import fileStorageService from "../services/fileStorageService.js";
import { getDefaultCategories } from "../utils/defaults.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { validatePasswordStrength, isCommonPassword } from "../utils/passwordValidator.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { AppError } from "../utils/AppError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import successionService from "../services/successionService.js";

import {
  createDeviceSession,
  refreshAccessToken,
  revokeDeviceSession,
  revokeAllUserSessions,
  getUserSessions,
  blacklistToken
} from "../services/tokenService.js";
import {
  generateMFASecret,
  generateQRCode,
  verifyTOTP,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCode,
  markRecoveryCodeAsUsed,
  getRecoveryCodeStatus,
  isValidMFAToken,
} from "../utils/mfa.js";
import securityService from "../services/securityService.js";

const router = express.Router();

// Helper to get device info from request
const getDeviceInfo = (req) => {
  const userAgent = req.get('User-Agent') || '';
  const deviceId = req.get('X-Device-ID') || req.get('Device-ID');

  let deviceType = 'web';
  let deviceName = 'Unknown Device';

  if (userAgent.includes('Mobile')) {
    deviceType = 'mobile';
    deviceName = 'Mobile Device';
  } else if (userAgent.includes('Tablet')) {
    deviceType = 'tablet';
    deviceName = 'Tablet Device';
  } else if (userAgent.includes('Chrome')) {
    deviceName = 'Chrome Browser';
  } else if (userAgent.includes('Firefox')) {
    deviceName = 'Firefox Browser';
  } else if (userAgent.includes('Safari')) {
    deviceName = 'Safari Browser';
  }

  return {
    deviceId,
    deviceName,
    deviceType,
    userAgent
  };
};

// Helper to sanitize user object
const getPublicProfile = (user) => {
  const { password, ...publicUser } = user;
  return publicUser;
};

// Legacy token generation (for backward compatibility)
const generateToken = (id) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};

/**
 * @swagger
 * /auth/check-email:
 *   post:
 *     summary: Check if email already exists
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 exists:
 *                   type: boolean
 *       400:
 *         description: Invalid email format
 */
router.post(
  "/check-email",
  [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email")
      .normalizeEmail(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Invalid email format", errors.array()));
    }

    const { email } = req.body;
    if (!email) {
      return next(new AppError(400, "Email is required"));
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    return new ApiResponse(200, { exists: !!existingUser }, 'Email check completed').send(res);
  })
);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               currency:
 *                 type: string
 *                 default: USD
 *               monthlyIncome:
 *                 type: number
 *               monthlyBudget:
 *                 type: number
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       400:
 *         description: Validation failed or user already exists
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 */
router.post(
  "/register",
  process.env.NODE_ENV === 'test' ? [] : authLimiter,
  [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email")
      .normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("firstName")
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage(
        "First name is required and must be less than 50 characters"
      ),
    body("lastName")
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage("Last name is required and must be less than 50 characters"),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const {
      email,
      password,
      firstName,
      lastName,
      currency,
      monthlyIncome,
      monthlyBudget,
    } = req.body;

    // Check for required fields
    if (!email || !password || !firstName || !lastName) {
      return next(new AppError(400, "Missing required fields: email, password, firstName, and lastName are required."));

    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existingUser) {
      return next(new AppError(409, "User with this email already exists"));
    }

    // Check if password is common
    if (isCommonPassword(password)) {
      return next(new AppError(400, "This password is too common. Please choose a more secure password."));
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password, [email, firstName, lastName]);
    if (!passwordValidation.success) {
      return next(new AppError(400, passwordValidation.message, passwordValidation.feedback));
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        currency: currency || "USD",
        monthlyIncome: monthlyIncome || "0",
        monthlyBudget: monthlyBudget || "0",
      })
      .returning();

    // Create default categories
    const defaultCategoriesData = getDefaultCategories().map((cat) => ({
      userId: newUser.id,
      name: cat.name,
      description: cat.description,
      color: cat.color,
      icon: cat.icon,
      type: cat.type,
      isDefault: cat.isDefault,
      priority: cat.priority,
      budget: { monthly: 0, yearly: 0 },
      spendingLimit: "0",
    }));

    await db.insert(categories).values(defaultCategoriesData);

    // Create device session with enhanced tokens
    const deviceInfo = getDeviceInfo(req);
    const ipAddress = req.ip || req.connection.remoteAddress;
    const tokens = await createDeviceSession(newUser.id, deviceInfo, ipAddress);

    // Update activity for Dead Man's Switch
    await successionService.trackActivity(newUser.id, 'register');

    // Log successful registration
    logAudit(req, {
      userId: newUser.id,
      action: AuditActions.AUTH_REGISTER,
      resourceType: ResourceTypes.USER,
      resourceId: newUser.id,
      metadata: { email: newUser.email },
      status: 'success',
    });

    return new ApiResponse(201, {
      user: getPublicProfile(newUser),
      ...tokens,
    }, "User registered successfully").send(res);
  })
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user and get token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 */
router.post(
  "/login",
  process.env.NODE_ENV === 'test' ? [] : authLimiter,
  [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email")
      .normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
    body("mfaToken").optional().isString(),
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { email, password, mfaToken } = req.body;

    // Check for required fields
    if (!email || !password) {
      return next(new AppError(400, "Missing required fields: email and password are required."));
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (!user) {
      // Log failed login attempt
      const ipAddress = req.ip || req.connection.remoteAddress;
      const location = await securityService.getIPLocation(ipAddress);
      await securityService.logSecurityEvent({
        userId: user?.id,
        eventType: 'login_failed',
        ipAddress,
        userAgent: req.get('User-Agent'),
        location,
        deviceInfo: getDeviceInfo(req),
        status: 'warning',
        details: { reason: 'invalid_credentials' },
      });

      return next(new AppError(401, "Invalid credentials"));
    }

    if (!user.isActive) {
      return next(new AppError(401, "Account is deactivated. Please contact support."));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Log failed login attempt
      const ipAddress = req.ip || req.connection.remoteAddress;
      const location = await securityService.getIPLocation(ipAddress);
      await securityService.logSecurityEvent({
        userId: user.id,
        eventType: 'login_failed',
        ipAddress,
        userAgent: req.get('User-Agent'),
        location,
        deviceInfo: getDeviceInfo(req),
        status: 'warning',
        details: { reason: 'invalid_password' },
      });

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      if (!mfaToken) {
        // MFA required but no token provided
        return res.status(403).json({
          success: false,
          message: "MFA token required",
          mfaRequired: true,
        });
      }

      // Verify MFA token
      const isValidToken = verifyTOTP(user.mfaSecret, mfaToken);

      if (!isValidToken) {
        // Try recovery code
        const recoveryCodeIndex = verifyRecoveryCode(
          mfaToken,
          user.mfaRecoveryCodes || []
        );

        if (recoveryCodeIndex === -1) {
          // Log failed MFA attempt
          const ipAddress = req.ip || req.connection.remoteAddress;
          const location = await securityService.getIPLocation(ipAddress);
          await securityService.logSecurityEvent({
            userId: user.id,
            eventType: 'login_failed',
            ipAddress,
            userAgent: req.get('User-Agent'),
            location,
            deviceInfo: getDeviceInfo(req),
            status: 'warning',
            details: { reason: 'invalid_mfa_token' },
          });

          return res.status(401).json({
            success: false,
            message: "Invalid MFA token or recovery code",
          });
        }

        // Mark recovery code as used
        const updatedCodes = markRecoveryCodeAsUsed(user.mfaRecoveryCodes, recoveryCodeIndex);
        await db
          .update(users)
          .set({ mfaRecoveryCodes: updatedCodes })
          .where(eq(users.id, user.id));
      }
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    // Update activity for Dead Man's Switch
    await successionService.trackActivity(user.id, 'login');

    // Get IP and location
    const ipAddress = req.ip || req.connection.remoteAddress;
    const location = await securityService.getIPLocation(ipAddress);
    const deviceInfo = getDeviceInfo(req);

    // Check if this is a new/suspicious login
    const isNewLogin = await securityService.isNewOrSuspiciousLogin(user.id, ipAddress);

    // Log successful login
    const securityEvent = await securityService.logSecurityEvent({
      userId: user.id,
      eventType: 'login_success',
      ipAddress,
      userAgent: req.get('User-Agent'),
      location,
      deviceInfo,
      status: isNewLogin ? 'warning' : 'info',
      details: { mfaUsed: user.mfaEnabled },
    });

    // Send notification for new/suspicious logins
    if (isNewLogin) {
      await securityService.sendSecurityNotification(user, securityEvent);
    }

    // Detect suspicious activity
    const suspicion = await securityService.detectSuspiciousActivity(user.id, ipAddress, location);
    if (suspicion.isSuspicious) {
      const suspiciousEvent = await securityService.logSecurityEvent({
        userId: user.id,
        eventType: 'suspicious_activity',
        ipAddress,
        userAgent: req.get('User-Agent'),
        location,
        deviceInfo,
        status: 'critical',
        details: { reasons: suspicion.reasons, riskLevel: suspicion.riskLevel },
      });
      await securityService.sendSecurityNotification(user, suspiciousEvent);
    }

    // Create device session with enhanced tokens
    const tokens = await createDeviceSession(user.id, deviceInfo, ipAddress);

    // Log successful login
    logAudit(req, {
      userId: user.id,
      action: AuditActions.AUTH_LOGIN,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      metadata: { email: user.email },
      status: 'success',
    });

    return new ApiResponse(200, {
      user: getPublicProfile(user),
      ...tokens,
    }, "Login successful").send(res);

  })
);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get("/me", protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  // Fetch user with categories using relational query if possible
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      categories: true,
      shadowEntities: true,
    },
  });

  if (!user) {
    return next(new AppError(404, "User not found"));
  }

  return new ApiResponse(200, { user: getPublicProfile(user) }, 'Profile retrieved successfully').send(res);
}));

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put(
  "/profile",
  protect,
  [
    body("firstName").optional().trim().isLength({ min: 1, max: 50 }),
    body("lastName").optional().trim().isLength({ min: 1, max: 50 }),
    body("currency")
      .optional()
      .isIn(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR"]),
    body("monthlyIncome").optional().isFloat({ min: 0 }),
    body("monthlyBudget").optional().isFloat({ min: 0 }),
    body("emergencyFund").optional().isFloat({ min: 0 }),
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const updateFields = {};
    const allowedFields = [
      "firstName",
      "lastName",
      "profilePicture",
      "dateOfBirth",
      "phoneNumber",
      "currency",
      "monthlyIncome",
      "monthlyBudget",
      "emergencyFund",
      "preferences",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    updateFields.updatedAt = new Date();

    const [updatedUser] = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, req.user.id))
      .returning();

    // Log profile update
    logAudit(req, {
      userId: req.user.id,
      action: AuditActions.PROFILE_UPDATE,
      resourceType: ResourceTypes.USER,
      resourceId: req.user.id,
      metadata: { updatedFields: Object.keys(updateFields).filter(f => f !== 'updatedAt') },
      status: 'success',
    });

    return new ApiResponse(200, { user: getPublicProfile(updatedUser) }, "Profile updated successfully").send(res);
  })
);

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put(
  "/change-password",
  protect,
  [
    body("currentPassword").notEmpty(),
    body("newPassword").isLength({ min: 6 }),
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { currentPassword, newPassword } = req.body;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id));

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return next(new AppError(400, "Current password is incorrect"));
    }

    // Check if new password is the same as current password
    if (currentPassword === newPassword) {
      return next(new AppError(400, "New password must be different from current password"));
    }

    // Check if password is common
    if (isCommonPassword(newPassword)) {
      return next(new AppError(400, "This password is too common. Please choose a more secure password."));
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword, [user.email, user.firstName, user.lastName]);
    if (!passwordValidation.success) {
      return next(new AppError(400, passwordValidation.message, passwordValidation.feedback));
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Revoke all other sessions for security
    const currentSessionId = req.sessionId;
    const allSessions = await getUserSessions(user.id);

    for (const session of allSessions) {
      if (session.id !== currentSessionId) {
        await revokeDeviceSession(session.id, user.id, 'password_change');
      }
    }

    // Log password change
    logAudit(req, {
      userId: user.id,
      action: AuditActions.AUTH_PASSWORD_CHANGE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      metadata: { sessionsRevoked: allSessions.length - 1 },
      status: 'success',
    });

    return new ApiResponse(200, null, "Password changed successfully. Other sessions have been logged out for security.").send(res);
  })
);

// @route   POST /api/auth/refresh
// @desc    Refresh access token using refresh token
// @access  Public
router.post("/refresh",
  [
    body("refreshToken").notEmpty().withMessage("Refresh token is required"),
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { refreshToken } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const tokens = await refreshAccessToken(refreshToken, ipAddress);

    return new ApiResponse(200, tokens, "Token refreshed successfully").send(res);

  })
);

// @route   POST /api/auth/logout
// @desc    Logout user from current device
// @access  Private
router.post("/logout", protect, asyncHandler(async (req, res, next) => {
  const sessionId = req.sessionId;
  const userId = req.user.id;

  if (sessionId) {
    await revokeDeviceSession(sessionId, userId, 'logout');
  }

  // Log logout
  logAudit(req, {
    userId,
    action: AuditActions.AUTH_LOGOUT,
    resourceType: ResourceTypes.SESSION,
    resourceId: sessionId,
    status: 'success',
  });

  return new ApiResponse(200, null, "Logged out successfully").send(res);

}));

// @route   POST /api/auth/logout-all
// @desc    Logout user from all devices
// @access  Private
router.post("/logout-all", protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const revokedCount = await revokeAllUserSessions(userId, 'logout_all');

  // Log logout from all devices
  logAudit(req, {
    userId,
    action: AuditActions.AUTH_LOGOUT_ALL,
    resourceType: ResourceTypes.SESSION,
    metadata: { devicesLoggedOut: revokedCount },
    status: 'success',
  });

  return new ApiResponse(200, null, `Logged out from ${revokedCount} devices successfully`).send(res);

}));

// @route   GET /api/auth/sessions
// @desc    Get user's active sessions
// @access  Private
router.get("/sessions", protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const sessions = await getUserSessions(userId);

  return new ApiResponse(200, { sessions }, "User's active sessions retrieved successfully").send(res);

}));

// @route   DELETE /api/auth/sessions/:sessionId
// @desc    Revoke specific session
// @access  Private
router.delete("/sessions/:sessionId", protect, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.id;

  await revokeDeviceSession(sessionId, userId, 'manual_revoke');

  // Log session revocation
  logAudit(req, {
    userId,
    action: AuditActions.AUTH_SESSION_REVOKED,
    resourceType: ResourceTypes.SESSION,
    resourceId: sessionId,
    status: 'success',
  });

  res.json({
    success: true,
    message: "Session revoked successfully",
  });
}));

// @rout   POST /api/auth/upload-profile-picture
// @desc    Uplod usr profil pictur
// @acces  Privat
router.post(
  "/upload-profile-picture",
  protect,
  uploadProfilePicture,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const userId = req.user.id;

    // Sav fil using secur storag servic
    const savedFile = await fileStorageService.saveFile(
      req.file.buffer,
      req.file.originalname,
      userId,
      'profile'
    );

    // Updat usr profil with new pictur URL
    const [updatedUser] = await db
      .update(users)
      .set({
        profilePicture: savedFile.url,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    // Log profile picture upload
    logAudit(req, {
      userId,
      action: AuditActions.PROFILE_PICTURE_UPLOAD,
      resourceType: ResourceTypes.USER,
      resourceId: userId,
      metadata: { filename: savedFile.filename, size: savedFile.size },
      status: 'success',
    });

    return new ApiResponse(200, {

      profilePicture: savedFile.url,
      fileInfo: {
        size: savedFile.size,
        filename: savedFile.filename
      }
    }, 'Profile picture uploaded successfully').send(res);
  })
);

// @rout   DELETE /api/auth/delete-profile-picture  
// @desc    Delet usr profil pictur
// @acces  Privat
router.delete(
  "/delete-profile-picture",
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (user.profilePicture) {
      // Extrac fil path from URL
      const fileName = user.profilePicture.split('/').pop();
      const filePath = path.join('uploads', 'profiles', fileName);

      // Delet fil from storag
      await fileStorageService.deleteFile(filePath, userId);
    }

    // Updat usr profil to remov pictur URL
    await db
      .update(users)
      .set({
        profilePicture: '',
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Log profile picture deletion
    logAudit(req, {
      userId,
      action: AuditActions.PROFILE_PICTURE_DELETE,
      resourceType: ResourceTypes.USER,
      resourceId: userId,
      status: 'success',
    });

    return new ApiResponse(200, null, 'Profile picture deleted successfully').send(res);

  })
);

// @route   GET /api/auth/storage-usage
// @desc    Get user storage usage information
// @access  Private
router.get(
  "/storage-usage",
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const usage = await fileStorageService.getUserStorageUsage(userId);

    return new ApiResponse(200, {

      usage: {
        totalSize: usage.totalSize,
        fileCount: usage.fileCount,
        quota: USER_STORAGE_QUOTA,
        remainingSpace: USER_STORAGE_QUOTA - usage.totalSize,
        usagePercentage: Math.round((usage.totalSize / USER_STORAGE_QUOTA) * 100)
      }
    }, 'Storage usage retrieved successfully').send(res);
  })
);

// ========== MFA / 2FA ROUTES ==========

/**
 * @swagger
 * /auth/mfa/setup:
 *   post:
 *     summary: Setup MFA for user account
 *     tags: [Authentication, MFA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA setup initiated
 */
router.post("/mfa/setup", protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (user.mfaEnabled) {
    return next(new AppError(400, "MFA is already enabled for this account"));
  }

  // Generate MFA secret
  const { secret, otpauth_url } = generateMFASecret(user.email);

  // Generate QR code
  const qrCode = await generateQRCode(otpauth_url);

  // Generate recovery codes
  const recoveryCodes = generateRecoveryCodes(10);
  const hashedCodes = hashRecoveryCodes(recoveryCodes);

  // Store secret (temporarily, will be confirmed on verification)
  await db
    .update(users)
    .set({
      mfaSecret: secret,
      mfaRecoveryCodes: hashedCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return new ApiResponse(200, {
    secret,
    qrCode,
    recoveryCodes, // Show these only once
    otpauth_url,
  }, "MFA setup initiated. Scan QR code with authenticator app.").send(res);
}));

/**
 * @swagger
 * /auth/mfa/verify:
 *   post:
 *     summary: Verify and enable MFA
 *     tags: [Authentication, MFA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP token
 *     responses:
 *       200:
 *         description: MFA enabled successfully
 */
router.post("/mfa/verify", protect, [
  body("token").notEmpty().isLength({ min: 6, max: 6 }),
], asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(400, "Validation failed", errors.array()));
  }

  const { token } = req.body;
  const userId = req.user.id;
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (user.mfaEnabled) {
    return next(new AppError(400, "MFA is already enabled"));
  }

  if (!user.mfaSecret) {
    return next(new AppError(400, "MFA setup not initiated. Call /mfa/setup first."));
  }

  // Verify token
  const isValid = verifyTOTP(user.mfaSecret, token);

  if (!isValid) {
    return next(new AppError(401, "Invalid MFA token"));
  }

  // Enable MFA
  await db
    .update(users)
    .set({
      mfaEnabled: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Log security event
  const ipAddress = req.ip || req.connection.remoteAddress;
  const location = await securityService.getIPLocation(ipAddress);
  const securityEvent = await securityService.logSecurityEvent({
    userId: user.id,
    eventType: 'mfa_enabled',
    ipAddress,
    userAgent: req.get('User-Agent'),
    location,
    deviceInfo: getDeviceInfo(req),
    status: 'info',
    details: {},
  });

  // Send notification
  await securityService.sendSecurityNotification(user, securityEvent);

  return new ApiResponse(200, null, "MFA enabled successfully").send(res);
}));

/**
 * @swagger
 * /auth/mfa/disable:
 *   post:
 *     summary: Disable MFA
 *     tags: [Authentication, MFA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - token
 *             properties:
 *               password:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: MFA disabled successfully
 */
router.post("/mfa/disable", protect, [
  body("password").notEmpty(),
  body("token").optional().isLength({ min: 6, max: 6 }),
], asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(400, "Validation failed", errors.array()));
  }

  const { password, token } = req.body;
  const userId = req.user.id;
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user.mfaEnabled) {
    return res.status(400).json({
      success: false,
      message: "MFA is not enabled",
    });
  }

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid password",
    });
  }

  // Verify MFA token if provided
  if (token) {
    const isValid = verifyTOTP(user.mfaSecret, token);
    if (!isValid) {
      // Try recovery code
      const recoveryCodeIndex = verifyRecoveryCode(token, user.mfaRecoveryCodes || []);
      if (recoveryCodeIndex === -1) {
        return next(new AppError(401, "Invalid MFA token or recovery code"));
      }
    }
  }

  // Disable MFA
  await db
    .update(users)
    .set({
      mfaEnabled: false,
      mfaSecret: null,
      mfaRecoveryCodes: [],
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Log security event
  const ipAddress = req.ip || req.connection.remoteAddress;
  const location = await securityService.getIPLocation(ipAddress);
  const securityEvent = await securityService.logSecurityEvent({
    userId: user.id,
    eventType: 'mfa_disabled',
    ipAddress,
    userAgent: req.get('User-Agent'),
    location,
    deviceInfo: getDeviceInfo(req),
    status: 'warning',
    details: {},
  });

  // Send notification
  await securityService.sendSecurityNotification(user, securityEvent);

  return new ApiResponse(200, null, "MFA disabled successfully").send(res);
}));

/**
 * @swagger
 * /auth/mfa/recovery-codes:
 *   get:
 *     summary: Get recovery code status
 *     tags: [Authentication, MFA]
 *     security:
 *       - bearerAuth: []
 */
router.get("/mfa/recovery-codes", protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user.mfaEnabled) {
    return next(new AppError(400, "MFA is not enabled"));
  }

  const status = getRecoveryCodeStatus(user.mfaRecoveryCodes || []);

  return new ApiResponse(200, status, "Recovery code status retrieved").send(res);
}));

/**
 * @swagger
 * /auth/mfa/regenerate-recovery-codes:
 *   post:
 *     summary: Regenerate recovery codes
 *     tags: [Authentication, MFA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 */
router.post("/mfa/regenerate-recovery-codes", protect, [
  body("password").notEmpty(),
], asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(400, "Validation failed", errors.array()));
  }

  const { password } = req.body;
  const userId = req.user.id;
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user.mfaEnabled) {
    return res.status(400).json({
      success: false,
      message: "MFA is not enabled",
    });
  }

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid password",
    });
  }

  // Generate new recovery codes
  const recoveryCodes = generateRecoveryCodes(10);
  const hashedCodes = hashRecoveryCodes(recoveryCodes);

  // Update user
  await db
    .update(users)
    .set({
      mfaRecoveryCodes: hashedCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return new ApiResponse(200, {
    recoveryCodes,
  }, "Recovery codes regenerated. Save these in a safe place.").send(res);
}));

/**
 * @swagger
 * /auth/security/events:
 *   get:
 *     summary: Get security events for user
 *     tags: [Authentication, Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 */
router.get("/security/events", protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const limit = parseInt(req.query.limit) || 50;

  const events = await securityService.getUserSecurityEvents(userId, limit);

  return new ApiResponse(200, {
    events,
    count: events.length,
  }, "Security events retrieved successfully").send(res);
}));

/**
 * @swagger
 * /auth/mfa/status:
 *   get:
 *     summary: Get MFA status for user
 *     tags: [Authentication, MFA]
 *     security:
 *       - bearerAuth: []
 */
router.get("/mfa/status", protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  const recoveryCodeStatus = user.mfaEnabled ?
    getRecoveryCodeStatus(user.mfaRecoveryCodes || []) :
    null;

  return new ApiResponse(200, {
    mfaEnabled: user.mfaEnabled,
    recoveryCodesStatus: recoveryCodeStatus,
  }, "MFA status retrieved").send(res);
}));

export default router;
