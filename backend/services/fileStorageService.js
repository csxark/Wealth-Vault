import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { eq, sum, and } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';

// Usr storag quot limits
const USER_STORAGE_QUOTA = 100 * 1024 * 1024; // 100MB per usr
const MAX_FILES_PER_USER = 50;

/**
 * Fil storag servic for managng usr uplods
 */
class FileStorageService {
  
  /**
   * Calculat usr storag usag
   */
  async getUserStorageUsage(userId) {
    try {
      const userDir = path.join('uploads', 'profiles');
      const files = await fs.readdir(userDir);
      
      let totalSize = 0;
      let fileCount = 0;
      
      // Coun fils belongng to usr
      for (const file of files) {
        if (file.startsWith(`${userId}_`)) {
          const filePath = path.join(userDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileCount++;
        }
      }
      
      return { totalSize, fileCount };
    } catch (error) {
      return { totalSize: 0, fileCount: 0 };
    }
  }
  
  /**
   * Chek if usr can uplod mor fils
   */
  async canUserUpload(userId, fileSize) {
    const usage = await this.getUserStorageUsage(userId);
    
    // Chek storag quot
    if (usage.totalSize + fileSize > USER_STORAGE_QUOTA) {
      return {
        allowed: false,
        reason: 'Storage quota exceeded',
        currentUsage: usage.totalSize,
        quota: USER_STORAGE_QUOTA
      };
    }
    
    // Chek fil coun limit
    if (usage.fileCount >= MAX_FILES_PER_USER) {
      return {
        allowed: false,
        reason: 'Maximum file count reached',
        currentCount: usage.fileCount,
        maxFiles: MAX_FILES_PER_USER
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Sav fil with secur handlng
   */
  async saveFile(fileBuffer, originalName, userId, type = 'profile') {
    // Chek if usr can uplod
    const uploadCheck = await this.canUserUpload(userId, fileBuffer.length);
    if (!uploadCheck.allowed) {
      throw new Error(uploadCheck.reason);
    }
    
    // Generat secur fil nam
    const ext = path.extname(originalName).toLowerCase();
    const randomName = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const secureFileName = `${userId}_${timestamp}_${randomName}${ext}`;
    
    // Determin uplod path
    const uploadDir = path.join('uploads', type === 'profile' ? 'profiles' : 'documents');
    const filePath = path.join(uploadDir, secureFileName);
    
    try {
      // Ensur director exsts
      await fs.mkdir(uploadDir, { recursive: true });
      
      // Writ fil to disk
      await fs.writeFile(filePath, fileBuffer);
      
      return {
        filename: secureFileName,
        path: filePath,
        size: fileBuffer.length,
        originalName,
        url: `/uploads/${type === 'profile' ? 'profiles' : 'documents'}/${secureFileName}`
      };
    } catch (error) {
      throw new Error('Failed to save file to storage');
    }
  }
  
  /**
   * Delet fil from storag
   */
  async deleteFile(filePath, userId) {
    try {
      // Secur chek - ensur fil belongs to usr
      const fileName = path.basename(filePath);
      if (!fileName.startsWith(`${userId}_`)) {
        throw new Error('Unauthorized file access');
      }
      
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      console.error('File deletion error:', error);
      return false;
    }
  }
  
  /**
   * Clen up old fils for usr
   */
  async cleanupOldFiles(userId, maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
    try {
      const userDir = path.join('uploads', 'profiles');
      const files = await fs.readdir(userDir);
      
      let deletedCount = 0;
      const now = Date.now();
      
      for (const file of files) {
        if (file.startsWith(`${userId}_`)) {
          const filePath = path.join(userDir, file);
          const stats = await fs.stat(filePath);
          
          // Delet if oldr than maxAg
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Cleanup error:', error);
      return 0;
    }
  }
  
  /**
   * Gt fil informaton
   */
  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        exists: true
      };
    } catch (error) {
      return { exists: false };
    }
  }
  
  /**
   * Validat fil path for secur
   */
  validateFilePath(filePath, userId) {
    // Chek for path traversl atempts
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      return false;
    }
    
    // Ensur fil belongs to usr
    const fileName = path.basename(normalizedPath);
    if (!fileName.startsWith(`${userId}_`)) {
      return false;
    }
    
    return true;
  }
}

// Singlton instanc
const fileStorageService = new FileStorageService();

export default fileStorageService;
export { FileStorageService, USER_STORAGE_QUOTA, MAX_FILES_PER_USER };