# 🏦 Inter-Vault Settlement Engine & P2P Ledger

A high-integrity financial movement layer built for **Wealth-Vault**, ensuring that every internal movement of funds is backed by a verifiable double-entry ledger.

## 🏗 System Architecture

### 1. Internal Ledger (`ledgerTracker.js`)
The "Source of Truth" for all fund movements.
*   **Double-Entry Principles**: Every debit from a vault/user is recorded with a corresponding credit or balancing entry.
*   **Balance Immutability**: The `balanceAfter` field in each ledger entry ensures we can reconstruct a vault's history at any point in time.
*   **Rollback Safety**: Integrated with database transactions via `LedgerTracker`.

### 2. Settlement Engine (`settlementEngine.js`)
Handles the complex logic of moving money between distinct logical units.
*   **Atomic Transactions**: Inter-vault settlements are wrapped in `db.transaction`. If the debit fails (e.g., insufficient funds), the credit never happens.
*   **P2P Orchestration**: Manages the multi-user flow of requesting funds and settling them across user boundaries.

### 3. Safety & Integrity (`ledgerReconciler.js`)
*   **System Reconciler**: A midnight job that mathematically verifies that `SUM(LedgerEntries) == CurrentVaultBalance`.
*   **Variance Detection**: Logs critical errors if even a single cent of drift is detected between the ledger and the balance cache.

---

## 🛠 Database Schema

| Table | Purpose |
| :--- | :--- |
| `internal_ledger` | Historical sequence of all debits and credits. |
| `settlements` | Tracking the state and execution of inter-vault moves. |
| `p2p_requests` | Social layer for users to request and transfer funds to peers. |

---

## 📡 API Reference

### Internal Movements
*   `POST /api/vault-settlements/internal`: Execute an atomic move between your own vaults.
*   `GET /api/vault-settlements/ledger`: View your forensic accounting logs.

### P2P (Peer-to-Peer)
*   `POST /api/vault-settlements/p2p/request`: Request funds from another user.
*   `POST /api/vault-settlements/p2p/settle/:id`: Accept and settle an incoming fund request.

---

## 🔒 Security Guards
*   **Ownership Verification**: Users can only debit vaults they own or have explicit 'contributor' roles in.
*   **Balance Validation**: The `settlementValidator.js` prevents any transaction that would result in a negative vault balance.
*   **Atomic Locking**: Prevents race conditions during high-concurrency transfers.

---
*Ensuring financial integrity through forensic ledgering.*
