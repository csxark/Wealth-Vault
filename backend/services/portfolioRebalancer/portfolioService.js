// PortfolioService: allocation monitoring, rebalancing logic

const { Portfolio, Asset } = require('./models');
const portfolios = [];

class PortfolioService {
	static createPortfolio(portfolioData) {
		const portfolio = new Portfolio(
			portfolios.length + 1,
			portfolioData.userId,
			portfolioData.assets.map(a => new Asset(a.symbol, a.name, a.allocation, a.currentValue)),
			new Date().toISOString()
		);
		portfolios.push(portfolio);
		return portfolio;
	}

	static getPortfolioByUser(userId) {
		return portfolios.find(p => p.userId === userId);
	}

	static updatePortfolio(portfolioId, updateData) {
		const portfolio = portfolios.find(p => p.id === portfolioId);
		if (!portfolio) return null;
		Object.assign(portfolio, updateData);
		return portfolio;
	}

	static getAssetAllocation(portfolioId) {
		const portfolio = portfolios.find(p => p.id === portfolioId);
		if (!portfolio) return null;
		const totalValue = portfolio.assets.reduce((sum, asset) => sum + asset.currentValue, 0);
		return portfolio.assets.map(asset => ({
			symbol: asset.symbol,
			name: asset.name,
			allocation: asset.allocation,
			currentValue: asset.currentValue,
			actualAllocation: totalValue ? (asset.currentValue / totalValue) * 100 : 0
		}));
	}

	static rebalancePortfolio(portfolioId, targetAllocations) {
		const portfolio = portfolios.find(p => p.id === portfolioId);
		if (!portfolio) return null;
		portfolio.assets.forEach(asset => {
			if (targetAllocations[asset.symbol] !== undefined) {
				asset.allocation = targetAllocations[asset.symbol];
			}
		});
		portfolio.lastRebalanced = new Date().toISOString();
		return portfolio;
	}
}

module.exports = PortfolioService;
