/**
 * Receipt OCR and Processing Service
 * Uses Google Cloud Vision API for OCR, with Tesseract.js support
 * Parses transaction details and auto-categorizes expenses
 */

import vision from '@google-cloud/vision';
import categorizationService from './categorizationService.js';

/**
 * Enhanced Receipt Service with multiple OCR engine support
 */
class ReceiptService {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  /**
   * Initialize Google Cloud Vision client
   */
  initializeClient() {
    try {
      // Initialize with credentials from environment variables
      this.client = new vision.ImageAnnotatorClient({
        keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });
    } catch (error) {
      console.error('Error initializing Google Cloud Vision client:', error);
      // Fallback to mock processing for development
      this.client = null;
    }
  }

  /**
   * Extract text from image using Google Cloud Vision API
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<string>} - Extracted text
   */
  async extractText(imageBuffer) {
    try {
      if (!this.client) {
        // Mock OCR for development/testing
        return this.mockExtractText();
      }

      const [result] = await this.client.textDetection(imageBuffer);
      const detections = result.textAnnotations;

      if (detections && detections.length > 0) {
        return detections[0].description;
      }

      return '';
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw new Error('Failed to process receipt image');
    }
  }

  /**
   * Extract text using Cloud Vision API with advanced options
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} - Full OCR result with confidence scores
   */
  async extractTextAdvanced(imageBuffer) {
    try {
      if (!this.client) {
        // Return mock data for development
        return {
          fullText: this.mockExtractText(),
          words: [],
          confidence: 0.8,
          isMock: true
        };
      }

      const [result] = await this.client.textDetection(imageBuffer);
      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        return {
          fullText: '',
          words: [],
          confidence: 0
        };
      }

      // Extract all text
      const fullText = detections[0].description;

      // Extract individual words with bounding boxes
      const words = detections.slice(1).map(detection => ({
        text: detection.description,
        boundingBox: detection.boundingPoly
      }));

      // Calculate average confidence (approximate based on API response)
      const confidence = result.fullTextAnnotation?.pages?.[0]?.confidence || 0.9;

      return {
        fullText,
        words,
        confidence,
        isMock: false
      };
    } catch (error) {
      console.error('Error in advanced text extraction:', error);
      throw new Error('Failed to process receipt image');
    }
  }

  /**
   * Process text already extracted by client-side Tesseract.js
   * @param {string} text - OCR extracted text
   * @param {Object} tesseractData - Additional Tesseract.js data (confidence, words)
   * @returns {Promise<Object>} - Processed receipt data
   */
  async processClientSideOCR(text, tesseractData = {}) {
    try {
      // Parse the extracted text
      const parsedData = this.parseReceiptText(text);

      // Add confidence from Tesseract if available
      if (tesseractData.confidence) {
        parsedData.ocrConfidence = tesseractData.confidence;
      }

      // Add word-level data if available
      if (tesseractData.words) {
        parsedData.ocrWords = tesseractData.words;
      }

      return parsedData;
    } catch (error) {
      console.error('Error processing client-side OCR:', error);
      throw error;
    }
  }

  /**
   * Mock text extraction for development
   * @returns {string} - Mock receipt text
   */
  mockExtractText() {
    return `
STARBUCKS
123 Main St
Date: 2024-01-15
Time: 2:30 PM
Item: Grande Latte $5.50
Item: Blueberry Muffin $3.25
Tax: $0.75
Total: $9.50
Thank you for visiting!
    `.trim();
  }

  /**
   * Parse receipt text to extract transaction details
   * Enhanced parsing with multiple patterns for better accuracy
   * @param {string} text - OCR extracted text
   * @returns {Object} - Parsed transaction data
   */
  parseReceiptText(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    let merchant = '';
    let amount = 0;
    let date = null;
    let description = '';
    let items = [];
    let tax = 0;
    let subtotal = 0;
    let paymentMethod = '';

    // Extract merchant (usually first line or prominent text)
    // Look for store name patterns
    for (const line of lines.slice(0, 5)) {
      // Skip lines that look like addresses or dates
      if (!/^\d+\s+\w/.test(line) && !/^\d{1,2}[\/\-]/.test(line) && line.length > 2) {
        merchant = line.toUpperCase();
        break;
      }
    }

    // Enhanced amount extraction - look for multiple patterns
    const amountPatterns = [
      /(?:total|amount|sum|grand total|balance due|due)[\s:]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /(?:total|amount)[\s:]*Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      /\$\s*(\d+(?:,\d{3})*(?:\.\d{2}))/,
      /Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2}))/
    ];

    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        amount = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Extract tax amount
    const taxMatch = text.match(/(?:tax|gst|vat)[\s:]*\$?Rs\.?\s*(\d+(?:\.\d{2})?)/i);
    if (taxMatch) {
      tax = parseFloat(taxMatch[1]);
    }

    // Extract subtotal
    const subtotalMatch = text.match(/(?:subtotal|sub-total)[\s:]*\$?Rs\.?\s*(\d+(?:\.\d{2})?)/i);
    if (subtotalMatch) {
      subtotal = parseFloat(subtotalMatch[1]);
    }

    // Extract date - multiple format support
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,  // YYYY-MM-DD
      /(\d{2}\/\d{2}\/\d{4})/,  // MM/DD/YYYY or DD/MM/YYYY
      /(\d{2}-\d{2}-\d{4})/,  // DD-MM-YYYY
      /(?:date)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          date = new Date(match[1]);
          if (!isNaN(date.getTime())) {
            break;
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }

    // Extract items from receipt
    items = this.extractItems(text);

    // Extract payment method
    const paymentPatterns = [
      /(?:payment method|paid by|pay)[\s:]*(\w+)/i,
      /\b(cash|card|credit|debit|visa|mastercard|amex|upi|netbanking)\b/i
    ];

    for (const pattern of paymentPatterns) {
      const match = text.match(pattern);
      if (match) {
        paymentMethod = match[1].toLowerCase();
        break;
      }
    }

    // Build description from merchant and items
    description = merchant || 'Receipt Expense';

    return {
      merchant: merchant || 'Unknown Merchant',
      amount: amount || 0,
      date: date || new Date(),
      description,
      items,
      tax: tax || 0,
      subtotal: subtotal || 0,
      paymentMethod,
      rawText: text
    };
  }

  /**
   * Extract individual items from receipt text
   * @param {string} text - Receipt text
   * @returns {Array} - Array of items
   */
  extractItems(text) {
    const items = [];
    const lines = text.split('\n');

    // Pattern for line items: name + price
    const itemPattern = /^(.+?)\s+\$?Rs\.?\s*(\d+(?:\.\d{2})?)\s*$/;

    for (const line of lines) {
      const match = line.match(itemPattern);
      if (match && match[1].length > 2) {
        const itemName = match[1].trim();
        const itemPrice = parseFloat(match[2]);

        // Skip if it looks like a total or tax line
        if (!/^(total|subtotal|tax|gst|vat|balance)/i.test(itemName)) {
          items.push({
            name: itemName,
            price: itemPrice
          });
        }
      }
    }

    return items;
  }

  /**
   * Process receipt image and extract transaction data
   * @param {Buffer} imageBuffer - Receipt image buffer
   * @param {string} userId - User ID for categorization
   * @returns {Promise<Object>} - Processed receipt data with categorization
   */
  async processReceipt(imageBuffer, userId) {
    try {
      // Extract text from image
      const extractedText = await this.extractText(imageBuffer);

      // Parse transaction details
      const parsedData = this.parseReceiptText(extractedText);

      // Auto-categorize based on merchant and description
      const categorizationResult = await this.autoCategorize(parsedData, userId);

      return {
        ...parsedData,
        suggestedCategory: categorizationResult.categoryName,
        categoryId: categorizationResult.categoryId,
        confidence: categorizationResult.confidence,
        rawText: extractedText
      };
    } catch (error) {
      console.error('Error processing receipt:', error);
      throw error;
    }
  }

  /**
   * Process receipt with advanced OCR (cloud Vision API)
   * @param {Buffer} imageBuffer - Receipt image buffer
   * @param {string} userId - User ID for categorization
   * @returns {Promise<Object>} - Full processed receipt data
   */
  async processReceiptAdvanced(imageBuffer, userId) {
    try {
      // Get advanced OCR result
      const ocrResult = await this.extractTextAdvanced(imageBuffer);

      // Parse transaction details
      const parsedData = this.parseReceiptText(ocrResult.fullText);

      // Add OCR metadata
      parsedData.ocrConfidence = ocrResult.confidence;
      parsedData.ocrWords = ocrResult.words;
      parsedData.isMockOCR = ocrResult.isMock;

      // Auto-categorize based on merchant and description
      const categorizationResult = await this.autoCategorize(parsedData, userId);

      return {
        ...parsedData,
        suggestedCategory: categorizationResult.categoryName,
        categoryId: categorizationResult.categoryId,
        confidence: categorizationResult.confidence,
        rawText: ocrResult.fullText
      };
    } catch (error) {
      console.error('Error processing receipt (advanced):', error);
      throw error;
    }
  }

  /**
   * Auto-categorize expense based on parsed data
   * @param {Object} parsedData - Parsed receipt data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Categorization result
   */
  async autoCategorize(parsedData, userId) {
    try {
      // Create expense-like object for categorization
      const expenseForCategorization = {
        userId,
        description: parsedData.description,
        amount: parsedData.amount,
        subcategory: parsedData.merchant
      };

      // Use existing categorization service
      const result = await categorizationService.predictCategory(expenseForCategorization);

      return result;
    } catch (error) {
      console.error('Error auto-categorizing receipt:', error);
      return { categoryId: null, confidence: 0, categoryName: null };
    }
  }

  /**
   * Validate image format and size
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {boolean} - Is valid
   */
  validateImage(imageBuffer) {
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (imageBuffer.length > maxSize) {
      return false;
    }

    // Check if it's a valid image (basic check)
    // For buffer, we can't easily check MIME type without additional libraries
    // This is a basic implementation

    return true;
  }

  /**
   * Validate base64 image string
   * @param {string} base64String - Base64 encoded image
   * @returns {Object} - Validation result with buffer
   */
  validateBase64Image(base64String) {
    try {
      // Check for valid base64 image prefix
      const validPrefixes = ['data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/jpg;base64,'];
      let base64Data = base64String;
      
      for (const prefix of validPrefixes) {
        if (base64String.startsWith(prefix)) {
          base64Data = base64String.substring(prefix.length);
          break;
        }
      }

      // Decode and check size
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const isValid = this.validateImage(imageBuffer);

      return {
        isValid,
        buffer: imageBuffer,
        size: imageBuffer.length,
        error: isValid ? null : 'Image size exceeds maximum limit of 10MB'
      };
    } catch (error) {
      return {
        isValid: false,
        buffer: null,
        size: 0,
        error: 'Invalid base64 image data'
      };
    }
  }
}

// Export singleton instance
const receiptService = new ReceiptService();
export default receiptService;

