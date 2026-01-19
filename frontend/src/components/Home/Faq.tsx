import React, { useState } from "react";
import { Plus, Minus } from "lucide-react";

const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0); 

  const faqs = [
    {
      q: "How is Wealth Vault different from other trackers?",
      a: "Most apps just tell you 'what' you spent. Wealth Vault focuses on 'Behavior-Aware Finance.' We help you identify the emotion behind the transaction—categorizing spending as Safe, Impulsive, or Anxious—so you can understand and change your habits."
    },
    {
      q: "What is 'Smart Spending Analysis'?",
      a: "This is our intelligent categorization engine. Instead of just sorting by merchant, it analyzes your patterns to flag transactions based on behavior. It helps you visualize how much of your budget is being consumed by emotional spending versus planned expenses."
    },
    {
      q: "Do I have to manually type in every transaction?",
      a: "No. We know friction kills consistency. You can use our QR Code Expense Entry feature to instantly log expenses via UPI scans, or import historical data directly via CSV files to get started in seconds."
    },
    {
      q: "What insights does the AI Financial Coach provide?",
      a: "It moves beyond simple charts. The AI actively monitors your spending behavior to detect patterns you might miss—such as 'anxious' spending trends on weekends or unused subscriptions—and offers personalized, actionable advice to help you reach your financial goals faster."
    },
    {
      q: "Is my financial data secure?",
      a: "Absolutely. Your data is protected with enterprise-grade encryption and secure authentication. We operate with a privacy-first mindset, ensuring your financial profile remains confidential."
    },
    {
      q: "I'm not an expert. Is this difficult to use?",
      a: "We designed the interface specifically for clarity. With visual analytics dashboards and a clean UI, you get deep insights without needing to be an accountant."
    }
  ];

  return (
    <section className="relative py-24 px-6 overflow-hidden bg-neutral-50/50 dark:bg-slate-900/50">
      {/* Background Decorative Blobs - Green/Teal Theme */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-teal-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-24">
          
          {/* Left Column: Sticky Title */}
          <div className="lg:col-span-4 space-y-8">
            <div className="sticky top-32">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
                Frequently Asked <span className="text-emerald-600 dark:text-emerald-400">Questions</span>
              </h2>
              <p className="text-lg text-neutral-600 dark:text-slate-400 mb-8 leading-relaxed">
                Everything you need to know about how Wealth Vault works, from AI features to data security.
              </p>
            </div>
          </div>

          {/* Right Column: The Accordion List */}
          <div className="lg:col-span-8 space-y-4">
            {faqs.map((item, i) => (
              <div
                key={i}
                className={`group rounded-2xl border transition-colors duration-200 ${
                  openIndex === i
                    ? "bg-white dark:bg-slate-800 border-emerald-500/30 shadow-sm"
                    : "bg-white/60 dark:bg-slate-900/60 border-neutral-200 dark:border-slate-800 hover:border-emerald-500/20"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full px-6 py-5 flex justify-between items-start text-left"
                >
                  <span className={`text-lg font-medium pr-8 ${
                    openIndex === i ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-800 dark:text-slate-200"
                  }`}>
                    {item.q}
                  </span>
                  <span className={`flex-shrink-0 mt-1 p-1 rounded-full border transition-all duration-200 ${
                    openIndex === i 
                      ? "bg-emerald-500 text-white border-emerald-500" 
                      : "bg-transparent text-neutral-400 border-neutral-200 dark:border-slate-700"
                  }`}>
                    {openIndex === i ? <Minus size={16} /> : <Plus size={16} />}
                  </span>
                </button>

                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    openIndex === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-6 pt-0 text-neutral-600 dark:text-slate-400 leading-relaxed">
                      {item.a}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;