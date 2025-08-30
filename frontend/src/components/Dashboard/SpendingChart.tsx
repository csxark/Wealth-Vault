import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);
interface SpendingChartProps {
  data: { label: string; value: number }[];
  chartType: 'doughnut' | 'bar';
}

const SpendingChart: React.FC<SpendingChartProps> = ({ data, chartType }) => {
  const chartData = {
    labels: data.map(d => d.label),
    datasets: [
      {
        label: 'Spending',
        data: data.map(d => d.value),
        backgroundColor: [
          '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
        ],
        borderWidth: 1,
      },
    ],
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '2rem', borderRadius: '8px', textAlign: 'center' }}>
      <h3>Spending Chart ({chartType})</h3>
      {chartType === 'doughnut' ? (
        <Doughnut data={chartData} />
      ) : (
        <Bar data={chartData} />
      )}
    </div>
  );
};

export default SpendingChart;
