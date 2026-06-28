/**
 * Debt Reduction Advisor UI Hook Example
 * Simulates a frontend integration for debt analysis and alert display
 */
// This is a mockup for how a React component might interact with the DebtReductionAdvisor API
import React, { useState } from 'react';
import axios from 'axios';

function DebtAdvisorWidget() {
    const [debts, setDebts] = useState([
        { id: 'd1', amount: 5000, interestRate: 0.18, minPayment: 100, dueDate: '2026-03-01', lender: 'BankA' },
        { id: 'd2', amount: 2000, interestRate: 0.12, minPayment: 50, dueDate: '2026-03-10', lender: 'BankB' },
        { id: 'd3', amount: 800, interestRate: 0.22, minPayment: 25, dueDate: '2026-02-28', lender: 'BankC' }
    ]);
    const [payments, setPayments] = useState({ d1: 2500, d2: 2000, d3: 0 });
    const [strategy, setStrategy] = useState('avalanche');
    const [alerts, setAlerts] = useState([]);
    const [order, setOrder] = useState([]);

    const userId = 'user123';

    const getRecommendation = async () => {
        const res = await axios.post('/api/debt-advisor/recommend', { debts, strategy });
        setOrder(res.data.recommendedOrder);
    };

    const trackProgress = async () => {
        const res = await axios.post('/api/debt-advisor/track', { debts, payments, userId });
        setAlerts(res.data.alerts);
    };

    return (
        <div>
            <h2>Debt Reduction Advisor</h2>
            <div>
                <label>Strategy: </label>
                <select value={strategy} onChange={e => setStrategy(e.target.value)}>
                    <option value="avalanche">Avalanche</option>
                    <option value="snowball">Snowball</option>
                </select>
                <button onClick={getRecommendation}>Recommend Order</button>
            </div>
            <div>
                <h3>Recommended Repayment Order</h3>
                <ul>
                    {order.map(debt => (
                        <li key={debt.id}>{debt.lender}: ${debt.amount} @ {debt.interestRate * 100}%</li>
                    ))}
                </ul>
            </div>
            <div>
                <button onClick={trackProgress}>Track Progress & Alerts</button>
                <h3>Alerts</h3>
                <ul>
                    {alerts.map((alert, idx) => (
                        <li key={idx}>{alert.message}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default DebtAdvisorWidget;
