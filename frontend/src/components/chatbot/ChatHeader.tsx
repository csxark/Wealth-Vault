import { X } from "lucide-react";

interface ChatHeaderProps {
  title?: string;
  onClose: () => void;
}

const ChatHeader = ({
  title = "Wealth Vault Assistant",
  onClose,
}: ChatHeaderProps) => {
  return (
    <div
      className="
        flex items-center justify-between
        px-4 py-3
        border-b
        border-slate-200 dark:border-slate-700
        bg-white dark:bg-slate-900
      "
    >
      <span className="font-semibold text-sm">{title}</span>

      <button
        onClick={onClose}
        aria-label="Close chatbot"
        className="
          opacity-70
          hover:opacity-100
          transition
        "
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default ChatHeader;
