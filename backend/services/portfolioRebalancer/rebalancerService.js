// RebalancerService: suggest optimal actions, automate rebalancing

const PortfolioService = require('./portfolioService');
const TradeService = require('./tradeService');

class RebalancerService {
	static suggestRebalancing(portfolioId) {
		const allocations = PortfolioService.getAssetAllocation(portfolioId);
		if (!allocations) return [];
		const suggestions = [];
		allocations.forEach(asset => {
			const diff = asset.actualAllocation - asset.allocation;
			if (Math.abs(diff) > 2) { // threshold 2%
				suggestions.push({
					assetSymbol: asset.symbol,
					action: diff > 0 ? 'sell' : 'buy',
					amount: Math.abs(diff)
				});
			}
		});
		return suggestions;
	}

	static automateRebalancing(portfolioId) {
		const suggestions = this.suggestRebalancing(portfolioId);
		const trades = [];
		suggestions.forEach(suggestion => {
			const trade = TradeService.createTrade({
				portfolioId,
				assetSymbol: suggestion.assetSymbol,
				action: suggestion.action,
				amount: suggestion.amount
			});
			TradeService.executeTrade(trade.id);
			trades.push(trade);
		});
		PortfolioService.rebalancePortfolio(portfolioId, {}); // Update lastRebalanced
		return trades;
	}
}

module.exports = RebalancerService;
