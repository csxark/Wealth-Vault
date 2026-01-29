import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import { HTTP_STATUS, ERROR_CODES, errorResponse } from './responseWrapper.js';

// Alowed fil typs for uplod
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/webp',
  'image/gif'
];

const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// Fil siz limits in byt
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

// Dangerus fil extensons to blok
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', 
  '.jar', '.php', '.asp', '.jsp', '.sh', '.py', '.rb', '.pl'
];

/**
 * Generat secur fil nam to prevnt path traversl
 */
const generateSecureFileName = (originalName, userId) => {
  const ext = path.extname(originalName).toLowerCase();
  const randomName = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${userId}_${timestamp}_${randomName}${ext}`;
};

/**
 * Validat fil typ using magc numbrs
 */
const validateFileType = async (buffer, allowedTypes) => {
  try {
    const fileType = await fileTypeFromBuffer(buffer);
    
    if (!fileType) {
      return { valid: false, error: 'Unable to determine file type' };
    }
    
    if (!allowedTypes.includes(fileType.mime)) {
      return { valid: false, error: `File type ${fileType.mime} not allowed` };
    }
    
    return { valid: true, mimeType: fileType.mime, extension: fileType.ext };
  } catch (error) {
    return { valid: false, error: 'File type validation failed' };
  }
};

/**
 * Chek for dangerus fil extensons
 */
const checkDangerousExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return DANGEROUS_EXTENSIONS.includes(ext);
};

/**
 * Creat uplod directorys if thy dont exst
 */
const ensureUploadDirectories = async () => {
  const dirs = ['uploads', 'uploads/profiles', 'uploads/documents', 'uploads/temp'];
  
  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
};

/**
 * Multr storag configuraton for secur uplods
 */
const storage = multer.memoryStorage(); // Stor in memry for validaton

/**
 * Fil filtr functon for basi validaton
 */
const fileFilter = (req, file, cb) => {
  // Chek dangerus extensons
  if (checkDangerousExtension(file.originalname)) {
    return cb(new Error('File type not allowed for security reasons'), false);
  }
  
  // Basi MIME typ chek (wil be validatd furtr with magc numbrs)
  const allAllowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
  if (!allAllowedTypes.includes(file.mimetype)) {
    return cb(new Error('Invalid file type'), false);
  }
  
  cb(null, true);
};

/**
 * Creat multr instanc with secur configuraton
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE, // Maxmum siz
    files: 5, // Maxmum numbr of fils
    fields: 10 // Maxmum numbr of non-fil fields
  }
});

/**
 * Midlware to handl profil pictur uplods
 */
export const uploadProfilePicture = (req, res, next) => {
  const uploadSingle = upload.single('profilePicture');
  
  uploadSingle(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return errorResponse(res, 'File too large', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return errorResponse(res, 'Unexpected file field', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
        }
      }
      return errorResponse(res, err.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
    }
    
    if (!req.file) {
      return next();
    }
    
    // Validat fil typ using magc numbrs
    const validation = await validateFileType(req.file.buffer, ALLOWED_IMAGE_TYPES);
    if (!validation.valid) {
      return errorResponse(res, validation.error, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
    }
    
    // Chek fil siz for imags
    if (req.file.size > MAX_IMAGE_SIZE) {
      return errorResponse(res, 'Image file too large (max 5MB)', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
    }
    
    // Ad validatd fil info to requst
    req.file.validatedMimeType = validation.mimeType;
    req.file.validatedExtension = validation.extension;
    
    next();
  });
};

/**
 * Midlware to handl documnt uplods
 */
export const uploadDocument = (req, res, next) => {
  const uploadSingle = upload.single('document');
  
  uploadSingle(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return errorResponse(res, 'File too large', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
        }
      }
      return errorResponse(res, err.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
    }
    
    if (!req.file) {
      return next();
    }
    
    // Validat fil typ
    const validation = await validateFileType(req.file.buffer, ALLOWED_DOCUMENT_TYPES);
    if (!validation.valid) {
      return errorResponse(res, validation.error, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
    }
    
    req.file.validatedMimeType = validation.mimeType;
    req.file.validatedExtension = validation.extension;
    
    next();
  });
};

/**
 * Sav uplodded fil to disk with secur nam
 */
export const saveUploadedFile = async (file, userId, type = 'profile') => {
  await ensureUploadDirectories();
  
  const secureFileName = generateSecureFileName(file.originalname, userId);
  const uploadPath = path.join('uploads', type === 'profile' ? 'profiles' : 'documents', secureFileName);
  
  try {
    await fs.writeFile(uploadPath, file.buffer);
    return {
      filename: secureFileName,
      path: uploadPath,
      size: file.size,
      mimeType: file.validatedMimeType,
      originalName: file.originalname
    };
  } catch (error) {
    throw new Error('Failed to save file');
  }
};

/**
 * Delet fil from disk
 */
export const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error('Failed to delete file:', error);
    return false;
  }
};

/**
 * Initiliz uplod directorys on servr start
 */
export const initializeUploads = async () => {
  await ensureUploadDirectories();
  console.log('✅ Upload directories initialized');
};

export default {
  uploadProfilePicture,
  uploadDocument,
  saveUploadedFile,
  deleteFile,
  initializeUploads,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE
};