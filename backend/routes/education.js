import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc, asc, gte, lt, inArray } from "drizzle-orm";
import db from "../config/db.js";
import {
  educationContent,
  educationQuizzes,
  userEducationProgress,
  quizAttempts,
  financialHealthScores
} from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import educationService from "../services/educationService.js";

const router = express.Router();

/**
 * @swagger
 * /education/content:
 *   get:
 *     summary: Get personalized education content recommendations
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [budgeting, saving, investing, debt, credit, general]
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of recommended education content
 */
router.get("/content", protect, async (req, res) => {
  try {
    const { category, difficulty, limit = 10 } = req.query;

    const recommendations = await educationService.getPersonalizedRecommendations(req.user.id, {
      category,
      difficulty,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: { content: recommendations }
    });
  } catch (error) {
    console.error("Get education content error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching education content"
    });
  }
});

/**
 * @swagger
 * /education/content/{id}:
 *   get:
 *     summary: Get specific education content by ID
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Education content details
 */
router.get("/content/:id", protect, async (req, res) => {
  try {
    const content = await db.query.educationContent.findFirst({
      where: eq(educationContent.id, req.params.id)
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Education content not found"
      });
    }

    // Update progress to mark as accessed
    await educationService.updateProgress(req.user.id, req.params.id, {
      status: 'in_progress',
      lastAccessedAt: new Date()
    });

    res.json({
      success: true,
      data: { content }
    });
  } catch (error) {
    console.error("Get education content by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching education content"
    });
  }
});

/**
 * @swagger
 * /education/progress:
 *   get:
 *     summary: Get user's education progress
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's education progress
 */
router.get("/progress", protect, async (req, res) => {
  try {
    const progress = await educationService.getUserEducationProgress(req.user.id);

    res.json({
      success: true,
      data: { progress }
    });
  } catch (error) {
    console.error("Get education progress error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching education progress"
    });
  }
});

/**
 * @swagger
 * /education/progress/{contentId}:
 *   post:
 *     summary: Update user's progress for specific content
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progress:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               timeSpent:
 *                 type: number
 *               completed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Progress updated successfully
 */
router.post("/progress/:contentId", protect, [
  body("progress").optional().isFloat({ min: 0, max: 100 }),
  body("timeSpent").optional().isInt({ min: 0 }),
  body("completed").optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { progress, timeSpent, completed } = req.body;

    const updateData = {};
    if (progress !== undefined) updateData.progress = progress;
    if (timeSpent !== undefined) updateData.timeSpent = timeSpent;
    if (completed !== undefined) {
      updateData.status = completed ? 'completed' : 'in_progress';
      if (completed) updateData.completedAt = new Date();
    }

    await educationService.updateProgress(req.user.id, req.params.contentId, updateData);

    res.json({
      success: true,
      message: "Progress updated successfully"
    });
  } catch (error) {
    console.error("Update progress error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating progress"
    });
  }
});

/**
 * @swagger
 * /education/quizzes/{contentId}:
 *   get:
 *     summary: Get quiz for specific content
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Quiz details
 */
router.get("/quizzes/:contentId", protect, async (req, res) => {
  try {
    const quiz = await db.query.educationQuizzes.findFirst({
      where: eq(educationQuizzes.contentId, req.params.contentId)
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found for this content"
      });
    }

    // Check if user has already passed this quiz
    const [existingAttempt] = await db
      .select()
      .from(quizAttempts)
      .where(and(
        eq(quizAttempts.userId, req.user.id),
        eq(quizAttempts.quizId, quiz.id),
        eq(quizAttempts.passed, true)
      ));

    res.json({
      success: true,
      data: {
        quiz: {
          ...quiz,
          alreadyPassed: !!existingAttempt
        }
      }
    });
  } catch (error) {
    console.error("Get quiz error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching quiz"
    });
  }
});

/**
 * @swagger
 * /education/quizzes/{quizId}/attempt:
 *   post:
 *     summary: Submit quiz attempt
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: object
 *                 description: Object with question indices as keys and answer indices as values
 *               timeTaken:
 *                 type: number
 *                 description: Time taken in minutes
 *     responses:
 *       200:
 *         description: Quiz attempt submitted successfully
 */
router.post("/quizzes/:quizId/attempt", protect, [
  body("answers").isObject(),
  body("timeTaken").optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { answers, timeTaken } = req.body;

    const result = await educationService.submitQuizAttempt(req.user.id, req.params.quizId, {
      answers,
      timeTaken
    });

    res.json({
      success: true,
      message: "Quiz attempt submitted successfully",
      data: { result }
    });
  } catch (error) {
    console.error("Submit quiz attempt error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while submitting quiz attempt"
    });
  }
});

/**
 * @swagger
 * /education/quizzes/{quizId}/attempts:
 *   get:
 *     summary: Get user's attempts for a quiz
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of quiz attempts
 */
router.get("/quizzes/:quizId/attempts", protect, async (req, res) => {
  try {
    const attempts = await db
      .select()
      .from(quizAttempts)
      .where(and(
        eq(quizAttempts.userId, req.user.id),
        eq(quizAttempts.quizId, req.params.quizId)
      ))
      .orderBy(desc(quizAttempts.createdAt));

    res.json({
      success: true,
      data: { attempts }
    });
  } catch (error) {
    console.error("Get quiz attempts error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching quiz attempts"
    });
  }
});

/**
 * @swagger
 * /education/stats:
 *   get:
 *     summary: Get user's education statistics
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Education statistics
 */
router.get("/stats", protect, async (req, res) => {
  try {
    const stats = await educationService.getEducationStats(req.user.id);

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error("Get education stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching education statistics"
    });
  }
});

export default router;
