import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js';
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
    <div className="border border-gray-300 p-8 rounded-lg text-center bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-50">
      <h3 className="text-2xl font-bold mb-4">
        Spending
      </h3>
      <div className="flex justify-center items-center h-80">
        {chartType === 'doughnut' ? (
          <Doughnut data={chartData} />
        ) : (
          <Bar data={chartData} />
        )}
      </div>
    </div>
  );
};

export default SpendingChart;
