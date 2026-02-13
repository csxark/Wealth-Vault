import express from "express";
import { eq, and, desc } from "drizzle-orm";
import path from "path";
import fs from "fs";
import db from "../config/db.js";
import { reports } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { AppError } from "../utils/AppError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const router = express.Router();

/**
 * @swagger
 * /reports:
 *   get:
 *     summary: Get all reports for the authenticated user
 *     tags: [Reports]
 */
router.get("/", protect, asyncHandler(async (req, res, next) => {
  const userReports = await db
    .select()
    .from(reports)
    .where(eq(reports.userId, req.user.id))
    .orderBy(desc(reports.createdAt));

  return new ApiResponse(200, userReports, "Reports retrieved successfully").send(res);
}));

/**
 * @swagger
 * /reports/:reportId:
 *   get:
 *     summary: Download a specific report
 *     tags: [Reports]
 */
router.get("/:reportId", protect, asyncHandler(async (req, res, next) => {
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, req.params.reportId), eq(reports.userId, req.user.id)));

  if (!report) {
    return next(new AppError(404, "Report not found"));
  }

  const filePath = path.join(process.cwd(), report.url.replace(/^\//, ''));

  if (!fs.existsSync(filePath)) {
    return next(new AppError(404, "Report file not found on server"));
  }

  res.download(filePath, report.name + (report.format === 'pdf' ? '.pdf' : '.xlsx'));
}));

export default router;
