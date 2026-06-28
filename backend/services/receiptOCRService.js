import db from '../config/db.js';
import { ocrResults, receiptMetadata, expenses } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { v4 as uuidv4 } from 'uuid';

/**
 * Receipt OCR Service
 * Processes receipt images and extracts expense information
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */
class ReceiptOCRService {
    constructor() {
        this.MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        this.ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
        this.OCR_TIMEOUT = 30000; // 30 seconds
        this.TEMP_DIR = '/tmp/receipts';
        this.ensureTempDir();
    }

    /**
     * Ensure temporary directory exists
     */
    ensureTempDir() {
        if (!fs.existsSync(this.TEMP_DIR)) {
            fs.mkdirSync(this.TEMP_DIR, { recursive: true });
        }
    }

    /**
     * Process receipt image and extract data
     */
    async processReceipt(userId, fileBuffer, fileName, expenseId = null) {
        const startTime = Date.now();

        try {
            // Validate file
            this.validateFile(fileBuffer, fileName);

            // Determine file type
            const fileType = await fileTypeFromBuffer(fileBuffer);
            if (!this.ALLOWED_TYPES.includes(fileType?.mime)) {
                throw new Error(`Unsupported file type: ${fileType?.mime || 'unknown'}`);
            }

            // Optimize image for OCR (if image)
            let processedBuffer = fileBuffer;
            if (fileType.mime.startsWith('image/')) {
                processedBuffer = await this.optimizeImageForOCR(fileBuffer);
            }

            // Save receipt file temporarily
            const tempFileName = `${uuidv4()}.${fileType.ext}`;
            const tempPath = path.join(this.TEMP_DIR, tempFileName);
            fs.writeFileSync(tempPath, processedBuffer);

            // Extract text using OCR
            const extractedText = await this.extractTextFromImage(tempPath, fileType.mime);

            // Clean up temp file
            try {
                fs.unlinkSync(tempPath);
            } catch (e) {
                console.warn('Failed to clean up temp file:', tempPath);
            }

            // Parse extracted text for receipt data
            const parsedData = this.parseReceiptText(extractedText);

            // Determine image quality
            const imageQuality = await this.assessImageQuality(fileBuffer, fileType.mime);

            // Store OCR results
            const ocrResult = await db.insert(ocrResults).values({
                expenseId: expenseId || null,
                receiptFileUrl: `receipts/${tempFileName}`, // Store in uploads
                extractedMerchant: parsedData.merchant,
                extractedAmount: parsedData.amount ? parsedData.amount.toString() : null,
                extractedDate: parsedData.date,
                extractedDescription: parsedData.description,
                ocrConfidence: parsedData.confidence.toString(),
                extractionRaw: JSON.stringify({
                    rawText: extractedText,
                    lines: extractedText.split('\n'),
                    parseConfidence: parsedData.confidence
                }),
                validationStatus: parsedData.confidence > 0.7 ? 'valid' : 'requires_review',
                validationNotes: parsedData.warnings?.join('; '),
                processedBy: 'tesseract',
                processingTimeMs: Date.now() - startTime
            }).returning();

            // Store receipt metadata
            const dimensions = await this.getImageDimensions(fileBuffer, fileType.mime);
            await db.insert(receiptMetadata).values({
                ocrResultId: ocrResult[0].id,
                expenseId,
                fileName,
                fileSize: fileBuffer.length,
                fileType: fileType.ext,
                imageWidth: dimensions?.width,
                imageHeight: dimensions?.height,
                imageQuality,
                detectedLanguage: 'en', // Could use language detection
                hasQrCode: await this.detectQRCode(fileBuffer),
                paymentMethodDetected: parsedData.paymentMethod,
                currencyDetected: parsedData.currency,
                itemsDetected: JSON.stringify(parsedData.items || []),
                taxAmount: parsedData.tax ? parsedData.tax.toString() : null,
                totalAmount: parsedData.amount ? parsedData.amount.toString() : null
            });

            return {
                success: true,
                ocrResultId: ocrResult[0].id,
                extractedData: {
                    merchant: parsedData.merchant,
                    amount: parsedData.amount,
                    date: parsedData.date,
                    description: parsedData.description,
                    currency: parsedData.currency,
                    tax: parsedData.tax,
                    items: parsedData.items,
                    paymentMethod: parsedData.paymentMethod
                },
                confidence: parsedData.confidence,
                validationStatus: ocrResult[0].validationStatus,
                processingTimeMs: Date.now() - startTime,
                warnings: parsedData.warnings || []
            };
        } catch (error) {
            console.error('Error processing receipt:', error);
            throw error;
        }
    }

