import "../../chartjs-setup";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Line, Pie } from "react-chartjs-2";
import {
  RefreshCw,
  BarChart3,
  Receipt,
  Grid3x3,
  PieChart,
  TrendingUp,
  Activity,
  IndianRupee,
  AlertCircle,
  Users
} from 'lucide-react';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import { TransactionSearch } from './TransactionSearch';
import AddExpenseButton from './AddExpenseButton';
import { DashboardSkeleton } from './DashboardSkeleton';
import SpendingAnalytics from './SpendingAnalytics';
import { BudgetAlerts } from './BudgetAlerts';
import FamilyDashboard from './FamilyDashboard';
import AIInsights from './AIInsights';
import FinancialHealthScore from './FinancialHealthScore';
import type { SpendingData, Expense, CategoryDetails as CategoryDetailsType } from '../../types';
import { expensesAPI, api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLoading } from '../../context/LoadingContext';
import CurrencyConverter from '../CurrencyConvert';
=======
import "../../chartjs-setup";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Line, Pie } from "react-chartjs-2";
import {
  RefreshCw,
  BarChart3,
  Receipt,
  Grid3x3,
  PieChart,
  TrendingUp,
  Activity,
  IndianRupee,
  AlertCircle,
  Users
} from 'lucide-react';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import { TransactionSearch } from './TransactionSearch';
import AddExpenseButton from './AddExpenseButton';
import { DashboardSkeleton } from './DashboardSkeleton';
import SpendingAnalytics from './SpendingAnalytics';
import { BudgetAlerts } from './BudgetAlerts';
import FamilyDashboard from './FamilyDashboard';
import AIInsights from './AIInsights';
import FinancialHealthScore from './FinancialHealthScore';
import type { SpendingData, Expense, CategoryDetails as CategoryDetailsType } from '../../types';
import { expensesAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLoading } from '../../context/LoadingContext';
import CurrencyConverter from '../CurrencyConvert';
