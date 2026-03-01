import { useState } from "react";
import ChatHeader from "./ChatHeader";
import ChatBubble from "./ChatBubble";
import ChatInput from "./ChatInput";
import { useChatbot } from "../../hooks/useChatbot";

const ChatWidget = () => {
  const [open, setOpen] = useState(false);
  const { messages, sendMessage, isLoading } = useChatbot();

  return (
    <>
      {/* Floating Open Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="
            fixed bottom-6 right-6
            z-[9999]
            w-14 h-14
            rounded-full
            bg-emerald-500
            text-white
            flex items-center justify-center
            shadow-xl
          "
        >
          💬
        </button>
      )}

      {/* Chat Container */}
      {open && (
        <div
          className="
            fixed bottom-6 right-6
            z-[9999]
            w-96 max-w-[92vw]
            h-[28rem]
            max-h-[80vh]
            rounded-xl
            bg-white dark:bg-slate-900
            text-slate-900 dark:text-slate-100
            border border-slate-200 dark:border-slate-700
            shadow-2xl
            flex flex-col
            overflow-hidden
          "
        >
          <ChatHeader onClose={() => setOpen(false)} />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}

            {isLoading && (
              <div className="text-xs opacity-60 mt-2">
                Assistant is typing…
              </div>
            )}
          </div>

          {/* Input */}
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      )}
    </>
  );
};

export default ChatWidget;
