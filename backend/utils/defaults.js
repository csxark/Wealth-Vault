
export const getDefaultCategories = () => [
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