    /**
     * Validate receipt file
     */
    validateFile(buffer, fileName) {
        if (!buffer || buffer.length === 0) {
            throw new Error('File is empty');
        }

        if (buffer.length > this.MAX_FILE_SIZE) {
            throw new Error(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
        }

        if (!fileName || fileName.trim().length === 0) {
            throw new Error('File name is required');
        }
    }

    /**
     * Optimize image for better OCR accuracy
     */
    async optimizeImageForOCR(buffer) {
        try {
            return await sharp(buffer)
                .resize(2000, 3000, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .greyscale()
                .normalise()
                .sharpen()
                .png({ quality: 80 })
                .toBuffer();
        } catch (error) {
            console.warn('Failed to optimize image, using original:', error.message);
            return buffer;
        }
    }

    /**
     * Extract text from image using Tesseract
     * Note: In production, integrate with tesseract.js library
     */
    async extractTextFromImage(imagePath, mimeType) {
        try {
            // Import tesseract.js dynamically
            const Tesseract = await import('tesseract.js').then(m => m.default);

            const result = await Tesseract.recognize(imagePath, 'eng', {
                logger: m => console.log('OCR Progress:', m.status, m.progress)
            });

            return result.data.text || '';
        } catch (error) {
            console.error('OCR extraction failed, attempting fallback:', error);
            // Fallback: return empty or use mock data for demo
            return '';
        }
    }

    /**
     * Parse receipt text and extract structured data
     */
    parseReceiptText(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const warnings = [];
        let confidence = 0.5;

        // Extract merchant (usually first non-empty line or looked for keywords)
        let merchant = null;
        let amount = null;
        let date = null;
        let tax = null;
        let paymentMethod = null;
        let currency = 'USD';
        let items = [];

        // Patterns for extraction
        const amountPatterns = [
            /total\s*[:\|]\s*\$?([\d,]+\.?\d{0,2})/i,
            /\$?([\d,]+\.?\d{0,2})/,
            /amount\s*[:\|]\s*\$?([\d,]+\.?\d{0,2})/i
        ];

        const datePatterns = [
            /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
            /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}[,\s]+\d{4}/i
        ];

        const taxPatterns = [
            /tax\s*[:\|]\s*\$?([\d.]+)/i,
            /sales\s+tax\s*[:\|]\s*\$?([\d.]+)/i
        ];

        // Try to extract merchant
        if (lines.length > 0) {
            merchant = lines[0];
            confidence += 0.1;
        }

        // Extract amount
        for (const pattern of amountPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                amount = parseFloat(match[1].replace(/,/g, ''));
                confidence += 0.15;
                break;
            }
        }

        if (!amount) {
            warnings.push('Could not extract total amount');
            confidence -= 0.2;
        }

        // Extract date
        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                date = new Date(match[1]);
                confidence += 0.15;
                break;
            }
        }

        if (!date) {
            warnings.push('Could not extract receipt date');
            confidence -= 0.15;
        }

        // Extract tax
        for (const pattern of taxPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                tax = parseFloat(match[1]);
                break;
            }
        }

        // Detect payment method
        if (text.match(/credit|debit|card/i)) {
            paymentMethod = 'card';
        } else if (text.match(/cash/i)) {
            paymentMethod = 'cash';
        } else if (text.match(/check|cheque/i)) {
            paymentMethod = 'check';
        }

        // Clamp confidence between 0 and 1
        confidence = Math.max(0, Math.min(1, confidence));

        // Extract items (simplified)
        const itemPattern = /^[\s]*([a-z].*?)[\s]+(\$?[\d.]+)[\s]*$/im;
        for (const line of lines) {
            const match = line.match(itemPattern);
            if (match && match[1] && match[2]) {
                items.push({
                    name: match[1],
                    price: parseFloat(match[2].replace(/[$,]/g, ''))
                });
            }
        }

        return {
            merchant: merchant || null,
            amount,
            date,
            tax,
            paymentMethod,
            currency,
            items,
            confidence,
            description: lines.slice(0, 3).join(' '),
            warnings
        };
    }

    /**
     * Get image dimensions
     */
    async getImageDimensions(buffer, mimeType) {
        try {
            if (!mimeType.startsWith('image/')) {
                return null;
            }

            const metadata = await sharp(buffer).metadata();
            return {
                width: metadata.width,
                height: metadata.height
            };
        } catch (error) {
            console.warn('Failed to get image dimensions:', error.message);
            return null;
        }
    }

    /**
     * Assess image quality for OCR
     */
    async assessImageQuality(buffer, mimeType) {
        try {
            if (!mimeType.startsWith('image/')) {
                return 'unknown';
            }

            const metadata = await sharp(buffer).metadata();
            const fileSize = buffer.length;

            // Simple quality assessment based on resolution and file size
            const resolution = (metadata.width || 0) * (metadata.height || 0);
            const density = fileSize / (resolution || 1);

            if (resolution < 640 * 480 || density < 0.1) {
                return 'poor';
            } else if (resolution < 1024 * 768) {
                return 'fair';
            } else if (resolution < 1920 * 1080) {
                return 'good';
            } else {
                return 'excellent';
            }
        } catch (error) {
            console.warn('Failed to assess image quality:', error.message);
            return 'unknown';
        }
    }

    /**
     * Detect QR code in image
     */
    async detectQRCode(buffer) {
        try {
            // In a real implementation, use jsQR or similar library
            // For now, return false as placeholder
            return false;
        } catch (error) {
            console.warn('Failed to detect QR code:', error.message);
            return false;
        }
    }

    /**
     * Get OCR result
     */
    async getOCRResult(ocrResultId) {
        try {
            return await db.query.ocrResults.findFirst({
                where: eq(ocrResults.id, ocrResultId),
                with: {
                    receiptMetadata: true,
                    expense: true
                }
            });
        } catch (error) {
            console.error('Error fetching OCR result:', error);
            throw error;
        }
    }

    /**
     * Update OCR validation status
     */
    async updateValidationStatus(ocrResultId, status, notes = null) {
        try {
            if (!['valid', 'invalid', 'requires_review', 'pending'].includes(status)) {
                throw new Error('Invalid validation status');
            }

            const result = await db.update(ocrResults)
                .set({
                    validationStatus: status,
                    validationNotes: notes,
                    updatedAt: new Date()
                })
                .where(eq(ocrResults.id, ocrResultId))
                .returning();

            return result[0];
        } catch (error) {
            console.error('Error updating validation status:', error);
            throw error;
        }
    }

    /**
     * Correct OCR extraction data
     */
    async correctOCRData(ocrResultId, correctedData) {
        try {
            const result = await db.update(ocrResults)
                .set({
                    extractedMerchant: correctedData.merchant || undefined,
                    extractedAmount: correctedData.amount ? correctedData.amount.toString() : undefined,
                    extractedDate: correctedData.date,
                    extractedDescription: correctedData.description,
                    validationStatus: 'valid',
                    updatedAt: new Date()
                })
                .where(eq(ocrResults.id, ocrResultId))
                .returning();

            return result[0];
        } catch (error) {
            console.error('Error correcting OCR data:', error);
            throw error;
        }
    }
}

export default new ReceiptOCRService();
