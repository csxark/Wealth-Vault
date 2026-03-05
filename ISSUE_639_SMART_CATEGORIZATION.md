# Issue #639: Smart Expense Categorization & Merchant Recognition

## Overview
Implement an AI-powered system for automatic expense categorization and merchant recognition to reduce manual data entry and improve spending insights.

## Problem Statement
- Manual categorization is tedious and time-consuming
- Expenses get miscategorized, breaking budget accuracy
- Recurring expenses from the same merchant aren't recognized
- Budget reports are unreliable due to categorization errors

## Solution Architecture

### 1. Core Features

#### 1.1 AI Merchant Recognition
- **Auto-identify merchants**, retailers, service providers
- Learn from user's historical data
- Build merchant profiles with logos, ratings, categories
- Real-time merchant lookup as users enter expenses

#### 1.2 Smart Auto-Categorization
- **ML-powered category assignment** with 95%+ accuracy
- Uses merchant recognition + expense amount + description
- Learns from user corrections
- Fallback to rule-based system

#### 1.3 Recurring Transaction Detection
- Identify subscriptions, regular bills, recurring payments
- Detect by amount, merchant, and date patterns
- Suggest frequency (daily, weekly, monthly, yearly)
- Flag similar transactions for review

#### 1.4 Category Rule Engine
- User-defined rules: "Venmo to Alice = Friends Entertainment"
- System rules from aggregated patterns
- Priority-based rule matching
- Combine multiple conditions: text, amount, date, merchant

#### 1.5 Receipt OCR Integration
- Extract merchant, amount, date from receipt images
- Validate expense data
- Link receipt to expense for audit trail
- Support multiple receipt formats (PDF, JPG, PNG)

#### 1.6 Merchant Database
- Centralized registry with categories, logos, ratings
- Normalized merchant names for matching
- User-specific merchant mapping
- Industry classification

#### 1.7 User Training Loop
- Learn from user categorization corrections
- Improve ML model accuracy over time
- Track confidence scores
- Provide feedback on corrections

### 2. Database Schema Enhancements

#### Existing Tables to Enhance:
- `merchants` - Add logo, industry, rating fields
- `categorization_rules` - Already exists, may need enhancements
- `categorization_patterns` - Already exists
- `expenses` - Enhance with merchant linking

#### New Tables to Create:
1. **merchant_ratings** - User ratings and feedback for merchants
2. **expense_corrections** - Track user corrections for training
3. **ocr_results** - Store OCR extraction results
4. **category_suggestions** - Log categorization suggestions
5. **merchant_logos** - Store merchant branding info
6. **receipt_metadata** - OCR and receipt processing metadata

### 3. Backend Services

#### 3.1 Enhanced Services (already exist, need improvement)
- `categorizationService.js` - Enhance with ML model training
- `merchantRecognizer.js` - Add logo, rating lookup
- `recurringDetector.js` - Improve pattern detection
- `subscriptionDetectionService.js` - Enhance accuracy

#### 3.2 New Services
- `smartCategorizationEngine.js` - Orchestrate all categorization
- `receiptOCRService.js` - Handle receipt image processing
- `merchantRatingService.js` - Manage merchant ratings/feedback
- `categoryRuleEngine.js` - Execute category rules
- `trainingDataCollector.js` - Collect and store training data
- `confidenceScoreCalculator.js` - Compute confidence metrics

### 4. API Endpoints

#### Smart Categorization
- `POST /api/expenses/smart-categorize` - Auto-categorize expense
- `POST /api/expenses/batch-categorize` - Bulk categorization
- `GET /api/expenses/:id/suggestions` - Get category suggestions
- `POST /api/expenses/:id/correct-category` - Log correction for training

#### Merchant Management
- `GET /api/merchants` - Get merchant list
- `POST /api/merchants/:id/rate` - Rate a merchant
- `GET /api/merchants/:id/details` - Get merchant profile
- `POST /api/merchants/recognize` - Recognize merchant from text
- `POST /api/merchants/autocomplete` - Autocomplete merchant search

#### Category Rules
- `GET /api/category-rules` - List user's rules
- `POST /api/category-rules` - Create custom rule
- `PUT /api/category-rules/:id` - Update rule
- `DELETE /api/category-rules/:id` - Delete rule
- `POST /api/category-rules/test` - Test rule against expenses

