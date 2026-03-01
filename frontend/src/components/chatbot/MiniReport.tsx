import { MiniReportData } from "./chatbot.types";

interface MiniReportProps {
  data: MiniReportData;
}

const MiniReport = ({ data }: MiniReportProps) => {
  const { expenses, income, savings, pattern } = data;

  const patternColor =
    pattern === "safe"
      ? "text-green-600"
      : pattern === "impulsive"
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div
      className="
        mt-2
        rounded-lg
        border
        border-slate-200 dark:border-slate-700
        bg-slate-50 dark:bg-slate-800
        p-3
        text-xs
      "
    >
      <div className="font-semibold mb-2">📊 Monthly Snapshot</div>

      <div className="grid grid-cols-2 gap-y-1">
        <span>Expenses</span>
        <span className="text-right">₹{expenses}</span>

        <span>Income</span>
        <span className="text-right">₹{income}</span>

        <span>Savings</span>
        <span className="text-right">₹{savings}</span>
      </div>

      <div className="mt-2 flex justify-between items-center">
        <span>Pattern</span>
        <span className={`font-semibold ${patternColor}`}>{pattern}</span>
      </div>
    </div>
  );
};

export default MiniReport;
