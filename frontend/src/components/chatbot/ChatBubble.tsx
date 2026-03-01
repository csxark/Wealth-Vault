import { ChatMessage } from "./chatbot.types";
import MiniReport from "./MiniReport";

interface ChatBubbleProps {
  message: ChatMessage;
}

const ChatBubble = ({ message }: ChatBubbleProps) => {
  const isUser = message.role === "user";

  return (
    <div
      className={`
        flex w-full mb-3
        ${isUser ? "justify-end" : "justify-start"}
      `}
    >
      <div
        className={`
          max-w-[75%]
          rounded-lg
          px-3 py-2
          text-sm
          leading-relaxed
          shadow-sm
          ${
            isUser
              ? "bg-emerald-500 text-white rounded-br-none"
              : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none"
          }
        `}
      >
        <div className="whitespace-pre-line">{message.content}</div>

        {message.miniReport && <MiniReport data={message.miniReport} />}
      </div>
    </div>
  );
};

export default ChatBubble;
