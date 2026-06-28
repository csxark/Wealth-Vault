import db from "../config/db.js";
import { educationContent, educationQuizzes, userEducationProgress, quizAttempts, financialHealthScores, users, expenses, goals, categories } from "../db/schema.js";
import { eq, and, desc, asc, gte, lte, inArray, sql } from "drizzle-orm";

class EducationService {
  /**
   * Get personalized education content recommendations based on user's financial health
   */
  async getPersonalizedRecommendations(userId, filters = {}) {
    try {
      // Get user's financial health scores
      const [healthScore] = await db
        .select()
        .from(financialHealthScores)
        .where(eq(financialHealthScores.userId, userId))
        .orderBy(desc(financialHealthScores.calculatedAt))
        .limit(1);

      // Get user's spending patterns and goals
      const userData = await this.getUserFinancialData(userId);

      // Build recommendation criteria based on financial health
      const criteria = this.buildRecommendationCriteria(healthScore, userData, filters);

      // Query education content based on criteria
      let query = db.select().from(educationContent).where(eq(educationContent.isActive, true));

      if (criteria.categories && criteria.categories.length > 0) {
        query = query.where(inArray(educationContent.category, criteria.categories));
      }

      if (criteria.difficulty) {
        query = query.where(eq(educationContent.difficulty, criteria.difficulty));
      }

      // Order by relevance score (we'll implement this)
      const content = await query
        .orderBy(desc(sql`RANDOM()`)) // For now, randomize; later implement scoring
        .limit(filters.limit || 10);

      // Get user's progress for these content items
      const progressMap = await this.getUserProgressMap(userId, content.map(c => c.id));

      // Attach progress information
      const recommendations = content.map(item => ({
        ...item,
        progress: progressMap[item.id] || null,
        relevanceScore: this.calculateRelevanceScore(item, healthScore, userData)
      }));

      // Sort by relevance score
      return recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);

    } catch (error) {
      console.error("Error getting personalized recommendations:", error);
      throw error;
    }
  }

  /**
   * Update user's progress for education content
   */
  async updateProgress(userId, contentId, updateData) {
    try {
      const existingProgress = await db.query.userEducationProgress.findFirst({
        where: and(
          eq(userEducationProgress.userId, userId),
          eq(userEducationProgress.contentId, contentId)
        )
      });

      if (existingProgress) {
        await db
          .update(userEducationProgress)
          .set({
            ...updateData,
            updatedAt: new Date()
          })
          .where(eq(userEducationProgress.id, existingProgress.id));
      } else {
        await db.insert(userEducationProgress).values({
          userId,
          contentId,
          ...updateData
        });
      }
    } catch (error) {
      console.error("Error updating progress:", error);
      throw error;
    }
  }

  /**
   * Submit quiz attempt and calculate score
   */
  async submitQuizAttempt(userId, quizId, attemptData) {
    try {
      // Get quiz details
      const quiz = await db.query.educationQuizzes.findFirst({
        where: eq(educationQuizzes.id, quizId)
      });

      if (!quiz) {
        throw new Error("Quiz not found");
      }

      // Calculate score
      const score = this.calculateQuizScore(quiz.questions, attemptData.answers);
      const passed = score >= quiz.passingScore;

      // Save attempt
      const [attempt] = await db.insert(quizAttempts).values({
        userId,
        quizId,
        answers: attemptData.answers,
        score,
        passed,
        timeTaken: attemptData.timeTaken,
        completedAt: new Date()
      }).returning();

      // Update user progress if passed
      if (passed) {
        await this.updateProgress(userId, quiz.contentId, {
          quizScore: score,
          quizPassed: true,
          status: 'completed',
          completedAt: new Date()
        });
      }

      return {
        attemptId: attempt.id,
        score,
        passed,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts
      };

    } catch (error) {
      console.error("Error submitting quiz attempt:", error);
      throw error;
    }
  }

  /**
   * Get user's education progress
   */
  async getUserEducationProgress(userId) {
    try {
      const progress = await db.query.userEducationProgress.findMany({
        where: eq(userEducationProgress.userId, userId),
        with: {
          content: true
        },
        orderBy: desc(userEducationProgress.lastAccessedAt)
      });

      return progress;
    } catch (error) {
      console.error("Error getting user education progress:", error);
      throw error;
    }
  }

  /**
   * Get education statistics for user
   */
  async getEducationStats(userId) {
    try {
      const [totalContent] = await db
        .select({ count: sql`count(*)` })
        .from(educationContent)
        .where(eq(educationContent.isActive, true));

      const [completedContent] = await db
        .select({ count: sql`count(*)` })
        .from(userEducationProgress)
        .where(and(
          eq(userEducationProgress.userId, userId),
          eq(userEducationProgress.status, 'completed')
        ));

      const [totalQuizzes] = await db
        .select({ count: sql`count(*)` })
        .from(quizAttempts)
        .where(eq(quizAttempts.userId, userId));

      const [passedQuizzes] = await db
        .select({ count: sql`count(*)` })
        .from(quizAttempts)
        .where(and(
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.passed, true)
        ));

      const [averageScore] = await db
        .select({ avg: sql`avg(${quizAttempts.score})` })
        .from(quizAttempts)
        .where(eq(quizAttempts.userId, userId));

      return {
        totalContent: parseInt(totalContent.count),
        completedContent: parseInt(completedContent.count),
        completionRate: totalContent.count > 0 ? (completedContent.count / totalContent.count) * 100 : 0,
        totalQuizzes: parseInt(totalQuizzes.count),
        passedQuizzes: parseInt(passedQuizzes.count),
        quizPassRate: totalQuizzes.count > 0 ? (passedQuizzes.count / totalQuizzes.count) * 100 : 0,
        averageQuizScore: parseFloat(averageScore.avg) || 0
      };

    } catch (error) {
      console.error("Error getting education stats:", error);
      throw error;
    }
  }

  // Helper methods

  async getUserFinancialData(userId) {
    // Get recent expenses, goals, and categories
    const recentExpenses = await db
      .select()
      .from(expenses)
      .where(eq(expenses.userId, userId))
      .orderBy(desc(expenses.date))
      .limit(100);

    const activeGoals = await db
      .select()
      .from(goals)
      .where(and(
        eq(goals.userId, userId),
        eq(goals.status, 'active')
      ));

    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));

    return {
      recentExpenses,
      activeGoals,
      categories: userCategories
    };
  }

  buildRecommendationCriteria(healthScore, userData, filters) {
    const criteria = {
      categories: [],
      difficulty: filters.difficulty || 'beginner'
    };

    if (!healthScore) {
      // New user - start with basics
      criteria.categories = ['budgeting', 'saving', 'general'];
      criteria.difficulty = 'beginner';
      return criteria;
    }

    // Analyze financial health to determine focus areas
    const { dtiScore, savingsRateScore, emergencyFundScore, budgetAdherenceScore } = healthScore.metrics;

    if (dtiScore < 30) {
      criteria.categories.push('debt');
    }

    if (savingsRateScore < 40) {
      criteria.categories.push('saving');
    }

    if (emergencyFundScore < 50) {
      criteria.categories.push('saving');
    }

    if (budgetAdherenceScore < 60) {
      criteria.categories.push('budgeting');
    }

    // Check user goals
    const hasInvestmentGoals = userData.activeGoals.some(goal =>
      goal.type === 'investment' || goal.title.toLowerCase().includes('invest')
    );

    if (hasInvestmentGoals) {
      criteria.categories.push('investing');
    }

    // Set difficulty based on overall health score
    if (healthScore.overallScore > 75) {
      criteria.difficulty = 'intermediate';
    } else if (healthScore.overallScore > 50) {
      criteria.difficulty = 'beginner';
    } else {
      criteria.difficulty = 'beginner';
    }

    // Apply filters
    if (filters.category) {
      criteria.categories = [filters.category];
    }

    return criteria;
  }

  calculateRelevanceScore(content, healthScore, userData) {
    let score = 50; // Base score

    if (!healthScore) return score;

    // Boost score based on financial health needs
    const healthMetrics = healthScore.metrics;

    if (content.category === 'debt' && healthMetrics.dtiScore < 30) {
      score += 30;
    }

    if (content.category === 'saving' && (healthMetrics.savingsRateScore < 40 || healthMetrics.emergencyFundScore < 50)) {
      score += 25;
    }

    if (content.category === 'budgeting' && healthMetrics.budgetAdherenceScore < 60) {
      score += 20;
    }

    // Difficulty matching
    if (content.difficulty === 'beginner' && healthScore.overallScore < 50) {
      score += 10;
    }

    if (content.difficulty === 'intermediate' && healthScore.overallScore >= 50 && healthScore.overallScore <= 75) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  calculateQuizScore(questions, userAnswers) {
    if (!questions || !Array.isArray(questions)) return 0;

    let correctAnswers = 0;
    const totalQuestions = questions.length;

    questions.forEach((question, index) => {
      const userAnswer = userAnswers[index];
      if (userAnswer !== undefined && userAnswer === question.correctAnswer) {
        correctAnswers++;
      }
    });

    return Math.round((correctAnswers / totalQuestions) * 100);
  }

  async getUserProgressMap(userId, contentIds) {
    const progress = await db
      .select()
      .from(userEducationProgress)
      .where(and(
        eq(userEducationProgress.userId, userId),
        inArray(userEducationProgress.contentId, contentIds)
      ));

    return progress.reduce((map, item) => {
      map[item.contentId] = item;
      return map;
    }, {});
  }
}

export default new EducationService();
