import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { protect } from './auth.js';
import fileStorageService from '../services/fileStorageService.js';
import { HTTP_STATUS, ERROR_CODES, errorResponse } from './responseWrapper.js';

/**
 * Secure static file server for uploaded files
 * Ensures users can only access their own files
 */
export const secureFileServer = (req, res, next) => {
  // Check if user is authenticated
  if (!req.user) {
    return errorResponse(
      res,
      'Authentication required to access files',
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.AUTHENTICATION_ERROR
    );
  }
  
  const userId = req.user.id;
  const requestedFile = req.params.filename;
  
  // Validate file path for security
  if (!fileStorageService.validateFilePath(requestedFile, userId)) {
    return errorResponse(
      res,
      'Access denied to requested file',
      HTTP_STATUS.FORBIDDEN,
      ERROR_CODES.AUTHORIZATION_ERROR
    );
  }
  
  // Construct full file path
  const fileType = req.params.type; // 'profiles' or 'documents'
  const filePath = path.join('uploads', fileType, requestedFile);
  
  // Check if file exists
  fs.access(filePath)
    .then(() => {
      // Set appropriate headers for cache
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Set MIME type based on file extension
      const ext = path.extname(requestedFile).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', 
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf'
      };
      
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      
      // Serve file
      res.sendFile(path.resolve(filePath));
    })
    .catch(() => {
      return errorResponse(
        res,
        'File not found',
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND
      );
    });
};

/**
 * Create secure file server route
 */
export const createFileServerRoute = () => {
  const router = express.Router();
  
  // Protected route for accessing uploaded files
  router.get('/:type/:filename', protect, secureFileServer);
  
  return router;
};

export default { secureFileServer, createFileServerRoute };
