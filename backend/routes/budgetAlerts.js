import { eq, and, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { budgetAlerts } from '../db/schema.js';
import { protect } from '../middleware/auth.js';
import notificationService from '../services/notificationService.js';
import budgetService from '../services/budgetService.js';
=======
import express from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { budgetAlerts } from '../db/schema.js';
import { protect } from '../middleware/auth.js';
import notificationService from '../services/notificationService.js';
import budgetService from '../services/budgetService.js';
