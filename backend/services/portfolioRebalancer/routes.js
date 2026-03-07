// Express routes for API

const express = require('express');
const controllers = require('./controllers');
const router = express.Router();

router.post('/portfolio', controllers.createPortfolio);
router.get('/portfolio/:userId', controllers.getPortfolio);
router.put('/portfolio/:portfolioId', controllers.updatePortfolio);
router.get('/portfolio/:portfolioId/allocation', controllers.getAssetAllocation);

router.post('/trade', controllers.createTrade);
router.put('/trade/:tradeId/execute', controllers.executeTrade);
router.get('/trades/:portfolioId', controllers.getTrades);

router.get('/rebalancer/:portfolioId/suggest', controllers.suggestRebalancing);
router.post('/rebalancer/:portfolioId/automate', controllers.automateRebalancing);

module.exports = router;
