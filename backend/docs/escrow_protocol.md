# Real-Time Multi-Party Trust & Escrow Settlement Protocol (#443)

## Overview
This protocol implements a sophisticated Smart Escrow engine within Wealth-Vault to handle high-trust transactions such as P2P lending, real estate earnest money, and automated inheritance succession. It utilizes a combination of multi-signature consensus and external Oracles to ensure that funds are only released when specific, verifiable conditions are met.

## Key Components

### 1. Smart Escrow Engine (`services/escrowEngine.js`)
The core logic resides here. It manages the lifecycle of an escrow contract:
- **Drafting**: Defining parties, amounts, and release conditions with real-time risk assessment.
- **Activation**: Locking the specified amount in a institutional vault using the Lien/Lock system.
- **Verification**: Evaluating signatures and oracle events.
- **Settlement**: Automated release to the payee or refund to the payer.

### 2. Multi-Party Oracle Service (`services/oracleService.js`)
Integrates with external real-world events. In this implementation, it simulates detection and verification of:
- Property registrations (via County Clerk simulations)
- Death certificates (for succession protocols)
- Loan repayment confirmation

### 3. Vault Lien & Lock System (`services/vaultService.js`)
Modified to support "virtual locks" on portions of vault balances. This prevents double-spending or unauthorized withdrawals of funds currently committed to an escrow contract, without requiring separate hardware-locked accounts for every small transaction.

### 4. Cryptographic Consensus (`utils/cryptoUtils.js`)
Uses RSA-SHA256 signatures to verify that all required parties have explicitly approved a release. This ensures that even if the backend is compromised, funds cannot be released without the valid cryptographic signatures of the participants.

### 5. Dispute & Arbitration (`services/escrowDisputeService.js`)
Provides a formal mechanism for resolving conflicts. If a transaction goes wrong, parties can open a dispute which freezes the escrow state and allows for manual arbitration or automated split resolutions based on evidence metadata.

## Workflow

1.  **Drafting**: A user creates an escrow proposal at `/api/escrow/draft`.
2.  **Activation**: The payer calls `/api/escrow/:id/activate`, triggering the vault lock.
3.  **Monitoring**: The `oracleSync` job (`jobs/oracleSync.js`) runs hourly to check for external triggers.
4.  **Signature Submission**: Parties can submit their approval signatures via `/api/escrow/:id/sign`.
5.  **Auto-Settlement**: Once threshold is reached (e.g., 2/2 sigs or 1 oracle event), the system calls `vaultService.releaseLock()` and updates the ledger.

## Security Controls
- **Escrow Validator**: Middleware enforces that only involved parties can interact with specific contracts.
- **Threshold Logic**: Prevents partial releases unless explicit consensus rules are met.
- **Audit Logging**: All state transitions and signature submissions are captured in the system's global audit trail.

## Database Schema Highlights
- `escrow_contracts`: Stores the master terms and state.
- `oracle_events`: Immutable log of verified external facts.
- `escrow_signatures`: Cryptographically verified participation proofs.
- `vault_locks`: Real-time ledger of committed funds.
- `escrow_disputes`: Formal conflict resolution records.

---
*Developed for Wealth-Vault Institutional Ledger System - Issue #443*
