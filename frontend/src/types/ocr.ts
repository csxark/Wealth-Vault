/**
 * OCR and Receipt Scanning Type Definitions
 * Advanced Receipt Scanning with OCR support using Tesseract.js
 */

// OCR Processing Status
export type OCRStatus = 'idle' | 'processing' | 'success' | 'error';

// Tesseract.js worker result
export interface TesseractResult {
  text: string;
  confidence: number;
  words?: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}

// Parsed receipt data from OCR
export interface ParsedReceiptData {
  merchant: string;
  amount: number;
  date: string | Date;
  description: string;
  items: Array<{
    name: string;
    price: number;
    quantity?: number;
  }>;
  tax: number;
  subtotal: number;
  paymentMethod: string;
  rawText: string;
  suggestedCategory?: string;
  categoryId?: string;
  confidence?: number;
}

// Receipt scanner state
export interface ReceiptScannerState {
  status: OCRStatus;
  progress: number;
  error: string | null;
  imagePreview: string | null;
  parsedData: ParsedReceiptData | null;
}

// API response for receipt processing
export interface ReceiptProcessResponse {
  success: boolean;
  data: ParsedReceiptData;
  message?: string;
}

// Form data with OCR
export interface ExpenseFormDataWithOCR {
  description: string;
  amount: string;
  currency: string;
  categoryId: string;
  date: string;
  paymentMethod: string;
  location: string;
  tags: string;
  notes: string;
  isRecurring: boolean;
  // OCR specific fields
  ocrData?: ParsedReceiptData;
  receiptImage?: string;
}

