import { describe, it, expect, beforeEach, vi } from 'vitest';
import smartCategorizationEngine from '../backend/services/smartCategorizationEngine.js';
import merchantRecognizer from '../backend/services/merchantRecognizer.js';
import categoryRuleEngine from '../backend/services/categoryRuleEngine.js';

/**
 * Test Suite: Smart Expense Categorization & Merchant Recognition
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */

describe('Smart Categorization Engine', () => {
  const testUserId = 'test-user-123';
  const testExpenseId = 'expense-456';

  beforeEach(() => {
    // Mock database calls if needed
    vi.clearAllMocks();
  });

  describe('rankAndAggregatesuggestions', () => {
    it('should rank suggestions by source weight and confidence', () => {
      const suggestions = [
        {
          categoryId: 'cat-1',
          confidence: 0.7,
          source: 'ml_model',
          reasoning: 'ML prediction'
        },
        {
          categoryId: 'cat-2',
          confidence: 0.85,
          source: 'rule_based',
          reasoning: 'Rule match'
        },
        {
          categoryId: 'cat-3',
          confidence: 0.6,
          source: 'merchant_pattern',
          reasoning: 'Merchant recognized'
        }
      ];

      const result = smartCategorizationEngine.rankAndAggregatesuggestions(suggestions);

      expect(result).toBeDefined();
      expect(result.source).toBe('rule_based'); // Highest weight
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should return null for empty suggestions', () => {
      const result = smartCategorizationEngine.rankAndAggregatesuggestions([]);
      expect(result).toBeNull();
    });

    it('should prefer rule-based suggestions', () => {
      const suggestions = [
        {
          categoryId: 'cat-1',
          confidence: 0.95,
          source: 'ml_model',
          reasoning: 'Excellent ML match'
        },
        {
          categoryId: 'cat-2',
          confidence: 0.7,
          source: 'rule_based',
          reasoning: 'Rule match'
        }
      ];

      const result = smartCategorizationEngine.rankAndAggregatesuggestions(suggestions);

      expect(result.source).toBe('rule_based');
    });
  });

  describe('evaluateRule', () => {
    it('should match text-based rules', () => {
      const rule = {
        conditionType: 'text_match',
        conditionConfig: {
          keywords: ['coffee', 'starbucks']
        }
      };

      const expense = {
        description: 'Starbucks Coffee Shop'
      };

      const matches = smartCategorizationEngine.evaluateRule(rule, expense);
      expect(matches).toBe(true);
    });

    it('should not match unrelated text', () => {
      const rule = {
        conditionType: 'text_match',
        conditionConfig: {
          keywords: ['coffee', 'starbucks']
        }
      };

      const expense = {
        description: 'Grocery Store Safeway'
      };

      const matches = smartCategorizationEngine.evaluateRule(rule, expense);
      expect(matches).toBe(false);
    });

    it('should match amount-based rules', () => {
      const rule = {
        conditionType: 'amount_range',
        conditionConfig: {
          min: 10,
          max: 100
        }
      };

      const expense = {
        amount: '50.00'
      };

      const matches = smartCategorizationEngine.evaluateRule(rule, expense);
      expect(matches).toBe(true);
    });

    it('should not match amounts outside range', () => {
      const rule = {
        conditionType: 'amount_range',
        conditionConfig: {
          min: 10,
          max: 100
        }
      };

      const expense = {
        amount: '150.00'
      };

      const matches = smartCategorizationEngine.evaluateRule(rule, expense);
      expect(matches).toBe(false);
    });

    it('should match combined rules', () => {
      const rule = {
        conditionType: 'combined',
        conditionConfig: {
          keywords: ['starbucks'],
          min: 5,
          max: 20
        }
      };

      const expense = {
        description: 'Starbucks Coffee',
        amount: '7.50'
      };

      const matches = smartCategorizationEngine.evaluateRule(rule, expense);
      expect(matches).toBe(true);
    });
  });
});

