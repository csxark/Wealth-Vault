import React from "react";

const FAQSection: React.FC = () => {
  const faqs = [
  {
    q: "Is Wealth Vault really free to use?",
    a: "Yes. Wealth Vault offers a free plan with all essential features so you can track expenses, manage budgets, and view insights without any cost. You can upgrade anytime for advanced tools."
  },
  {
    q: "How secure is my financial data?",
    a: "Your data is protected with enterprise-grade encryption, secure authentication, and continuous monitoring. We follow industry best practices to keep your information private and safe."
  },
  {
    q: "Does Wealth Vault support multiple currencies?",
    a: "Absolutely. Wealth Vault supports multiple currencies with real-time exchange rates, making it perfect for travelers, freelancers, and global users."
  },
  {
    q: "What does the AI Advisor actually do?",
    a: "The AI Advisor analyzes your spending patterns and income trends to provide personalized tips, alerts, and recommendations to help you save more and make smarter financial decisions."
  }
]


  const [open, setOpen] = React.useState<number | null>(null);

  return (
    <section id="faq" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <h3 data-aos="fade-up" className="text-4xl font-bold text-center mb-12">
          Frequently Asked Questions
        </h3>

        <div className="space-y-4">
          {faqs.map((item, i) => (
            <div
              key={i}
              data-aos="fade-up"
              data-aos-delay={i * 100}
              className="rounded-2xl border border-cyan-500/10 bg-white/70 dark:bg-slate-950/70 backdrop-blur"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full px-6 py-5 text-left font-semibold flex justify-between"
              >
                {item.q}
                <span className={`${open === i ? "rotate-45 text-cyan-500" : ""}`}>+</span>
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-slate-600 dark:text-slate-400">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