#### Recurring Transactions
- `GET /api/recurring-transactions` - List detected recurring
- `POST /api/recurring-transactions/:id/confirm` - Confirm recurring
- `GET /api/recurring-transactions/detect` - Trigger detection
- `POST /api/recurring-transactions/:id/manage` - Configure recurring

#### Receipt Processing
- `POST /api/receipts/upload` - Upload receipt image
- `POST /api/receipts/process` - Process OCR
- `GET /api/receipts/:id` - Get receipt data
- `PUT /api/receipts/:id` - Update receipt extraction
- `DELETE /api/receipts/:id` - Delete receipt

### 5. Frontend Components

#### New Components
- `SmartCategorySelector.tsx` - Auto-suggest category dropdown
- `MerchantRecognitionCard.tsx` - Display recognized merchant
- `ReceiptUploader.tsx` - Receipt image uploader
- `CategoryRuleBuilder.tsx` - Visual rule creation
- `RecurringTransactionManager.tsx` - Manage recurring expenses
- `MerchantSearch.tsx` - Autocomplete merchant search
- `ConfidenceIndicator.tsx` - Show categorization confidence

#### Enhanced Components
- `ExpenseForm.tsx` - Add smart categorization
- `ExpenseList.tsx` - Show merchant recognition
- `Expenses.tsx` - Add bulk categorization

### 6. ML/AI Integration

#### Categorization Model
- Input: Merchant, amount, description, historical patterns
- Output: Category, confidence score
- Training: On user corrections
- Framework: TensorFlow.js with Node.js backend

#### Pattern Recognition
- Detect temporal patterns (monthly, weekly, daily)
- Identify merchant clustering
- Calculate anomaly scores
- Suggest budget alerts

### 7. Implementation Phases

#### Phase 1: Database & Core Services
- [ ] Create database migration for new tables
- [ ] Enhance merchant recognition service
- [ ] Improve categorization service
- [ ] Build category rule engine

#### Phase 2: OCR & Receipt Processing
- [ ] Integrate receipt OCR service
- [ ] Add receipt upload handling
- [ ] Process and validate OCR results

#### Phase 3: API & Backend Logic
- [ ] Create all API endpoints
- [ ] Implement smart categorization engine
- [ ] Add merchant rating system
- [ ] Build training loop

#### Phase 4: Frontend Integration
- [ ] Create UI components
- [ ] Integrate with expense form
- [ ] Add merchant search
- [ ] Build rule builder

#### Phase 5: ML Model & Training
- [ ] Implement model training pipeline
- [ ] Add confidence scoring
- [ ] Create feedback loop
- [ ] Optimize accuracy

#### Phase 6: Testing & Optimization
- [ ] Unit tests for all services
- [ ] Integration tests for API
- [ ] Performance testing
- [ ] Accuracy benchmarking

### 8. Dependencies & Tools

#### Backend
- `@tensorflow/tfjs-node` - ML model training
- `tesseract.js` - OCR for receipts
- `sharp` - Image processing
- `openai` - Optional: GPT for smart extraction

#### Frontend
- `tenstack/react-query` - API calls
- `react-dropzone` - File uploads
- `recharts` - Visualization

### 9. Success Metrics

- Categorization accuracy: 95%+
- Recurring detection success rate: 90%+
- User correction rate reduction: 50%+
- Average time per expense: < 5 seconds
- Merchant recognition coverage: 80%+

### 10. Timeline Estimate

- Phase 1: 3-4 days
- Phase 2: 2-3 days
- Phase 3: 3-4 days
- Phase 4: 3-4 days
- Phase 5: 2-3 days
- Phase 6: 2-3 days
- **Total: 15-21 days**

## Implementation Status

- [ ] Database schema created
- [ ] Backend services implemented
- [ ] API endpoints created
- [ ] Frontend components built
- [ ] Testing completed
- [ ] Documentation updated
- [ ] Code review passed
- [ ] Merged to main

---

**Assignee**: Ayaanshaikh12243  
**Label**: enhancement, ECWoC26  
**Issue**: #639
