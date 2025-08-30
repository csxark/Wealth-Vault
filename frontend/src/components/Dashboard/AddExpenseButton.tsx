import React from 'react';

// ...existing code...
// ...existing code...

const AddExpenseButton: React.FC<AddExpenseButtonProps> = ({ onClick, label = 'Add Expense', className }) => {
  return (
    <button
      className={className ? className : "bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 transition"}
      onClick={onClick}
    >
      {label}
    </button>
  );
};
interface AddExpenseButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export default AddExpenseButton;
