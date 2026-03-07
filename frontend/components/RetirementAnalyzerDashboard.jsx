// RetirementAnalyzerDashboard.jsx
// Personalized Retirement Readiness Analyzer Dashboard UI (React)

import React, { useState } from 'react';
import axios from 'axios';

function RetirementAnalyzerDashboard() {
  const [params, setParams] = useState({
    retirementAge: 65,
    desiredLifestyle: { annualExpenses: 40000 },
    inflationRate: 0.03,
    investmentGrowthRate: 0.06,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'annualExpenses') {
      setParams({
        ...params,
        desiredLifestyle: { ...params.desiredLifestyle, annualExpenses: Number(value) },
      });
    } else {
      setParams({ ...params, [name]: Number(value) });
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/retirement/analyze', params, {
        headers: { 'x-user-id': 'demoUser' }
      });
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="analyzer-dashboard">
      <h2>Retirement Readiness Analyzer</h2>
      <div className="input-section">
        <label>Retirement Age: <input type="number" name="retirementAge" value={params.retirementAge} onChange={handleChange} /></label>
        <label>Annual Expenses: <input type="number" name="annualExpenses" value={params.desiredLifestyle.annualExpenses} onChange={handleChange} /></label>
        <label>Inflation Rate (%): <input type="number" name="inflationRate" value={params.inflationRate} step="0.01" onChange={handleChange} /></label>
        <label>Investment Growth Rate (%): <input type="number" name="investmentGrowthRate" value={params.investmentGrowthRate} step="0.01" onChange={handleChange} /></label>
        <button onClick={handleAnalyze} disabled={loading}>Analyze</button>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {result && (
        <div className="results-section">
          <h3>Profile</h3>
          <pre>{JSON.stringify(result.profile, null, 2)}</pre>
          <h3>Scenario</h3>
          <pre>{JSON.stringify(result.scenario, null, 2)}</pre>
          <h3>Projections</h3>
          <pre>{JSON.stringify(result.projections, null, 2)}</pre>
          <h3>Recommendations</h3>
          <ul>
            {result.recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default RetirementAnalyzerDashboard;
