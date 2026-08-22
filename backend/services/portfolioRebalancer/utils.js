// Utils: Logger, MarketData, AllocationCalculator

const Logger = {
	log: (msg) => {
		console.log(`[LOG] ${new Date().toISOString()} - ${msg}`);
	},
	error: (msg) => {
		console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`);
	}
};

const MarketData = {
	getPrice: (symbol) => {
		// Simulate market price
		return 100 + Math.random() * 100;
	},
	getAllPrices: (symbols) => {
		return symbols.reduce((acc, sym) => {
			acc[sym] = MarketData.getPrice(sym);
			return acc;
		}, {});
	}
};

const AllocationCalculator = {
	calculateActualAllocation: (assets) => {
		const total = assets.reduce((sum, asset) => sum + asset.currentValue, 0);
		return assets.map(asset => ({
			symbol: asset.symbol,
			actualAllocation: total ? (asset.currentValue / total) * 100 : 0
		}));
	}
};

module.exports = {
	Logger,
	MarketData,
	AllocationCalculator
};
