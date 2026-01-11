import React from "react";

const FAQSection: React.FC = () => {
  const faqs = [
    {
      q: "Is Wealth Vault free to use?",
      a: "Yes! You can start with all core features for free. Premium plans unlock advanced analytics and AI insights.",
    },
    {
      q: "Is my financial data secure?",
      a: "Absolutely. We use industry-standard encryption and secure storage to protect all your data.",
    },
    {
      q: "Can I track expenses in multiple currencies?",
      a: "Yes. Wealth Vault supports multiple currencies with real-time conversion.",
    },
    {
      q: "How does the AI advisor help me?",
      a: "The AI analyzes your spending habits and suggests smarter ways to save, invest, and manage money.",
    },
    {
      q: "Can I export my data?",
      a: "Yes, you can export your expense data anytime in CSV format.",
    },
  ];

  const [open, setOpen] = React.useState<number | null>(null);

  return (
    <section className="w-full py-24 px-6 bg-white dark:bg-slate-900">
      <div className="max-w-4xl mx-auto">
        <h3 className="text-4xl font-bold text-center mb-12 dark:text-slate-50">
          Frequently Asked Questions
        </h3>

        <div className="space-y-4">
          {faqs.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950  dark:text-white overflow-hidden transition"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 transition"
              >
                <span>{item.q}</span>
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-full border transition ${
                    open === i
                      ? "rotate-45 bg-[color:var(--accent)] text-white border-[color:var(--accent)]"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                >
                  +
                </span>
              </button>

              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden px-6 pb-5 text-slate-600 dark:text-slate-400">
                  {item.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;