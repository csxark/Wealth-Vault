// TradeService: automate trades, simulate execution

const { Trade } = require('./models');
const trades = [];

class TradeService {
	static createTrade(tradeData) {
		const trade = new Trade(
			trades.length + 1,
			tradeData.portfolioId,
			tradeData.assetSymbol,
			tradeData.action,
			tradeData.amount,
			new Date().toISOString(),
			'pending'
		);
		trades.push(trade);
		return trade;
	}

	static executeTrade(tradeId) {
		const trade = trades.find(t => t.id === tradeId);
		if (!trade) return null;
		// Simulate execution
		trade.status = 'executed';
		trade.date = new Date().toISOString();
		return trade;
	}

	static getTradesByPortfolio(portfolioId) {
		return trades.filter(t => t.portfolioId === portfolioId);
	}

	static getTradeById(tradeId) {
		return trades.find(t => t.id === tradeId);
	}
}

module.exports = TradeService;
