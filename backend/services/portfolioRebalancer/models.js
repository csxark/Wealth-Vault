// Portfolio, Asset, Trade, User models

// User Model
class User {
	constructor(id, name, email, preferences = {}) {
		this.id = id;
		this.name = name;
		this.email = email;
		this.preferences = preferences;
	}
}

// Asset Model
class Asset {
	constructor(symbol, name, allocation, currentValue) {
		this.symbol = symbol;
		this.name = name;
		this.allocation = allocation; // Target allocation percentage
		this.currentValue = currentValue;
	}
}

// Portfolio Model
class Portfolio {
	constructor(id, userId, assets = [], lastRebalanced = null) {
		this.id = id;
		this.userId = userId;
		this.assets = assets;
		this.lastRebalanced = lastRebalanced;
	}
}

// Trade Model
class Trade {
	constructor(id, portfolioId, assetSymbol, action, amount, date, status = 'pending') {
		this.id = id;
		this.portfolioId = portfolioId;
		this.assetSymbol = assetSymbol;
		this.action = action; // 'buy' or 'sell'
		this.amount = amount;
		this.date = date;
		this.status = status;
	}
}

module.exports = {
	User,
	Asset,
	Portfolio,
	Trade
};
