import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Zap, DollarSign, TrendingDown } from 'lucide-react';
import type { ChatMessage } from '../../types';

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
        id: '1',
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

  const generateResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('impulsive') || lowerMessage.includes('impulse')) {
      return "I understand you'd like to work on impulsive spending. Here are some strategies: Try the 24-hour rule - wait a day before making non-essential purchases. Create a 'wants vs needs' list, and consider setting up automatic transfers to savings right after payday to reduce available spending money.";
    }
    
    if (lowerMessage.includes('goal') || lowerMessage.includes('save')) {
      return "Setting savings goals is powerful for financial wellness! Start with SMART goals - Specific, Measurable, Achievable, Relevant, and Time-bound. Would you like help creating a specific savings goal? I can guide you through breaking it down into manageable monthly targets.";
    }
    
    if (lowerMessage.includes('pattern') || lowerMessage.includes('analyze') || lowerMessage.includes('spending')) {
      return "Based on your spending patterns, I can see you're doing well with safe spending! To improve further, try categorizing each purchase as 'essential', 'beneficial', or 'impulsive' before buying. This mindful approach can help reduce anxiety-driven purchases.";
    }
    
    if (lowerMessage.includes('anxious') || lowerMessage.includes('anxiety')) {
      return "Financial anxiety is common and manageable. Try these techniques: Set up automatic bill payments to reduce worry, create a small emergency fund even if it's just $100 to start, and practice the 5-4-3-2-1 grounding technique when feeling overwhelmed about money decisions.";
    }
    
    return "That's a thoughtful question! I'd recommend starting with small, consistent changes to your financial habits. Whether it's tracking daily expenses, setting up automatic savings, or practicing mindful spending, small steps lead to lasting change. What specific area would you like to focus on first?";
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: content.trim(),
      isUser: true,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      const botResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: generateResponse(content),
        isUser: false,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const handleQuickReply = (reply: string) => {
    handleSendMessage(reply);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-900 to-cyan-600 rounded-t-xl">
        <div className="flex items-center">
          <div className="bg-white/20 p-2 rounded-lg">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div className="ml-3">
            <h2 className="text-lg font-semibold text-white">AI Financial Coach</h2>
            <p className="text-cyan-100 text-sm">Your personal guide to financial wellness</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex items-start space-x-2 max-w-[80%] ${message.isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`p-2 rounded-full ${message.isUser ? 'bg-cyan-600' : 'bg-slate-100'}`}>
                {message.isUser ? (
                  <User className="h-4 w-4 text-white" />
                ) : (
                  <Bot className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                )}
              </div>
              <div
                className={`p-3 rounded-2xl ${
                  message.isUser
                    ? 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
                <p className={`text-xs mt-1 ${message.isUser ? 'text-cyan-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-start space-x-2">
              <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-700">
                <Bot className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-2xl">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Quick start:</p>
          <div className="flex flex-wrap gap-2">
            {quickReplies.map((reply, index) => {
              const Icon = reply.icon;
              return (
                <button
                  key={index}
                  onClick={() => handleQuickReply(reply.text)}
                  className="flex items-center space-x-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm transition-colors"
                >
                  <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-700 dark:text-slate-300">{reply.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
            placeholder="Ask me about your finances..."
            className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          />
          <button
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isTyping}
            className="px-4 py-3 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};