// Persistence Layer: Mock Database
// In a real system, replace with MongoDB, PostgreSQL, etc.

const { User, Transaction, Income, LifeEvent, EmergencyFundForecast } = require('./userData');

const users = [];
const transactions = [];
const incomes = [];
const lifeEvents = [];
const forecasts = [];

function addUser(user) {
    users.push(user);
    return user;
}

function getUserById(userId) {
    return users.find(u => u.id === userId);
}

function addTransaction(transaction) {
    transactions.push(transaction);
    return transaction;
}

function getUserTransactions(userId) {
    return transactions.filter(t => t.userId === userId);
}

function addIncome(income) {
    incomes.push(income);
    return income;
}

function getUserIncome(userId) {
    return incomes.filter(i => i.userId === userId);
}

function addLifeEvent(event) {
    lifeEvents.push(event);
    return event;
}

function getUserLifeEvents(userId) {
    return lifeEvents.filter(e => e.userId === userId);
}

function saveForecast(forecast) {
    forecasts.push(forecast);
    return forecast;
}

function getForecastByUserId(userId) {
    return forecasts.find(f => f.userId === userId);
}

module.exports = {
    addUser,
    getUserById,
    addTransaction,
    getUserTransactions,
    addIncome,
    getUserIncome,
    addLifeEvent,
    getUserLifeEvents,
    saveForecast,
    getForecastByUserId
};
