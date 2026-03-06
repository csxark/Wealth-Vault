import cron from 'node-cron';
import anomalyScanner from '../services/anomalyScanner.js';
import { logInfo, logError } from '../utils/logger.js';
import eventBus from '../events/eventBus.js';

/**
 * Market Monitoring Daemon (L3)
 * Recurring worker that simulates high-frequency market data ingestion to test hedging rules.
 */
class MarketMonitor {
    constructor() {
        this.assetsToTrack = ['BTC', 'ETH', 'GOLD', 'NASDAQ'];
        this.isRunning = false;
    }

    /**
     * Start the real-time monitoring simulation
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        logInfo('[Market Monitor] Initializing high-frequency anomaly tracking...');

        // In a real system, this would be a WebSocket listener.
        // For Wealth-Vault, we simulate ticks every 60 seconds.
        cron.schedule('* * * * *', async () => {
            await this.ingestMarketTicks();
        });
    }

    /**
     * Simulate price ingestion
     */
    async ingestMarketTicks() {
        try {
            for (const asset of this.assetsToTrack) {
                // Simulate a price with occasional spikes
                const basePrice = this.getBasePrice(asset);
                const volatility = 0.02;
                const randomShift = (Math.random() - 0.5) * 2 * volatility;

                // 5% chance of a "Black Swan" price crash in simulation
                const spike = Math.random() < 0.05 ? -0.15 : 0;

                const simulatedPrice = basePrice * (1 + randomShift + spike);

                await anomalyScanner.scanAsset(asset, simulatedPrice);

                // Emit market volatility event for the Autopilot WorkflowEngine
                // Volatility > 20% simulated via spike presence or large random shift
                const effectiveVolatility = Math.abs(randomShift + spike) * 100;
                if (effectiveVolatility > 5) {
                    // Broadcast system-wide — WorkflowEngine will fan-out per userId
                    eventBus.emit('MARKET_VOLATILITY_CHANGE', {
                        userId: 'system', // System-level broadcast; WorkflowDaemon handles per-user
                        asset,
                        value: effectiveVolatility,
                        simulatedPrice,
                        isSpike: spike !== 0,
                    });
                    // VIX proxy for macro triggers
                    if (effectiveVolatility > 15) {
                        eventBus.emit('MACRO_VIX_UPDATE', {
                            userId: 'system',
                            asset,
                            value: effectiveVolatility,
                            severity: effectiveVolatility > 20 ? 'critical' : 'warning',
                        });
                    }
                }
            }
        } catch (error) {
            logError('[Market Monitor] Tick ingestion failed:', error);
        }
    }

    /**
     * Helper to get baseline prices for simulation
     */
    getBasePrice(asset) {
        const prices = {
            'BTC': 65000,
            'ETH': 3500,
            'GOLD': 2300,
            'NASDAQ': 18000
        };
        return prices[asset] || 100;
    }
}

export default new MarketMonitor();
