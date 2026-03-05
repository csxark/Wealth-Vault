import db from '../config/db.js';
import taxLotService from '../services/taxLotService.js';
import washSaleTracker from '../services/washSaleTracker.js';
import taxHarvestEngine from '../services/taxHarvestEngine.js';
import taxComplianceGuard from '../services/taxComplianceGuard.js';
import { users, vaults, portfolios, taxLots, washSaleWindows, harvestEvents } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Diagnostic Script for #482
 * Advanced Multi-Entity Workflow Simulation
 */
async function runDiagnostic() {
    console.log('🧪 Starting Advanced Tax Harvest Diagnostic...');

    try {
        // 1. Setup Test Data
        const [testUser] = await db.select().from(users).limit(1);
        const userVaults = await db.select().from(vaults).where(eq(vaults.ownerId, testUser.id)).limit(2);
        const [portfolio] = await db.select().from(portfolios).where(eq(portfolios.userId, testUser.id)).limit(1);

        if (!testUser || userVaults.length < 2 || !portfolio) {
            console.error('❌ Diagnostic failed: Need at least 2 vaults for multi-entity simulation.');
            process.exit(1);
        }

        const [personalVault, trustVault] = userVaults;
        console.log(`👤 User: ${testUser.id} | Entities: Personal(${personalVault.id}), Trust(${trustVault.id})`);

        // 2. Clear previous diagnostic data to ensure clean run
        await db.delete(taxLots).where(eq(taxLots.userId, testUser.id));
        await db.delete(washSaleWindows).where(eq(washSaleWindows.userId, testUser.id));
        await db.delete(harvestEvents).where(eq(harvestEvents.userId, testUser.id));

        // 3. Record lots across entities
        console.log('📝 Seeding lots across entities...');
        // Personal Vault: VTI bought at 250
        await taxLotService.recordPurchase(testUser.id, portfolio.id, personalVault.id, 'VTI', 10, 250.00, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000));
        // Trust Vault: VTI bought at 245
        await taxLotService.recordPurchase(testUser.id, portfolio.id, trustVault.id, 'VTI', 20, 245.00, new Date(Date.now() - 45 * 24 * 60 * 60 * 1000));

        // 4. Scan assuming market is now 200
        console.log('🔍 Scanning multi-entity opportunities (Market: $200)...');
        const currentPrices = { 'VTI': 200.00, 'SPY': 450.00 };
        const opps = await taxHarvestEngine.scanOpportunities(testUser.id, currentPrices);
        console.log(`✅ Identified ${opps.length} opportunities.`);

        if (opps.length > 0) {
            const vtiOpp = opps.find(o => o.assetSymbol === 'VTI');
            console.log(`📊 Aggregated VTI Loss: ${vtiOpp.totalLoss} USD across ${vtiOpp.involvedVaults.length} vaults.`);

            // 5. Test Compliance Guard (Pre-Harvest)
            const guard1 = await taxComplianceGuard.evaluatePurchaseSafe(testUser.id, 'VTI', trustVault.id);
            console.log(`🛡️ Guard check for VTI in Trust (Pre-Harvest): ${guard1.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌'}`);

            // 6. Execute Coordinated Harvest
            console.log('⚡ Executing coordinated harvest...');
            const result = await taxHarvestEngine.executeCoordinatedHarvest(testUser.id, 'VTI', 200.00);
            console.log(`🎉 Result: ${result.message} | Total Loss: ${result.totalLoss}`);

            // 7. Test Compliance Guard (Post-Harvest) - Direct Match
            const guard2 = await taxComplianceGuard.evaluatePurchaseSafe(testUser.id, 'VTI', personalVault.id);
            console.log(`🛡️ Guard check for VTI in Personal (Post-Harvest): ${guard2.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌ (' + guard2.reason + ')'}`);

            // 8. Test Substantially Identical Logic
            console.log('🧪 Testing "Substantially Identical" (Wash-Sale Proxy) detection...');
            // Simulating a window for SPY to test VOO
            await washSaleTracker.registerHarvestEvent(testUser.id, 'SPY');
            const guard3 = await taxComplianceGuard.evaluatePurchaseSafe(testUser.id, 'VOO', personalVault.id);
            console.log(`🛡️ Guard check for VOO (Proxy of SPY): ${guard3.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌ (' + guard3.reason + ')'}`);
        }

        console.log('✨ Advanced Diagnostic completed.');
        process.exit(0);

    } catch (err) {
        console.error('❌ Diagnostic error:', err);
        process.exit(1);
    }
}

runDiagnostic();
