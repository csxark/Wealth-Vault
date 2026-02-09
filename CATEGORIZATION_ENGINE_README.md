# Advanced Transaction Categorization Engine

## Overview
The Advanced Transaction Categorization Engine is an intelligent system designed to automatically classify financial transactions with high accuracy. It leverages user-defined rules, merchant recognition patterns, and machine learning-derived heuristics to minimize manual accounting effort.

## Core Components

### 1. Rule Engine 🛠️
Allows users to define specific logic for categorization:
- **Text Matching**: Match descriptions using `equals`, `contains`, or `starts_with`.
- **Amount Filtering**: Apply rules only within specific monetary ranges.
- **Priority System**: Higher priority rules take precedence over general patterns.
- **Combined Logic**: Link multiple criteria (e.g., "Contains 'Starbucks' AND Amount > $50").

### 2. Merchant Recognizer 🏢
Normalizes messy transaction strings to identify the underlying merchant:
- **Normalization**: Strips out store IDs, numbers, and common stop words (Inc, LLC, etc.).
- **Fuzzy Matching**: Matches varied descriptions to a single merchant entity.
- **Industry Tracking**: Automatically associates merchants with specific industries.
- **Verification**: Labels known, trusted merchants for higher confidence.

### 3. Pattern Matching (ML-Light) 🧠
Automatically learns from user behavior:
- **Confidence Scoring**: Assigns weights to patterns based on frequency and user feedback.
- **Fuzzy Text Matching**: Uses SQL-based pattern matching for similar transaction strings.
- **Self-Training**: Background jobs analyze historical data to discover new recurring patterns.

## Database Schema

### Merchants Table
Stores verified and learned merchant profiles.
```javascript
export const merchants = pgTable('merchants', {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    defaultCategoryId: uuid('default_category_id'),
    isVerified: boolean('is_verified').default(false)
});
```

### Categorization Rules Table
Stores explicit logic defined by the user.
```javascript
export const categorizationRules = pgTable('categorization_rules', {
    id: uuid('id').primaryKey(),
    categoryId: uuid('category_id').notNull(),
    conditionType: text('condition_type').notNull(), // text_match, amount_range, combined
    conditionConfig: jsonb('condition_config').notNull(),
    priority: integer('priority').default(0)
});
```

### Categorization Patterns Table
System-generated patterns learned from transaction history.
```javascript
export const categorizationPatterns = pgTable('categorization_patterns', {
    id: uuid('id').primaryKey(),
    pattern: text('pattern').notNull(),
    categoryId: uuid('category_id').notNull(),
    confidence: doublePrecision('confidence').default(0.0)
});
```

## API Endpoints

### Get Suggestion
`POST /api/categorization/suggest`
- **Request**: `{ "description": "Starbucks Store #123", "amount": 15.50 }`
- **Response**: Returns the suggested `categoryId`, confidence score, and the method used (rule, merchant, or pattern).

### Learn/Train
`POST /api/categorization/learn`
- **Request**: `{ "transactionId": "<uuid>", "categoryId": "<uuid>" }`
- **Effect**: Updates patterns and merchant associations based on user confirmation.

### Bulk Refresh
`POST /api/categorization/bulk-refresh`
- **Effect**: Re-evaluates all existing transactions against the latest rules and patterns.

## Background Jobs

### Categorization Trainer
Runs weekly to:
1. Scan historical transactions for frequent description fragments.
2. Identify high-confidence category associations.
3. Update or create new `categorizationPatterns`.

## Best Practices
1. **Be Specific**: Create rules for merchants you visit frequently with varied descriptions.
2. **Review Low Confidence**: Periodically review transactions categorized with < 0.7 confidence.
3. **Verify Merchants**: Use the Verified Merchants feature for common retail chains to ensure 100% accuracy.

---
**Version**: 1.0.0  
**Issue**: #299
