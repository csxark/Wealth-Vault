// User Data Model
class User {
    constructor(id, name, email, createdAt) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.createdAt = createdAt || new Date();
        this.transactions = [];
        this.income = [];
        this.lifeEvents = [];
        this.emergencyFundForecast = null;
    }
}

// Transaction Model
class Transaction {
    constructor(id, userId, amount, category, date) {
        this.id = id;
        this.userId = userId;
        this.amount = amount;
        this.category = category;
        this.date = date || new Date();
    }
}

// Income Model
class Income {
    constructor(id, userId, amount, source, date) {
        this.id = id;
        this.userId = userId;
        this.amount = amount;
        this.source = source;
        this.date = date || new Date();
    }
}

// Life Event Model
class LifeEvent {
    constructor(id, userId, type, description, date) {
        this.id = id;
        this.userId = userId;
        this.type = type;
        this.description = description;
        this.date = date || new Date();
    }
}

// Emergency Fund Forecast Model
class EmergencyFundForecast {
    constructor(userId, target, volatility, lastUpdated) {
        this.userId = userId;
        this.target = target;
        this.volatility = volatility;
        this.lastUpdated = lastUpdated || new Date();
    }
}

module.exports = {
    User,
    Transaction,
    Income,
    LifeEvent,
    EmergencyFundForecast
};
