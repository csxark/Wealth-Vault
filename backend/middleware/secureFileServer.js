import express from "express";
import path from "path";
import fs from "fs/promises";
import { protect } from "./auth.js";
import fileStorageService from "../services/fileStorageService.js";
import { HTTP_STATUS, ERROR_CODES, errorResponse } from "./responseWrapper.js";

/**
 * Secure static file server for uploaded files
 * Ensures users can only access their own files
 */
export const secureFileServer = async (req, res) => {
  if (!req.user) {
    return errorResponse(
      res,
      "Authentication required to access files",
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.AUTHENTICATION_ERROR,
    );
  }

  const userId = req.user.id;
  const requestedFile = req.params.filename;
  const fileType = req.params.type;

  if (!fileStorageService.validateFilePath(requestedFile, userId)) {
    return errorResponse(
      res,
      "Access denied to requested file",
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.AUTHORIZATION_ERROR,
    );
  }

  const filePath = path.join("uploads", fileType, requestedFile);

  try {
    await fs.access(filePath);

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const ext = path.extname(requestedFile).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };

    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");

    return res.sendFile(path.resolve(filePath));
  } catch {
    return errorResponse(
      res,
      "File not found",
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
    );
  }
};

/**
 * Create secure file server route
 */
export const createFileServerRoute = () => {
  const router = express.Router();
  router.get("/:type/:filename", protect, secureFileServer);
  return router;
};

export default { secureFileServer, createFileServerRoute };
