import estateTaxStressTester from '../services/estateTaxStressTester.js';
import { connectDatabase } from '../config/db.js';
import { users } from '../db/schema.js';

async function testStressTester() {
    try {
        console.log("--- Testing Estate Tax Stress Tester ---");

        // 1. Initialize DB
        const db = await connectDatabase();

        // 2. Get a test user
        const allUsers = await db.select().from(users).limit(1);
        if (allUsers.length === 0) {
            console.error("No users found in database to test with.");
            return;
        }

        const testUser = allUsers[0];
        console.log(`Testing with user: ${testUser.id} (${testUser.email})`);

        // 3. Perform stress test
        const results = await estateTaxStressTester.performFullStressTest(testUser.id);

        console.log("\n--- Stress Test Results ---");
        console.log(`Total Wealth: $${results.totalWealthAtRisk.toLocaleString()}`);
        console.log(`Tax Liability: $${results.taxAnalysis.expectedTaxBurdenAtDeath.toLocaleString()}`);
        console.log(`Liquidity Status: ${results.liquidityAnalysis.status}`);
        console.log(`Liquidity Coverage Ratio: ${results.liquidityAnalysis.coverageRatio.toFixed(2)}x`);
        console.log(`Simulation P50 Wealth: $${results.simulationResults.p50Wealth.toLocaleString()}`);

        console.log("\n--- Recommendations ---");
        results.recommendations.forEach(r => console.log(`- ${r}`));

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        process.exit(0);
    }
}

testStressTester();
