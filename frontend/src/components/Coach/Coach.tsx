import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Zap, DollarSign, TrendingDown } from 'lucide-react';
import type { ChatMessage } from '../../types';
import { fetchGeminiResponse } from '../../services/gemini';

const quickReplies = [
  { text: "Help me reduce impulsive spending", icon: TrendingDown },
  { text: "Set a savings goal", icon: DollarSign },
  { text: "Analyze my spending patterns", icon: Zap },
];

export const Coach: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load messages from localStorage
    const savedMessages = localStorage.getItem('coach-messages');
    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    } else {
      // Welcome message
      const welcomeMessage: ChatMessage = {
    _id: '1',
        content: "Hi! I'm your financial wellness coach. I'm here to help you build healthier spending habits and achieve your financial goals. How can I support you today?",
        isUser: false,
        timestamp: new Date().toISOString()
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  useEffect(() => {
    // Save messages to localStorage
    if (messages.length > 0) {
      localStorage.setItem('coach-messages', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // Async Gemini response
  const generateGeminiResponse = async (userMessage: string): Promise<string> => {
    // Optionally, you can add prompt engineering here
    return await fetchGeminiResponse(userMessage);
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: ChatMessage = {
      _id: Date.now().toString(),
      content: content.trim(),
      isUser: true,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Get Gemini response
    const geminiReply = await generateGeminiResponse(content);
    const botResponse: ChatMessage = {
      _id: (Date.now() + 1).toString(),
      content: geminiReply,
      isUser: false,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, botResponse]);
    setIsTyping(false);
  };

  const handleQuickReply = (reply: string) => {
    handleSendMessage(reply);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto my-9 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
      <div className="p-4 border-b border-slate-200/50 dark:border-slate-700/50 bg-gradient-to-r from-blue-900 via-blue-800 to-cyan-600 rounded-t-2xl">
        <div className="flex items-center">
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl shadow-inner ring-1 ring-white/20">
            <Bot className="h-7 w-7 text-white/90" />
          </div>
          <div className="ml-4">
            <h2 className="text-xl font-bold text-white tracking-tight">AI Financial Coach</h2>
            <p className="text-cyan-100/90 text-sm mt-1 font-medium">Your personal guide to financial wellness</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message._id}
            className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex items-start space-x-3 max-w-[85%] ${message.isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`p-2.5 rounded-full ${message.isUser ? 'bg-cyan-600' : 'bg-slate-100 dark:bg-slate-700'}`}>
                {message.isUser ? (
                  <User className="h-5 w-5 text-white" />
                ) : (
                  <Bot className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                )}
              </div>
              <div
                className={`p-4 rounded-2xl shadow-sm ${
                  message.isUser
                    ? 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white ring-1 ring-white/10'
                    : 'bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-700'
                }`}
              >
                <p className="text-sm leading-relaxed font-medium">{message.content}</p>
                <p className={`text-xs mt-2 ${message.isUser ? 'text-cyan-100/80' : 'text-slate-500 dark:text-slate-400'}`}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-full bg-slate-50 dark:bg-slate-700/50 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 backdrop-blur-sm">
                <Bot className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-2xl">
                <div className="flex space-x-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={`dot-${i}`}
                      className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && (
        <div className="px-6 py-5 border-t border-slate-200/50 dark:border-slate-700/50">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4">Quick start:</p>
          <div className="flex flex-wrap gap-3">
            {quickReplies.map((reply, index) => {
              const Icon = reply.icon;
              return (
                <button
                  key={index}
                  onClick={() => handleQuickReply(reply.text)}
                  className="flex items-center space-x-2.5 px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-600/50 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 backdrop-blur-sm hover:shadow-md"
                >
                  <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-700 dark:text-slate-300">{reply.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-6 py-5 border-t border-slate-200/50 dark:border-slate-700/50">
        <div className="flex space-x-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
            placeholder="Ask me about your finances..."
            className="flex-1 px-5 py-3.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200 text-base font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm hover:shadow-md backdrop-blur-sm"
          />
          <button
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isTyping}
            className="px-5 py-3.5 bg-gradient-to-r from-blue-900 via-blue-800 to-cyan-600 text-white rounded-xl hover:from-blue-800 hover:via-blue-700 hover:to-cyan-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};