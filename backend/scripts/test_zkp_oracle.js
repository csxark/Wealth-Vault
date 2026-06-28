import { db } from '../config/db.js';
import { users, successionPlans, successionHeartbeats } from '../db/schema.js';
import { successionHeartbeatService } from '../services/successionHeartbeatService.js';
import { publicRecordOracle } from '../services/publicRecordOracle.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function testOracleLogic() {
    console.log("--- Testing ZKP Proof-of-Life Oracle ---");

    try {
        // 1. Setup a test user that WILL trigger the oracle
        const oracleUserId = uuidv4();
        await db.insert(users).values({
            id: oracleUserId,
            email: `trigger_oracle_${Date.now()}@example.com`,
            password: 'hashed_password',
            firstName: 'Oracle',
            lastName: 'TestUser'
        });

        // 2. Setup a test user that will NOT trigger the oracle (normal grace period)
        const normalUserId = uuidv4();
        await db.insert(users).values({
            id: normalUserId,
            email: `normal_user_${Date.now()}@example.com`,
            password: 'hashed_password',
            firstName: 'Normal',
            lastName: 'TestUser'
        });

        // 3. Create succession plans for both, with old heartbeat dates
        const lastYear = new Date();
        lastYear.setFullYear(lastYear.getFullYear() - 1);

        await db.insert(successionPlans).values([
            {
                userId: oracleUserId,
                status: 'active',
                inactivityThresholdDays: 30,
                lastHeartbeatAt: lastYear
            },
            {
                userId: normalUserId,
                status: 'active',
                inactivityThresholdDays: 30,
                lastHeartbeatAt: lastYear
            }
        ]);

        console.log("Test data setup complete. Running sweep...");

        // 4. Run the sweep
        await successionHeartbeatService.sweepInactivity();

        // 5. Verify results
        const oraclePlan = await db.query.successionPlans.findFirst({
            where: eq(successionPlans.userId, oracleUserId)
        });

        const normalPlan = await db.query.successionPlans.findFirst({
            where: eq(successionPlans.userId, normalUserId)
        });

        console.log("\n--- Verification ---");
        console.log(`Oracle User (${oracleUserId}): Status = ${oraclePlan.status} (Expected: triggered)`);
        console.log(`  - Oracle Verified Death: ${oraclePlan.oracleVerifiedDeath}`);

        console.log(`Normal User (${normalUserId}): Status = ${normalPlan.status} (Expected: grace_period)`);
        console.log(`  - Oracle Verified Death: ${normalPlan.oracleVerifiedDeath}`);

        // 6. Test ZKP Verification specifically
        console.log("\nTesting ZKP Verification...");
        const zkpProof = {
            proof: "0xabc123...",
            signedByOracle: true,
            merkleRoot: "0x987..."
        };

        const zkpResult = await publicRecordOracle.verifyZKP(normalUserId, zkpProof);
        console.log(`ZKP Verification Result: ${zkpResult}`);

        const updatedNormalPlan = await db.query.successionPlans.findFirst({
            where: eq(successionPlans.userId, normalUserId)
        });
        console.log(`Updated Normal Plan Hash: ${updatedNormalPlan.zkpProofHash}`);

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        process.exit(0);
    }
}

testOracleLogic();
