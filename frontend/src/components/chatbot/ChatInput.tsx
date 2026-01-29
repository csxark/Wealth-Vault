import { useState } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, disabled = false }: ChatInputProps) => {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setText("");
  };

  return (
    <div
      className="
        border-t
        border-slate-200 dark:border-slate-700
        px-3 py-2
        bg-white dark:bg-slate-900
        flex items-center gap-2
      "
    >
      <input
        type="text"
        placeholder="Ask about your spending…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={disabled}
        className="
          flex-1
          bg-transparent
          outline-none
          text-sm
          placeholder:text-slate-400
          disabled:opacity-60
        "
      />

      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        aria-label="Send message"
        className="
          p-2 rounded-md
          bg-emerald-500
          text-white
          disabled:opacity-50
          disabled:cursor-not-allowed
          transition
        "
      >
        <Send size={16} />
      </button>
    </div>
  );
};

export default ChatInput;
