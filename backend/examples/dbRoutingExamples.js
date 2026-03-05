/**
 * DB Router Usage Examples
 * 
 * Real-world code examples demonstrating different routing scenarios
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { forcePrimaryDB, criticalRead } from '../middleware/dbRouting.js';
import { users, transactions, products, orders, analytics } from '../db/schema.js';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

const router = Router();

/**
 * EXAMPLE 1: Simple GET/POST - Automatic Routing
 * GET uses replica (if available), POST uses primary
 */

// Read list → Can use replica (default behavior)
router.get('/products', async (req, res) => {
  const products = await req.db.select().from(products);
  
  res.json({
    success: true,
    data: products
  });
});

// Create → Always uses primary
router.post('/products', authenticateToken, async (req, res) => {
  const [product] = await req.db
    .insert(products)
    .values(req.body)
    .returning();
  
  res.json({
    success: true,
    data: product
  });
});

/**
 * EXAMPLE 2: Critical Financial Data - Force Primary
 * Payment and balance queries should never use potentially stale replicas
 */

// Method 1: Using middleware
router.get('/account/balance', 
  authenticateToken, 
  forcePrimaryDB(),  // Force primary for all balance queries
  async (req, res) => {
    const [account] = await req.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, req.user.id));
    
    res.json({
      success: true,
      balance: account.balance
    });
  }
);

// Method 2: Using req.useDBPrimary() in handler
router.get('/transactions/:id', authenticateToken, async (req, res) => {
  // Force this specific query to use primary
  req.useDBPrimary();
  
  const [transaction] = await req.db
    .select()
    .from(transactions)
    .where(eq(transactions.id, req.params.id));
  
  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found'
    });
  }
  
  res.json({
    success: true,
    data: transaction
  });
});

/**
 * EXAMPLE 3: Mixed Operations - Explicit Control
 * Some queries need primary, others can use replica
 */

router.get('/dashboard', authenticateToken, async (req, res) => {
  // Critical data (balance) → Primary
  req.useDBPrimary();
  const [account] = await req.db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, req.user.id));
  
  // Historical transactions → Can use replica
  // (Routing resets after each query)
  const recentTransactions = await req.db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, req.user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(10);
  
  res.json({
    success: true,
    data: {
      balance: account.balance,
      transactions: recentTransactions
    }
  });
});

/**
 * EXAMPLE 4: Post-Write Consistency
 * Reads after writes automatically use primary within consistency window
 */

// Create order
router.post('/orders', authenticateToken, async (req, res) => {
  const [order] = await req.db
    .insert(orders)
    .values({
      userId: req.user.id,
      ...req.body
    })
    .returning();
  
  // Session is marked for consistency window
  
  res.json({
    success: true,
    data: order
  });
});

// Get user's orders
router.get('/orders', authenticateToken, async (req, res) => {
  // If called within 5 seconds after POST above, this uses primary
  // After consistency window expires, can use replica
  
  const userOrders = await req.db
    .select()
    .from(orders)
    .where(eq(orders.userId, req.user.id))
    .orderBy(desc(orders.createdAt));
  
  res.json({
    success: true,
    data: userOrders
  });
});

/**
 * EXAMPLE 5: Analytics & Reporting - Perfect for Replicas
 * Analytics can tolerate slight lag and benefit from replica offload
 */

router.get('/analytics/daily-revenue', authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // This is a heavy aggregation query - perfect for replica
  // No req.useDBPrimary() call, so it can use replica
  
  const revenue = await req.db
    .select({
      date: sql`DATE(${transactions.createdAt})`,
      total: sql`SUM(${transactions.amount})`,
      count: sql`COUNT(*)`
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.createdAt, new Date(startDate)),
        lte(transactions.createdAt, new Date(endDate))
      )
    )
    .groupBy(sql`DATE(${transactions.createdAt})`);
  
  res.json({
    success: true,
    data: revenue
  });
});

/**
 * EXAMPLE 6: Transactions - Always Use Primary
 * Database transactions should always use primary
 */

