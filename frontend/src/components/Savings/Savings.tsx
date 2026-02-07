import React from 'react';
import SavingsSettings from './SavingsSettings';
import RoundUpHistory from './RoundUpHistory';

const Savings: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-950 px-2 sm:px-6 md:px-12 lg:px-24 py-8 transition-all">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-cyan-700 dark:text-cyan-400">
              Savings Round-Up
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Automatically save the difference when you spend. Every expense gets rounded up to help you build wealth effortlessly.
            </p>
          </div>
        </div>

        {/* Settings Section */}
        <div className="mb-8">
          <SavingsSettings />
        </div>

        {/* History Section */}
        <RoundUpHistory />
      </div>
    </div>
  );
};

export default Savings;
