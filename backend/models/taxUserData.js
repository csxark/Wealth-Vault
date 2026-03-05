// Tax User Data Models
class TaxUser {
    constructor(id, name, email, createdAt) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.createdAt = createdAt || new Date();
        this.transactions = [];
        this.investments = [];
        this.taxOpportunities = [];
    }
}

class TaxTransaction {
    constructor(id, userId, amount, category, date) {
        this.id = id;
        this.userId = userId;
        this.amount = amount;
        this.category = category;
        this.date = date || new Date();
    }
}

class Investment {
    constructor(id, userId, type, amount, date) {
        this.id = id;
        this.userId = userId;
        this.type = type;
        this.amount = amount;
        this.date = date || new Date();
    }
}

class TaxOpportunity {
    constructor(id, userId, type, description, detectedOn) {
        this.id = id;
        this.userId = userId;
        this.type = type;
        this.description = description;
        this.detectedOn = detectedOn || new Date();
    }
}

module.exports = {
    TaxUser,
    TaxTransaction,
    Investment,
    TaxOpportunity
};
