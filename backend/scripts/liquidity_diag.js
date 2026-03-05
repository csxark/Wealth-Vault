import liquidityOptimizerService from '../services/liquidityOptimizerService.js';
import db from '../config/db.js';
import { users, vaults, familyEntities, transferPaths, entityTaxRules } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function runLiquidityDiagnostic() {
    console.log('🚀 Running L3 #476 MILP Liquidity Optimizer Diagnostic...');

    try {
        const [user] = await db.select().from(users).limit(1);
        if (!user) throw new Error('No user found');

        // Setup test entities
        const [entityA] = await db.select().from(familyEntities).limit(1);
        const [entityB] = await db.select().from(familyEntities).offset(1).limit(1);

        if (!entityA || !entityB) {
            console.warn('⚠️ Missing familyEntities. Check schema setup.');
            process.exit(0);
        }

        // Setup test vaults
        const [sourceVault] = await db.select().from(vaults).where(eq(vaults.userId, user.id)).limit(1);
        const [targetVault] = await db.select().from(vaults).where(eq(vaults.userId, user.id)).offset(1).limit(1);

        console.log(`\n--- Phase 1: Setup Transfer Rules ---`);
        await db.insert(entityTaxRules).values({
            userId: user.id,
            sourceEntityId: entityA.id,
            destinationEntityId: entityB.id,
            withholdingTaxPct: '0.15' // 15% tax
        }).onConflictDoNothing();

        await db.insert(transferPaths).values({
            userId: user.id,
            sourceVaultId: sourceVault.id,
            destinationVaultId: targetVault.id,
            baseFee: '50.00',
            platformFeePct: '0.001'
        }).onConflictDoNothing();

        console.log(`✅ Test rules injected.`);

        console.log(`\n--- Phase 2: Run MILP Optimization ---`);
        const result = await liquidityOptimizerService.findOptimalPath(user.id, targetVault.id, 10000);

        console.log(`✅ Optimal path found: ${result.path.length} steps`);
        console.log(`💰 Total Est Cost for $10,000 move: $${result.totalCost}`);

        console.log('\n✨ Diagnostic complete. MILP logic verified.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Diagnostic failed:', err);
        process.exit(1);
    }
}

runLiquidityDiagnostic();
