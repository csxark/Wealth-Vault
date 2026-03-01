import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import db from '../config/db.js';
import { bankAccounts, bankTransactions, expenses, categories } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

// Initialize Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

class BankSyncService {
  /**
   * Create a link token for Plaid Link
   */
  async createLinkToken(userId) {
    try {
      const request = {
        user: {
          client_user_id: userId,
        },
        client_name: 'Wealth Vault',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
        webhook: `${process.env.BACKEND_URL}/api/bank-sync/webhook`,
      };

      const response = await plaidClient.linkTokenCreate(request);
      return response.data;
    } catch (error) {
      logError('Failed to create Plaid link token', { userId, error: error.message });
      throw new Error('Failed to create bank connection link');
    }
  }

  /**
   * Exchange public token for access token and store bank accounts
   */
  async exchangePublicToken(publicToken, userId) {
    try {
      const tokenResponse = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
      });

      const accessToken = tokenResponse.data.access_token;
      const itemId = tokenResponse.data.item_id;

      // Get accounts information
      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      });

      const accounts = accountsResponse.data.accounts;

      // Store bank accounts in database
      const storedAccounts = [];
      for (const account of accounts) {
        const [storedAccount] = await db
          .insert(bankAccounts)
          .values({
            userId,
            plaidAccountId: account.account_id,
            plaidItemId: itemId,
            name: account.name,
            officialName: account.official_name,
            type: account.type,
            subtype: account.subtype,
            mask: account.mask,
            institutionId: account.institution_id || '',
            institutionName: account.institution_name || '',
            balanceCurrent: account.balances.current?.toString(),
            balanceAvailable: account.balances.available?.toString(),
            currency: account.balances.iso_currency_code || 'USD',
          })
          .returning();

        storedAccounts.push(storedAccount);
      }

      logInfo('Bank accounts connected successfully', {
        userId,
        accountCount: storedAccounts.length,
        itemId,
      });

      return {
        accessToken,
        itemId,
        accounts: storedAccounts,
      };
    } catch (error) {
      logError('Failed to exchange public token', { userId, error: error.message });
      throw new Error('Failed to connect bank accounts');
    }
  }

  /**
   * Sync transactions for a user's bank accounts
   */
  async syncTransactions(userId, accessToken, itemId, startDate = null, endDate = null) {
    try {
      // Default to last 30 days if no dates provided
      const end = endDate || new Date();
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const request = {
        access_token: accessToken,
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
      };

      const response = await plaidClient.transactionsGet(request);
      const transactions = response.data.transactions;

      // Get user's bank accounts
      const userAccounts = await db.query.bankAccounts.findMany({
        where: eq(bankAccounts.userId, userId),
      });

      const accountMap = new Map(
        userAccounts.map(account => [account.plaidAccountId, account.id])
      );

      let processedCount = 0;
      let importedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const transaction of transactions) {
        try {
          const bankAccountId = accountMap.get(transaction.account_id);
          if (!bankAccountId) continue;

          // Check if transaction already exists
          const existingTransaction = await db.query.bankTransactions.findFirst({
            where: and(
              eq(bankTransactions.plaidTransactionId, transaction.transaction_id),
              eq(bankTransactions.userId, userId)
            ),
          });

          if (existingTransaction) {
            duplicateCount++;
            continue;
          }

          // Store bank transaction
          const [storedTransaction] = await db
            .insert(bankTransactions)
            .values({
              userId,
              bankAccountId,
              plaidTransactionId: transaction.transaction_id,
              amount: Math.abs(transaction.amount).toString(), // Store as positive for expenses
              currency: transaction.iso_currency_code || 'USD',
              description: transaction.name,
              originalDescription: transaction.original_description,
              date: new Date(transaction.date),
              category: transaction.category,
              categoryId: transaction.category_id,
              pending: transaction.pending,
              pendingTransactionId: transaction.pending_transaction_id,
              accountOwner: transaction.account_owner,
              location: transaction.location,
              paymentMeta: transaction.payment_meta,
              transactionType: transaction.transaction_type,
              transactionCode: transaction.transaction_code,
            })
            .returning();

          // Try to import as expense (only for debit transactions)
          if (transaction.amount > 0) { // Debit transaction
            const expenseId = await this.importTransactionAsExpense(storedTransaction);
            if (expenseId) {
              importedCount++;
              // Update transaction with expense link
              await db
                .update(bankTransactions)
                .set({
                  expenseId,
                  isImported: true,
                  importStatus: 'imported',
                })
                .where(eq(bankTransactions.id, storedTransaction.id));
            } else {
              await db
                .update(bankTransactions)
                .set({
                  importStatus: 'error',
                  importError: 'Failed to categorize transaction',
                })
                .where(eq(bankTransactions.id, storedTransaction.id));
              errorCount++;
            }
          } else {
            // Credit transaction - could be income, but we'll skip for now
            await db
              .update(bankTransactions)
              .set({
                importStatus: 'skipped',
              })
              .where(eq(bankTransactions.id, storedTransaction.id));
          }

          processedCount++;
        } catch (error) {
          logError('Error processing transaction', {
            transactionId: transaction.transaction_id,
            error: error.message,
          });
          errorCount++;
        }
      }

      // Update last synced timestamp
      await db
        .update(bankAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(bankAccounts.plaidItemId, itemId));

      logInfo('Transaction sync completed', {
        userId,
        processedCount,
        importedCount,
        duplicateCount,
        errorCount,
      });

      return {
        processedCount,
        importedCount,
        duplicateCount,
        errorCount,
      };
    } catch (error) {
      logError('Failed to sync transactions', { userId, error: error.message });
      throw new Error('Failed to sync bank transactions');
    }
  }

  /**
   * Import a bank transaction as an expense
   */
  async importTransactionAsExpense(bankTransaction) {
    try {
      // Get user's categories
      const userCategories = await db.query.categories.findMany({
        where: and(
          eq(categories.userId, bankTransaction.userId),
          eq(categories.isActive, true)
        ),
      });

      // Categorize transaction
      const categoryId = this.categorizeTransaction(bankTransaction, userCategories);

      if (!categoryId) {
        return null;
      }

      // Check for duplicates
      const isDuplicate = await this.checkDuplicateExpense(bankTransaction);
      if (isDuplicate) {
        return null;
      }

      // Create expense
      const [expense] = await db
        .insert(expenses)
        .values({
          userId: bankTransaction.userId,
          amount: bankTransaction.amount,
          description: bankTransaction.description,
          categoryId,
          date: bankTransaction.date,
          paymentMethod: 'bank_transfer',
          notes: `Imported from ${bankTransaction.bankAccount?.name || 'bank'}`,
          metadata: {
            createdBy: 'bank_sync',
            bankTransactionId: bankTransaction.id,
          },
        })
        .returning();

      return expense.id;
    } catch (error) {
      logError('Failed to import transaction as expense', {
        transactionId: bankTransaction.id,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Categorize a bank transaction
   */
  categorizeTransaction(bankTransaction, userCategories) {
    const description = bankTransaction.description.toLowerCase();
    const plaidCategory = bankTransaction.category;

    // First, try to match Plaid categories to user categories
    if (plaidCategory && plaidCategory.length > 0) {
      const primaryCategory = plaidCategory[0].toLowerCase();

      // Map Plaid categories to common expense categories
      const categoryMappings = {
        'food and drink': ['food', 'restaurant', 'groceries'],
        'travel': ['travel', 'transportation'],
        'entertainment': ['entertainment', 'recreation'],
        'shopping': ['shopping', 'retail'],
        'bills and utilities': ['utilities', 'bills'],
        'healthcare': ['health', 'medical'],
        'education': ['education'],
        'personal care': ['personal care'],
        'automotive': ['automotive', 'car'],
        'home improvement': ['home', 'maintenance'],
      };

      for (const [plaidCat, userCats] of Object.entries(categoryMappings)) {
        if (primaryCategory.includes(plaidCat)) {
          for (const userCat of userCats) {
            const matchingCategory = userCategories.find(cat =>
              cat.name.toLowerCase().includes(userCat)
            );
            if (matchingCategory) {
              return matchingCategory.id;
            }
          }
        }
      }
    }

    // Fallback to keyword matching on description
    const keywordMappings = {
      'grocery': ['grocery', 'supermarket', 'food'],
      'restaurant': ['restaurant', 'cafe', 'diner', 'mcdonald', 'starbucks'],
      'gas': ['gas', 'fuel', 'station'],
      'utilities': ['electric', 'water', 'internet', 'phone', 'utility'],
      'entertainment': ['netflix', 'spotify', 'movie', 'theater', 'game'],
      'shopping': ['amazon', 'walmart', 'target', 'store'],
      'transport': ['uber', 'lyft', 'taxi', 'bus', 'train'],
      'health': ['pharmacy', 'doctor', 'hospital', 'medical'],
    };

    for (const [categoryName, keywords] of Object.entries(keywordMappings)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        const matchingCategory = userCategories.find(cat =>
          cat.name.toLowerCase().includes(categoryName) ||
          categoryName.includes(cat.name.toLowerCase())
        );
        if (matchingCategory) {
          return matchingCategory.id;
        }
      }
    }

    // Default to first available category
    return userCategories.length > 0 ? userCategories[0].id : null;
  }

  /**
   * Check if an expense already exists for this transaction
   */
  async checkDuplicateExpense(bankTransaction) {
    try {
      // Look for expenses with similar date, amount, and description
      const existingExpenses = await db.query.expenses.findMany({
        where: and(
          eq(expenses.userId, bankTransaction.userId),
          gte(expenses.date, new Date(bankTransaction.date.getTime() - 24 * 60 * 60 * 1000)), // Within 1 day
          lte(expenses.date, new Date(bankTransaction.date.getTime() + 24 * 60 * 60 * 1000)),
          eq(expenses.amount, bankTransaction.amount)
        ),
      });

      // Check for similar descriptions (simple fuzzy match)
      for (const expense of existingExpenses) {
        const similarity = this.calculateStringSimilarity(
          expense.description.toLowerCase(),
          bankTransaction.description.toLowerCase()
        );

        if (similarity > 0.8) { // 80% similarity threshold
          return true;
        }
      }

      return false;
    } catch (error) {
      logError('Error checking for duplicate expense', {
        transactionId: bankTransaction.id,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Simple string similarity calculation
   */
  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Levenshtein distance calculation
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get user's connected bank accounts
   */
  async getUserBankAccounts(userId) {
    try {
      const accounts = await db.query.bankAccounts.findMany({
        where: eq(bankAccounts.userId, userId),
        orderBy: [desc(bankAccounts.createdAt)],
      });

      return accounts;
    } catch (error) {
      logError('Failed to get user bank accounts', { userId, error: error.message });
      throw new Error('Failed to retrieve bank accounts');
    }
  }

  /**
   * Get bank transactions for a user
   */
  async getBankTransactions(userId, accountId = null, limit = 50, offset = 0) {
    try {
      const conditions = [eq(bankTransactions.userId, userId)];

      if (accountId) {
        conditions.push(eq(bankTransactions.bankAccountId, accountId));
      }

      const transactions = await db.query.bankTransactions.findMany({
        where: and(...conditions),
        orderBy: [desc(bankTransactions.date)],
        limit,
        offset,
        with: {
          bankAccount: {
            columns: { name: true, institutionName: true },
          },
          expense: {
            columns: { id: true, description: true },
          },
        },
      });

      return transactions;
    } catch (error) {
      logError('Failed to get bank transactions', { userId, error: error.message });
      throw new Error('Failed to retrieve bank transactions');
    }
  }

  /**
   * Remove bank connection
   */
  async removeBankConnection(userId, itemId) {
    try {
      // Delete transactions first (cascade will handle)
      await db
        .delete(bankTransactions)
        .where(and(
          eq(bankTransactions.userId, userId),
          eq(bankTransactions.bankAccountId, db.select({ id: bankAccounts.id })
            .from(bankAccounts)
            .where(eq(bankAccounts.plaidItemId, itemId)))
        ));

      // Delete accounts
      await db
        .delete(bankAccounts)
        .where(and(
          eq(bankAccounts.userId, userId),
          eq(bankAccounts.plaidItemId, itemId)
        ));

      logInfo('Bank connection removed', { userId, itemId });
    } catch (error) {
      logError('Failed to remove bank connection', { userId, itemId, error: error.message });
      throw new Error('Failed to remove bank connection');
    }
  }
}

export default new BankSyncService();
