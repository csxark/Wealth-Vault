import React, { useState } from 'react';
import QRExpenseModal from './QRExpenseModal';

interface AddExpenseButtonProps {
  onExpenseAdd: (expense: {
    amount: number;
    category: string;
    description?: string;
    merchantName?: string;
    upiId?: string;
  }) => void;
  label?: string;
  className?: string;
}

const AddExpenseButton: React.FC<AddExpenseButtonProps> = ({ 
  onExpenseAdd, 
  label = 'Add Expense', 
  className 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        className={className ? className : "bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 transition flex items-center space-x-2"}
        onClick={() => setIsModalOpen(true)}
      >
        <span>{label}</span>
      </button>

      <QRExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onExpenseAdd={onExpenseAdd}
      />
    </>
  );
};

export default AddExpenseButton;
