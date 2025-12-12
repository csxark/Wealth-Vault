import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  title: {
    type: String,
    required: [true, 'Goal title is required'],
    trim: true,
    maxlength: [100, 'Goal title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  targetAmount: {
    type: Number,
    required: [true, 'Target amount is required'],
    min: [0.01, 'Target amount must be greater than 0']
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: [0, 'Current amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR']
  },
  type: {
    type: String,
    enum: ['savings', 'debt_payoff', 'investment', 'purchase', 'emergency_fund', 'other'],
    default: 'savings'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'cancelled'],
    default: 'active'
  },
  deadline: {
    type: Date,
    required: [true, 'Deadline is required']
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  completedDate: {
    type: Date
  },
  milestones: [{
    amount: {
      type: Number,
      required: true,
      min: [0, 'Milestone amount cannot be negative']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Milestone description cannot exceed 200 characters']
    },
    achieved: {
      type: Boolean,
      default: false
    },
    achievedDate: Date
  }],
  recurringContribution: {
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Contribution amount cannot be negative']
    },
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    nextContributionDate: Date
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  metadata: {
    lastContribution: Date,
    totalContributions: {
      type: Number,
      default: 0
    },
    averageContribution: {
      type: Number,
      default: 0
    },
    streakDays: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for progress percentage
goalSchema.virtual('progressPercentage').get(function() {
  if (this.targetAmount === 0) return 0;
  return Math.min((this.currentAmount / this.targetAmount) * 100, 100);
});

// Virtual for remaining amount
goalSchema.virtual('remainingAmount').get(function() {
  return Math.max(this.targetAmount - this.currentAmount, 0);
});

// Virtual for days remaining
goalSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const timeDiff = this.deadline.getTime() - now.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
});

// Virtual for isOverdue
goalSchema.virtual('isOverdue').get(function() {
  return this.status === 'active' && this.deadline < new Date();
});

// Virtual for isCompleted
goalSchema.virtual('isCompleted').get(function() {
  return this.currentAmount >= this.targetAmount;
});

// Virtual for formatted amounts
goalSchema.virtual('formattedTargetAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency
  }).format(this.targetAmount);
});

goalSchema.virtual('formattedCurrentAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency
  }).format(this.currentAmount);
});

goalSchema.virtual('formattedRemainingAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency
  }).format(this.remainingAmount);
});

// Indexes for better query performance
goalSchema.index({ user: 1, status: 1 });
goalSchema.index({ user: 1, deadline: 1 });
goalSchema.index({ user: 1, priority: 1 });
goalSchema.index({ user: 1, type: 1 });
goalSchema.index({ user: 1, 'metadata.lastContribution': -1 });

// Static method to get goals summary for a user
goalSchema.statics.getGoalsSummary = async function(userId) {
  const result = await this.aggregate([
    {
      $match: { user: new mongoose.Types.ObjectId(userId) }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalTarget: { $sum: '$targetAmount' },
        totalCurrent: { $sum: '$currentAmount' }
      }
    }
  ]);
  
  const summary = {
    total: 0,
    active: 0,
    completed: 0,
    paused: 0,
    cancelled: 0,
    totalTarget: 0,
    totalCurrent: 0,
    overallProgress: 0
  };
  
  result.forEach(item => {
    summary[item._id] = item.count;
    summary.total += item.count;
    summary.totalTarget += item.totalTarget;
    summary.totalCurrent += item.totalCurrent;
  });
  
  if (summary.totalTarget > 0) {
    summary.overallProgress = (summary.totalCurrent / summary.totalTarget) * 100;
  }
  
  return summary;
};

// Method to add contribution
goalSchema.methods.addContribution = async function(amount, description = '') {
  if (amount <= 0) {
    throw new Error('Contribution amount must be positive');
  }
  
  this.currentAmount += amount;
  this.metadata.lastContribution = new Date();
  this.metadata.totalContributions += 1;
  
  // Update average contribution
  const totalAmount = this.metadata.averageContribution * (this.metadata.totalContributions - 1) + amount;
  this.metadata.averageContribution = totalAmount / this.metadata.totalContributions;
  
  // Check if goal is completed
  if (this.currentAmount >= this.targetAmount && this.status === 'active') {
    this.status = 'completed';
    this.completedDate = new Date();
  }
  
  // Check milestones
  this.milestones.forEach(milestone => {
    if (!milestone.achieved && this.currentAmount >= milestone.amount) {
      milestone.achieved = true;
      milestone.achievedDate = new Date();
    }
  });
  
  return await this.save();
};

// Method to calculate next contribution date
goalSchema.methods.calculateNextContribution = function() {
  if (!this.recurringContribution.amount || this.recurringContribution.amount === 0) {
    return null;
  }
  
  const now = new Date();
  let nextDate = new Date(now);
  
  switch (this.recurringContribution.frequency) {
    case 'weekly':
      nextDate.setDate(now.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(now.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(now.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(now.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(now.getFullYear() + 1);
      break;
  }
  
  return nextDate;
};

const Goal = mongoose.model('Goal', goalSchema);

export default Goal;
