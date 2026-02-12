import vision from '@google-cloud/vision';
import categorizationService from './categorizationService.js';

/**
 * Receipt OCR and Processing Service
 * Uses Google Cloud Vision API to extract text from receipt images
 * Parses transaction details and auto-categorizes expenses
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
   * Extract text from image using OCR
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

      if (detections.length > 0) {
        return detections[0].description;
      }

      return '';
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw new Error('Failed to process receipt image');
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
Tax: $0.45
Total: $5.95
Thank you for visiting!
    `.trim();
  }

  /**
   * Parse receipt text to extract transaction details
   * @param {string} text - OCR extracted text
   * @returns {Object} - Parsed transaction data
   */
  parseReceiptText(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    let merchant = '';
    let amount = 0;
    let date = null;
    let description = '';

    // Extract merchant (usually first line or prominent text)
    if (lines.length > 0) {
      merchant = lines[0].toUpperCase();
    }

    // Extract amount (look for patterns like $X.XX or Total: $X.XX)
    const amountRegex = /(?:total|amount|sum)[\s:]*\$?(\d+(?:\.\d{2})?)/i;
    const amountMatch = text.match(amountRegex);
    if (amountMatch) {
      amount = parseFloat(amountMatch[1]);
    }

    // Extract date (look for date patterns)
    const dateRegex = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4})/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
      date = new Date(dateMatch[1]);
    }

    // Build description from merchant and items
    description = merchant || 'Receipt Expense';

    return {
      merchant: merchant || 'Unknown Merchant',
      amount: amount || 0,
      date: date || new Date(),
      description,
      rawText: text
    };
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
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    // For buffer, we can't easily check MIME type without additional libraries
    // This is a basic implementation

    return true;
  }
}

// Export singleton instance
const receiptService = new ReceiptService();
export default receiptService;
