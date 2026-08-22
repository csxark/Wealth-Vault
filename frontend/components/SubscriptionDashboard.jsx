// SubscriptionDashboard.jsx
// Dynamic Subscription Management Dashboard UI (React)

import React, { useEffect, useState } from 'react';
import axios from 'axios';

function SubscriptionDashboard() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await axios.get('/subscriptions/dashboard', {
          headers: { 'x-user-id': 'demoUser' }
        });
        setSubscriptions(res.data.subscriptions);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleCancel = async (merchant, amount) => {
    await axios.post('/subscriptions/cancel', { merchant, amount });
    alert(`Cancelled subscription: ${merchant}`);
  };

  const handleNegotiate = async (merchant, amount) => {
    await axios.post('/subscriptions/negotiate', { merchant, amount });
    alert(`Negotiation started for: ${merchant}`);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="dashboard">
      <h2>Subscription Management Dashboard</h2>
      <table>
        <thead>
          <tr>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Frequency</th>
            <th>Action</th>
            <th>Manage</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub, idx) => (
            <tr key={idx}>
              <td>{sub.merchant}</td>
              <td>{sub.amount}</td>
              <td>{sub.category}</td>
              <td>{sub.frequency}</td>
              <td>{sub.action}</td>
              <td>
                {sub.action === 'cancel' && (
                  <button onClick={() => handleCancel(sub.merchant, sub.amount)}>Cancel</button>
                )}
                {sub.action === 'negotiate' && (
                  <button onClick={() => handleNegotiate(sub.merchant, sub.amount)}>Negotiate</button>
                )}
                {sub.action === 'review' && (
                  <button disabled>Review</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SubscriptionDashboard;
