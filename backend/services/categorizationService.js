import * as tf from '@tensorflow/tfjs-node';
import { eq, and, gte, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses, categories } from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';

/**
 * ML-based Expense Categorization Service
 * Uses TensorFlow.js to automatically categorize expenses based on merchant names, amounts, and descriptions
 */

class CategorizationService {
  constructor() {
    this.model = null;
    this.labelEncoder = new Map();
    this.reverseLabelEncoder = new Map();
    this.isModelLoaded = false;
    this.trainingData = [];
  }

  /**
   * Preprocess text for ML model
   * @param {string} text - Text to preprocess
   * @returns {string} - Preprocessed text
   */
  preprocessText(text) {
    if (!text) return '';

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .split(' ')
      .filter(word => word.length > 2) // Remove short words
      .join(' ');
  }

  /**
   * Create feature vector from expense data
   * @param {Object} expense - Expense object
   * @returns {Array} - Feature vector
   */
  createFeatureVector(expense) {
    const description = this.preprocessText(expense.description || '');
    const amount = parseFloat(expense.amount) || 0;
    const subcategory = this.preprocessText(expense.subcategory || '');

    // Simple bag-of-words features (in production, use word embeddings)
    const commonWords = [
      'starbucks', 'coffee', 'restaurant', 'food', 'grocery', 'gas', 'fuel',
      'amazon', 'shopping', 'entertainment', 'movie', 'uber', 'taxi', 'travel',
      'medical', 'doctor', 'pharmacy', 'insurance', 'rent', 'utilities', 'electric',
      'internet', 'phone', 'subscription', 'netflix', 'spotify', 'gym', 'fitness'
    ];

    const features = commonWords.map(word =>
      (description + ' ' + subcategory).includes(word) ? 1 : 0
    );

    // Add amount-based features
    features.push(Math.log(Math.abs(amount) + 1)); // Log-transformed amount
    features.push(amount > 0 ? 1 : 0); // Is positive amount
    features.push(amount > 100 ? 1 : 0); // Is large amount

    return features;
  }

  /**
   * Load training data from user's historical expenses
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Training data
   */
  async loadTrainingData(userId) {
    try {
      // Get expenses with categories from the last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const userExpenses = await db
        .select({
          id: expenses.id,
          description: expenses.description,
          subcategory: expenses.subcategory,
          amount: expenses.amount,
          categoryId: expenses.categoryId,
          categoryName: categories.name
        })
        .from(expenses)
        .leftJoin(categories, eq(expenses.categoryId, categories.id))
        .where(
          and(
            eq(expenses.userId, userId),
            gte(expenses.date, oneYearAgo)
          )
        )
        .orderBy(desc(expenses.date))
        .limit(1000); // Limit for performance

      // Build label encoder
      const categoryLabels = [...new Set(userExpenses.map(e => e.categoryName).filter(Boolean))];
      categoryLabels.forEach((label, index) => {
        this.labelEncoder.set(label, index);
        this.reverseLabelEncoder.set(index, label);
      });

      // Create training data
      const trainingData = userExpenses
        .filter(e => e.categoryName) // Only include expenses with categories
        .map(expense => ({
          features: this.createFeatureVector(expense),
          label: this.labelEncoder.get(expense.categoryName)
        }));

      this.trainingData = trainingData;
      return trainingData;
    } catch (error) {
      console.error('Error loading training data:', error);
      throw error;
    }
  }

  /**
   * Train the ML model
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async trainModel(userId) {
    try {
      const trainingData = await this.loadTrainingData(userId);

      if (trainingData.length < 10) {
        console.log('Not enough training data for user:', userId);
        return;
      }

      // Prepare tensors
      const features = trainingData.map(d => d.features);
      const labels = trainingData.map(d => d.label);

      const xs = tf.tensor2d(features);
      const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), this.labelEncoder.size);

      // Create model
      this.model = tf.sequential();

      this.model.add(tf.layers.dense({
        inputShape: [features[0].length],
        units: 64,
        activation: 'relu'
      }));

      this.model.add(tf.layers.dropout({ rate: 0.2 }));

      this.model.add(tf.layers.dense({
        units: 32,
        activation: 'relu'
      }));

      this.model.add(tf.layers.dense({
        units: this.labelEncoder.size,
        activation: 'softmax'
      }));

      // Compile model
      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });

      // Train model
      await this.model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}`);
            }
          }
        }
      });

      this.isModelLoaded = true;
      console.log('Model trained successfully for user:', userId);

      // Clean up tensors
      xs.dispose();
      ys.dispose();

    } catch (error) {
      console.error('Error training model:', error);
      throw error;
    }
  }

  /**
   * Predict category for an expense
   * @param {Object} expense - Expense object
   * @returns {Promise<Object>} - Prediction result
   */
  async predictCategory(expense) {
    try {
      if (!this.isModelLoaded || !this.model) {
        return { categoryId: null, confidence: 0, categoryName: null };
      }

      const features = this.createFeatureVector(expense);
      const inputTensor = tf.tensor2d([features]);

      const prediction = this.model.predict(inputTensor);
      const probabilities = await prediction.data();

      // Get the highest probability category
      let maxProb = 0;
      let predictedIndex = 0;

      probabilities.forEach((prob, index) => {
        if (prob > maxProb) {
          maxProb = prob;
          predictedIndex = index;
        }
      });

      const predictedCategoryName = this.reverseLabelEncoder.get(predictedIndex);

      // Get category ID from database
      let categoryId = null;
      if (predictedCategoryName) {
        const categoryResult = await db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.name, predictedCategoryName),
              eq(categories.userId, expense.userId)
            )
          )
          .limit(1);

