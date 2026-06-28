export const goalsRelations = relations(goals, ({ one }) => ({
    user: one(users, { fields: [goals.userId], references: [users.id] }),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
    user: one(users, { fields: [portfolios.userId], references: [users.id] }),
    investments: many(investments),
}));

export const investmentsRelations = relations(investments, ({ one }) => ({
    portfolio: one(portfolios, { fields: [investments.portfolioId], references: [portfolios.id] }),
    user: one(users, { fields: [investments.userId], references: [users.id] }),
    vault: one(vaults, { fields: [investments.vaultId], references: [vaults.id] }),
}));

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
    owner: one(users, { fields: [vaults.ownerId], references: [users.id] }),
    members: many(vaultMembers),
    expenses: many(expenses),
    loansGiven: many(internalDebts, { relationName: 'lending' }),
    loansTaken: many(internalDebts, { relationName: 'borrowing' }),
}));

export const vaultMembersRelations = relations(vaultMembers, ({ one }) => ({
    vault: one(vaults, { fields: [vaultMembers.vaultId], references: [vaults.id] }),
    user: one(users, { fields: [vaultMembers.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
    user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
    category: one(categories, { fields: [subscriptions.categoryId], references: [categories.id] }),
}));