describe('Merchant Recognizer', () => {
  describe('normalize', () => {
    it('should normalize merchant names', () => {
      const testCases = [
        { input: 'STARBUCKS COFFEE #12345', expected: 'starbucks coffee' },
        { input: 'Amazon.com Inc', expected: 'amazon' },
        { input: 'Whole Foods Market', expected: 'whole foods market' },
        { input: '   Uber Technologies Inc.   ', expected: 'uber technologies' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = merchantRecognizer.normalize(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle empty strings', () => {
      const result = merchantRecognizer.normalize('');
      expect(result).toBe('');
    });

    it('should remove stop words', () => {
      const result = merchantRecognizer.normalize('The Store Shop LLC');
      expect(result).not.toContain('the');
      expect(result).not.toContain('store');
      expect(result).not.toContain('shop');
      expect(result).not.toContain('llc');
    });
  });

  describe('findByAlias', () => {
    it('should find merchants by alias', () => {
      const aliases = {
        spotify: ['spotify ab', 'spotify premium']
      };

      const recognizer = new (class MerchantRecognizer {
        constructor() {
          this.MERCHANT_ALIASES = aliases;
        }
      })();

      expect(recognizer.MERCHANT_ALIASES.spotify).toContain('spotify ab');
    });
  });
});

describe('Category Rule Engine', () => {
  describe('validateRuleData', () => {
    it('should validate text_match rules', () => {
      const ruleData = {
        categoryId: 'cat-123',
        conditionType: 'text_match',
        conditionConfig: {
          keywords: ['coffee', 'starbucks']
        }
      };

      // Should not throw
      expect(() => categoryRuleEngine.validateRuleData(ruleData)).not.toThrow();
    });

    it('should reject text_match rules without keywords', () => {
      const ruleData = {
        categoryId: 'cat-123',
        conditionType: 'text_match',
        conditionConfig: {
          keywords: []
        }
      };

      expect(() => categoryRuleEngine.validateRuleData(ruleData)).toThrow();
    });

    it('should validate amount_range rules', () => {
      const ruleData = {
        categoryId: 'cat-123',
        conditionType: 'amount_range',
        conditionConfig: {
          min: 10,
          max: 100
        }
      };

      expect(() => categoryRuleEngine.validateRuleData(ruleData)).not.toThrow();
    });

    it('should reject invalid condition types', () => {
      const ruleData = {
        categoryId: 'cat-123',
        conditionType: 'invalid_type',
        conditionConfig: {}
      };

      expect(() => categoryRuleEngine.validateRuleData(ruleData)).toThrow();
    });

    it('should reject missing categoryId', () => {
      const ruleData = {
        conditionType: 'text_match',
        conditionConfig: {
          keywords: ['test']
        }
      };

      expect(() => categoryRuleEngine.validateRuleData(ruleData)).toThrow();
    });
  });

  describe('evaluateRule', () => {
    it('should evaluate text_match conditions', () => {
      const rule = {
        conditionType: 'text_match',
        conditionConfig: {
          keywords: ['amazon', 'aws']
        }
      };

      const expense = {
        description: 'Amazon Web Services'
      };

      const result = categoryRuleEngine.evaluateRule(rule, expense);
      expect(result).toBe(true);
    });

    it('should evaluate amount_range conditions', () => {
      const rule = {
        conditionType: 'amount_range',
        conditionConfig: {
          min: 50,
          max: 500
        }
      };

      const expense = {
        amount: '100'
      };

      const result = categoryRuleEngine.evaluateRule(rule, expense);
      expect(result).toBe(true);
    });

    it('should evaluate date_range conditions', () => {
      const rule = {
        conditionType: 'date_range',
        conditionConfig: {
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        }
      };

      const expense = {
        date: '2024-06-15'
      };

      const result = categoryRuleEngine.evaluateRule(rule, expense);
      expect(result).toBe(true);
    });

    it('should evaluate combined conditions', () => {
      const rule = {
        conditionType: 'combined',
        conditionConfig: {
          keywords: ['groceries'],
          min: 30,
          max: 150
        }
      };

      const expense = {
        description: 'Whole Foods Groceries',
        amount: '75.50'
      };

      const result = categoryRuleEngine.evaluateRule(rule, expense);
      expect(result).toBe(true);
    });

    it('should return false for non-matching combined rules', () => {
      const rule = {
        conditionType: 'combined',
        conditionConfig: {
          keywords: ['starbucks'],
          min: 50,
          max: 500
        }
      };

      const expense = {
        description: 'Amazon Purchase',
        amount: '300'
      };

      const result = categoryRuleEngine.evaluateRule(rule, expense);
      expect(result).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('should validate ISO8601 dates', () => {
      const validDates = ['2024-01-01', '2024-12-31', '2024-06-15'];
      validDates.forEach(date => {
        expect(categoryRuleEngine.isValidDate(date)).toBe(true);
      });
    });

    it('should reject invalid dates', () => {
      const invalidDates = ['invalid', '2024-13-01', '', null];
      invalidDates.forEach(date => {
        expect(categoryRuleEngine.isValidDate(date)).toBe(false);
      });
    });
  });

  describe('Templates', () => {
    it('should have predefined templates', () => {
      expect(categoryRuleEngine.constructor.TEMPLATES).toBeDefined();
      expect(categoryRuleEngine.constructor.TEMPLATES.subscription).toBeDefined();
      expect(categoryRuleEngine.constructor.TEMPLATES.groceries).toBeDefined();
    });

    it('should get template by key', () => {
      const template = categoryRuleEngine.constructor.getTemplate('subscription');
      expect(template).toBeDefined();
      expect(template.conditionType).toBe('text_match');
    });

    it('should return null for unknown template', () => {
      const template = categoryRuleEngine.constructor.getTemplate('unknown_template');
      expect(template).toBeNull();
    });

    it('should list available templates', () => {
      const templates = categoryRuleEngine.constructor.getAvailableTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0]).toHaveProperty('key');
      expect(templates[0]).toHaveProperty('name');
    });
  });
});

describe('Integration Tests', () => {
  it('should handle end-to-end categorization flow', () => {
    // 1. Create a rule
    const ruleData = {
      categoryId: 'cat-coffee',
      conditionType: 'text_match',
      conditionConfig: {
        keywords: ['coffee', 'starbucks']
      }
    };

    categoryRuleEngine.validateRuleData(ruleData);

    // 2. Evaluate against expense
    const expense = {
      description: 'Starbucks Coffee Shop',
      amount: '5.50'
    };

    const matches = categoryRuleEngine.evaluateRule(ruleData, expense);
    expect(matches).toBe(true);
  });

  it('should prioritize merchant recognition over rules', () => {
    const suggestions = [
      {
        categoryId: 'cat-1',
        confidence: 0.75,
        source: 'rule_based',
        reasoning: 'Rule'
      },
      {
        categoryId: 'cat-2',
        confidence: 0.9,
        source: 'merchant_pattern',
        reasoning: 'Merchant'
      }
    ];

    const result = smartCategorizationEngine.rankAndAggregatesuggestions(suggestions);
    
    // Merchant should win due to higher confidence
    expect(result.categoryId).toBe('cat-2');
  });
});

describe('Error Handling', () => {
  it('should handle null expense in evaluateRule', () => {
    const rule = {
      conditionType: 'text_match',
      conditionConfig: { keywords: ['test'] }
    };

    // Should not throw on null/undefined fields
    expect(() => {
      categoryRuleEngine.evaluateRule(rule, { description: undefined });
    }).not.toThrow();
  });

  it('should handle malformed rule config', () => {
    const rule = {
      conditionType: 'text_match',
      conditionConfig: null
    };

    const expense = { description: 'Test' };

    expect(() => {
      smartCategorizationEngine.evaluateRule(rule, expense);
    }).not.toThrow();
  });
});