        if (categoryResult.length > 0) {
          categoryId = categoryResult[0].id;
        }
      }

      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      return {
        categoryId,
        confidence: maxProb,
        categoryName: predictedCategoryName
      };

    } catch (error) {
      console.error('Error predicting category:', error);
      return { categoryId: null, confidence: 0, categoryName: null };
    }
  }

  /**
   * Bulk categorize expenses
   * @param {string} userId - User ID
   * @param {Array} expenseIds - Array of expense IDs
   * @returns {Promise<Array>} - Categorization results
   */
  async bulkCategorize(userId, expenseIds) {
    try {
      // Ensure model is trained
      if (!this.isModelLoaded) {
        await this.trainModel(userId);
      }

      // Get expenses
      const expensesToCategorize = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            ...expenseIds.map(id => eq(expenses.id, id))
          )
        );

      const results = [];

      for (const expense of expensesToCategorize) {
        const prediction = await this.predictCategory(expense);

        if (prediction.categoryId && prediction.confidence > 0.5) { // Only auto-categorize if confidence > 50%
          // Update expense with predicted category
          await db
            .update(expenses)
            .set({
              categoryId: prediction.categoryId,
              updatedAt: new Date()
            })
            .where(eq(expenses.id, expense.id));

          results.push({
            expenseId: expense.id,
            predictedCategory: prediction.categoryName,
            confidence: prediction.confidence,
            applied: true
          });

          // Log audit event
          await logAuditEventAsync({
            userId,
            action: AuditActions.EXPENSE_UPDATE,
            resourceType: ResourceTypes.EXPENSE,
            resourceId: expense.id,
            metadata: {
              autoCategorized: true,
              predictedCategory: prediction.categoryName,
              confidence: prediction.confidence
            },
            status: 'success',
            ipAddress: 'system',
            userAgent: 'CategorizationService'
          });
        } else {
          results.push({
            expenseId: expense.id,
            predictedCategory: prediction.categoryName,
            confidence: prediction.confidence,
            applied: false
          });
        }
      }

      return results;

    } catch (error) {
      console.error('Error in bulk categorization:', error);
      throw error;
    }
  }

  /**
   * Retrain model with user corrections
   * @param {string} userId - User ID
   * @param {Array} corrections - Array of correction objects {expenseId, correctCategoryId}
   * @returns {Promise<void>}
   */
  async retrainWithCorrections(userId, corrections) {
    try {
      // Add corrections to training data
      for (const correction of corrections) {
        const expense = await db
          .select({
            description: expenses.description,
            subcategory: expenses.subcategory,
            amount: expenses.amount
          })
          .from(expenses)
          .where(eq(expenses.id, correction.expenseId))
          .limit(1);

        if (expense.length > 0) {
          const category = await db
            .select({ name: categories.name })
            .from(categories)
            .where(eq(categories.id, correction.correctCategoryId))
            .limit(1);

          if (category.length > 0) {
            this.trainingData.push({
              features: this.createFeatureVector(expense[0]),
              label: this.labelEncoder.get(category[0].name)
            });
          }
        }
      }

      // Retrain model
      await this.trainModel(userId);

    } catch (error) {
      console.error('Error retraining with corrections:', error);
      throw error;
    }
  }

  /**
   * Get model status
   * @returns {Object} - Model status
   */
  getModelStatus() {
    return {
      isLoaded: this.isModelLoaded,
      trainingDataSize: this.trainingData.length,
      categoriesCount: this.labelEncoder.size
    };
  }
}

// Export singleton instance
const categorizationService = new CategorizationService();
export default categorizationService;
