// Mock Database for Tax Tracker
const { TaxUser, TaxTransaction, Investment, TaxOpportunity } = require('./taxUserData');

const taxUsers = [];
const taxTransactions = [];
const investments = [];
const taxOpportunities = [];

function addTaxUser(user) {
    taxUsers.push(user);
    return user;
}

function getTaxUserById(userId) {
    return taxUsers.find(u => u.id === userId);
}

function addTaxTransaction(transaction) {
    taxTransactions.push(transaction);
    return transaction;
}

function getUserTransactions(userId) {
    return taxTransactions.filter(t => t.userId === userId);
}

function addInvestment(investment) {
    investments.push(investment);
    return investment;
}

function getUserInvestments(userId) {
    return investments.filter(i => i.userId === userId);
}

function addTaxOpportunity(opportunity) {
    taxOpportunities.push(opportunity);
    return opportunity;
}

function getTaxOpportunitiesByUserId(userId) {
    return taxOpportunities.filter(o => o.userId === userId);
}

module.exports = {
    addTaxUser,
    getTaxUserById,
    addTaxTransaction,
    getUserTransactions,
    addInvestment,
    getUserInvestments,
    addTaxOpportunity,
    getTaxOpportunitiesByUserId
};
