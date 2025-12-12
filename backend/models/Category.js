import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  color: {
    type: String,
    required: [true, 'Color is required'],
    default: '#3B82F6',
    match: [/^#[0-9A-F]{6}$/i, 'Color must be a valid hex color']
  },
  icon: {
    type: String,
    default: 'tag',
    maxlength: [50, 'Icon name cannot exceed 50 characters']
  },
  type: {
    type: String,
    enum: ['expense', 'income', 'both'],
    default: 'expense'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  subcategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  budget: {
    monthly: {
      type: Number,
      default: 0,
      min: [0, 'Monthly budget cannot be negative']
    },
    yearly: {
      type: Number,
      default: 0,
      min: [0, 'Yearly budget cannot be negative']
    }
  },
  spendingLimit: {
    type: Number,
    default: 0,
    min: [0, 'Spending limit cannot be negative']
  },
  priority: {
    type: Number,
    default: 0,
    min: [0, 'Priority cannot be negative']
  },
  metadata: {
    usageCount: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    },
    averageAmount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total budget
categorySchema.virtual('totalBudget').get(function() {
  return this.budget.monthly + this.budget.yearly;
});

// Virtual for isOverBudget (if spending limit is set)
categorySchema.virtual('isOverBudget').get(function() {
  if (this.spendingLimit === 0) return false;
  return this.metadata.averageAmount > this.spendingLimit;
});

// Indexes for better query performance
categorySchema.index({ user: 1, name: 1 });
categorySchema.index({ user: 1, type: 1 });
categorySchema.index({ user: 1, isActive: 1 });
categorySchema.index({ user: 1, priority: -1 });

// Static method to get default categories for a new user
categorySchema.statics.getDefaultCategories = function() {
  return [
    {
      name: 'Food & Dining',
      description: 'Restaurants, groceries, and food delivery',
      color: '#EF4444',
      icon: 'utensils',
      type: 'expense',
      isDefault: true,
      priority: 1
    },
    {
      name: 'Transportation',
      description: 'Gas, public transit, rideshare, and car maintenance',
      color: '#3B82F6',
      icon: 'car',
      type: 'expense',
      isDefault: true,
      priority: 2
    },
    {
      name: 'Shopping',
      description: 'Clothing, electronics, and general retail',
      color: '#8B5CF6',
      icon: 'shopping-bag',
      type: 'expense',
      isDefault: true,
      priority: 3
    },
    {
      name: 'Entertainment',
      description: 'Movies, games, concerts, and leisure activities',
      color: '#10B981',
      icon: 'music',
      type: 'expense',
      isDefault: true,
      priority: 4
    },
    {
      name: 'Healthcare',
      description: 'Medical expenses, prescriptions, and insurance',
      color: '#F59E0B',
      icon: 'heart',
      type: 'expense',
      isDefault: true,
      priority: 5
    },
    {
      name: 'Housing',
      description: 'Rent, mortgage, utilities, and home maintenance',
      color: '#84CC16',
      icon: 'home',
      type: 'expense',
      isDefault: true,
      priority: 6
    },
    {
      name: 'Income',
      description: 'Salary, bonuses, and other income sources',
      color: '#06B6D4',
      icon: 'dollar-sign',
      type: 'income',
      isDefault: true,
      priority: 7
    }
  ];
};

// Method to update usage statistics
categorySchema.methods.updateUsageStats = async function(amount) {
  this.metadata.usageCount += 1;
  this.metadata.lastUsed = new Date();
  
  // Update average amount
  const totalAmount = this.metadata.averageAmount * (this.metadata.usageCount - 1) + amount;
  this.metadata.averageAmount = totalAmount / this.metadata.usageCount;
  
  return await this.save();
};

// Method to check if category can be deleted
categorySchema.methods.canDelete = function() {
  return !this.isDefault && this.metadata.usageCount === 0;
};

const Category = mongoose.model('Category', categorySchema);

export default Category;
