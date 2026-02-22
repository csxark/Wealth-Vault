import escrowEngine from './services/escrowEngine.js';
import oracleService from './services/oracleService.js';
import vaultService from './services/vaultService.js';
import db from './config/db.js';
import { users, vaults } from './db/schema.js';
import cryptoUtils from './utils/cryptoUtils.js';

/**
 * Escrow Simulation Test Script
 * Verifies the full flow: Draft -> Activate -> Oracle Event -> Release
 */
async function runEscrowTest() {
    console.log('🚀 Starting Escrow Settlement Protocol Test...');

    try {
        // 1. Setup Mock Data
        const [testUser] = await db.select().from(users).limit(1);
        const [testVault] = await db.select().from(vaults).where(eq(vaults.ownerId, testUser.id)).limit(1);

        if (!testUser || !testVault) {
            console.error('❌ Test requires at least one user and one vault in DB');
            return;
        }

        console.log(`👤 Using User: ${testUser.email}`);
        console.log(`🏦 Using Vault: ${testVault.name}`);

        // 2. Draft Contract
        const draftData = {
            payerId: testUser.id,
            payeeId: '00000000-0000-0000-0000-000000000000', // Mock Payee
            vaultId: testVault.id,
            amount: 500.00,
            currency: 'USD',
            escrowType: 'real_estate',
            releaseConditions: {
                type: 'oracle_event',
                eventType: 'property_registration',
                externalId: 'PROP-999'
            }
        };

        const contract = await escrowEngine.draftContract(testUser.id, draftData);
        console.log('✅ Contract Drafted:', contract.id);

        // 3. Activate Contract (Locks funds)
        const activeContract = await escrowEngine.activateContract(contract.id, testUser.id);
        console.log('🔒 Contract Activated & Funds Locked');

        // Check available balance
        const available = await vaultService.getAvailableBalance(testVault.id);
        console.log(`💰 Available Balance after lock: ${available}`);

        // 4. Simulate Oracle Detection
        console.log('📡 Simulating External Oracle Event...');
        const event = await oracleService.detectExternalEvent(
            'property_registration',
            'county_clerk',
            'PROP-999',
            { registration_status: 'completed' }
        );

        // 5. Verify Event
        await oracleService.verifyEvent(event.id);
        console.log('✅ Oracle Event Verified');

        // 6. Evaluate Conditions (Release)
        await escrowEngine.evaluateReleaseConditions(contract.id);

        // 7. Final Check
        const finalContract = await db.query.escrowContracts.findFirst({
            where: eq(escrowContracts.id, contract.id)
        });

        if (finalContract.status === 'released') {
            console.log('🎊 SUCCESS: Escrow released automatically via Oracle!');
        } else {
            console.log('⚠️ Escrow status:', finalContract.status);
        }

    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        // process.exit();
    }
}

// runEscrowTest();
