// Controllers: API endpoints for portfolios, trades, rebalancing

const PortfolioService = require('./portfolioService');
const TradeService = require('./tradeService');
const RebalancerService = require('./rebalancerService');

const controllers = {
	createPortfolio: (req, res) => {
		const portfolio = PortfolioService.createPortfolio(req.body);
		res.status(201).json(portfolio);
	},
	getPortfolio: (req, res) => {
		const portfolio = PortfolioService.getPortfolioByUser(req.params.userId);
		if (portfolio) res.json(portfolio);
		else res.status(404).json({ error: 'Portfolio not found' });
	},
	updatePortfolio: (req, res) => {
		const portfolio = PortfolioService.updatePortfolio(parseInt(req.params.portfolioId), req.body);
		if (portfolio) res.json(portfolio);
		else res.status(404).json({ error: 'Portfolio not found' });
	},
	getAssetAllocation: (req, res) => {
		const allocation = PortfolioService.getAssetAllocation(parseInt(req.params.portfolioId));
		res.json(allocation);
	},
	createTrade: (req, res) => {
		const trade = TradeService.createTrade(req.body);
		res.status(201).json(trade);
	},
	executeTrade: (req, res) => {
		const trade = TradeService.executeTrade(parseInt(req.params.tradeId));
		if (trade) res.json(trade);
		else res.status(404).json({ error: 'Trade not found' });
	},
	getTrades: (req, res) => {
		const trades = TradeService.getTradesByPortfolio(parseInt(req.params.portfolioId));
		res.json(trades);
	},
	suggestRebalancing: (req, res) => {
		const suggestions = RebalancerService.suggestRebalancing(parseInt(req.params.portfolioId));
		res.json(suggestions);
	},
	automateRebalancing: (req, res) => {
		const trades = RebalancerService.automateRebalancing(parseInt(req.params.portfolioId));
		res.json(trades);
	}
};

module.exports = controllers;