router.post('/transfer', authenticateToken, async (req, res) => {
  const { fromAccountId, toAccountId, amount } = req.body;
  
  // Get write DB explicitly for transaction
  const writeDb = req.getWriteDB();
  
  try {
    const result = await writeDb.transaction(async (tx) => {
      // Debit from account
      const [fromAccount] = await tx
        .update(accounts)
        .set({
          balance: sql`${accounts.balance} - ${amount}`
        })
        .where(eq(accounts.id, fromAccountId))
        .returning();
      
      if (fromAccount.balance < 0) {
        throw new Error('Insufficient funds');
      }
      
      // Credit to account
      await tx
        .update(accounts)
        .set({
          balance: sql`${accounts.balance} + ${amount}`
        })
        .where(eq(accounts.id, toAccountId));
      
      // Record transaction
      const [transaction] = await tx
        .insert(transactions)
        .values({
          fromAccountId,
          toAccountId,
          amount,
          type: 'transfer'
        })
        .returning();
      
      return transaction;
    });
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * EXAMPLE 7: Admin Reports - Force Primary
 * Admin operations should use primary for consistency
 */

router.get('/admin/users', 
  authenticateToken,
  forcePrimaryDB(),  // Admin queries use primary
  async (req, res) => {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const allUsers = await req.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin
      })
      .from(users);
    
    res.json({
      success: true,
      data: allUsers
    });
  }
);

/**
 * EXAMPLE 8: Search - Can Use Replica
 * Search queries are read-heavy and can use replicas
 */

router.get('/products/search', async (req, res) => {
  const { query } = req.query;
  
  // Search is read-only and can tolerate slight lag
  const results = await req.db
    .select()
    .from(products)
    .where(sql`${products.name} ILIKE ${`%${query}%`}`)
    .limit(50);
  
  res.json({
    success: true,
    data: results
  });
});

/**
 * EXAMPLE 9: Critical Read Marker
 * Some reads are critical even though they're GET requests
 */

router.get('/orders/:id/status',
  authenticateToken,
  criticalRead(),  // Mark as critical - uses primary
  async (req, res) => {
    const [order] = await req.db
      .select()
      .from(orders)
      .where(eq(orders.id, req.params.id));
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: order.id,
        status: order.status,
        updatedAt: order.updatedAt
      }
    });
  }
);

/**
 * EXAMPLE 10: Explicit Read/Write DB
 * For complex scenarios requiring explicit control
 */

router.get('/user/profile-with-stats', authenticateToken, async (req, res) => {
  // User profile data - critical, use primary
  const readPrimaryDb = req.getWriteDB();
  const [user] = await readPrimaryDb
    .select()
    .from(users)
    .where(eq(users.id, req.user.id));
  
  // Usage statistics - can use replica
  const readReplicaDb = req.getReadDB();
  const stats = await readReplicaDb
    .select({
      totalOrders: sql`COUNT(*)`,
      totalSpent: sql`SUM(${orders.total})`
    })
    .from(orders)
    .where(eq(orders.userId, req.user.id));
  
  res.json({
    success: true,
    data: {
      user,
      stats: stats[0]
    }
  });
});

/**
 * EXAMPLE 11: Batch Export - Use Replica
 * Large exports benefit from replica to reduce primary load
 */

router.get('/export/transactions', authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // Large export - perfect for replica to offload primary
  const readDb = req.getReadDB();
  
  const allTransactions = await readDb
    .select()
    .from(transactions)
    .where(
      and(
        gte(transactions.createdAt, new Date(startDate)),
        lte(transactions.createdAt, new Date(endDate))
      )
    )
    .orderBy(desc(transactions.createdAt));
  
  // Convert to CSV or JSON for download
  res.json({
    success: true,
    count: allTransactions.length,
    data: allTransactions
  });
});

/**
 * EXAMPLE 12: Background Job Pattern
 * Background jobs can use replicas for reads
 */

async function generateMonthlyReportJob() {
  // Note: In job context, we don't have req object
  // We need to use the router service directly
  const { getDBRouter } = await import('../services/dbRouterService.js');
  const router = getDBRouter();
  
  // Get read connection for report generation
  const { db } = router.getConnection({ operation: 'read' });
  
  const monthlyData = await db
    .select()
    .from(transactions)
    .where(
      and(
        gte(transactions.createdAt, startOfMonth),
        lte(transactions.createdAt, endOfMonth)
      )
    );
  
  // Process and generate report...
  console.log('Monthly report generated:', monthlyData.length, 'transactions');
}

export default router;
