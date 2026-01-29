import express from "express";
import { body, param, validationResult } from "express-validator";
import reportService from "../services/reportService.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * /reports/generate-monthly:
 *   post:
 *     summary: Generate monthly financial report PDF
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - year
 *               - month
 *             properties:
 *               year:
 *                 type: integer
 *                 description: Year for the report
 *                 example: 2024
 *               month:
 *                 type: integer
 *                 description: Month for the report (1-12)
 *                 example: 3
 *     responses:
 *       200:
 *         description: PDF report generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error while generating report
 */
router.post(
  "/generate-monthly",
  protect,
  [
    body("year")
      .isInt({ min: 2020, max: new Date().getFullYear() + 1 })
      .withMessage("Year must be between 2020 and next year"),
    body("month")
      .isInt({ min: 1, max: 12 })
      .withMessage("Month must be between 1 and 12"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { year, month } = req.body;

      // Generate the PDF report
      const pdfBuffer = await reportService.generateMonthlyReport(
        req.user.id,
        year,
        month
      );

      // Set response headers for PDF download
      const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="wealth-vault-report-${monthName.replace(' ', '-').toLowerCase()}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // Send the PDF buffer
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Generate monthly report error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while generating monthly report",
      });
    }
  }
);

export default router;
