// Unit/integration tests

const PortfolioService = require('./portfolioService');
const TradeService = require('./tradeService');
const RebalancerService = require('./rebalancerService');

function runTests() {
	// Create user and portfolio
	const user = { id: 1, name: 'Bob', email: 'bob@example.com' };
	const assets = [
		{ symbol: 'AAPL', name: 'Apple', allocation: 40, currentValue: 4000 },
		{ symbol: 'GOOG', name: 'Google', allocation: 30, currentValue: 3000 },
		{ symbol: 'TSLA', name: 'Tesla', allocation: 30, currentValue: 3000 }
	];
	const portfolio = PortfolioService.createPortfolio({ userId: user.id, assets });

	// Get portfolio
	const fetched = PortfolioService.getPortfolioByUser(user.id);
	console.log('Portfolio:', fetched);

	// Get asset allocation
	const allocation = PortfolioService.getAssetAllocation(portfolio.id);
	console.log('Allocation:', allocation);

	// Suggest rebalancing
	const suggestions = RebalancerService.suggestRebalancing(portfolio.id);
	console.log('Rebalancing Suggestions:', suggestions);

	// Automate rebalancing
	const trades = RebalancerService.automateRebalancing(portfolio.id);
	console.log('Automated Trades:', trades);

	// Get trades
	const tradeList = TradeService.getTradesByPortfolio(portfolio.id);
	console.log('Trades:', tradeList);
}

runTests();
