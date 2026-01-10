import React, { useState, useEffect } from "react";
import { Vault, ChevronDown } from "lucide-react";
import Testimonials from "./Testimonial";
import FAQSection from "./Faq";

const FloatStyle: React.FC = () => (
  <style>{`
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
    .animate-float { animation: float 2.5s ease-in-out infinite; }
  `}</style>
);

const accentMap = {
  blue: { main: "#06b6d4", soft: "#0ea5e9" },   // cyan / sky
  green: { main: "#22c55e", soft: "#84cc16" }, // green / lime
};

const Home: React.FC = () => {
  const [theme, setTheme] = useState<"light" | "dark">(
    localStorage.getItem("theme") === "dark" ? "dark" : "light"
  );
  const [colorTheme, setColorTheme] = useState<"blue" | "green">("blue");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.className = theme === "dark" ? "dark" : "";
    localStorage.setItem("theme", theme);
  }, [theme]);

  const themeBg = {
    blue: "bg-gradient-to-br from-blue-500 via-cyan-400 to-blue-700",
    green: "bg-gradient-to-br from-emerald-500 via-lime-400 to-green-700",
  };

  return (
    <>
      <FloatStyle />

      <div
        className={`min-h-screen w-full transition-colors ${themeBg[colorTheme]}`}
        style={{
          ["--accent" as any]: accentMap[colorTheme].main,
          ["--accent-soft" as any]: accentMap[colorTheme].soft,
        }}
      >
        {/* Navbar */}
        <nav
          className={`fixed top-0 left-0 w-full z-50 px-8 py-4 flex items-center justify-between backdrop-blur-md border-b ${
            theme === "dark"
              ? "bg-slate-900/80 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[color:var(--accent)]">
              <Vault className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Wealth Vault</h1>
          </div>

          <div className="flex items-center gap-4 relative">
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              🎨 Theme <ChevronDown className="h-4 w-4" />
            </button>

            {open && (
              <div className="absolute right-0 top-12 w-56 rounded-xl shadow-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2">
                <div className="text-xs uppercase text-slate-500 dark:text-slate-400 px-2 py-1">
                  Mode
                </div>
                <button onClick={() => setTheme("light")} className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                  🌞 Light
                </button>
                <button onClick={() => setTheme("dark")} className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                  🌙 Dark
                </button>

                <div className="text-xs uppercase text-slate-500 dark:text-slate-400 px-2 py-2">
                  Accent
                </div>
                {(["blue", "green"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setColorTheme(c)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 capitalize"
                  >
                    🎨 {c}
                  </button>
                ))}
              </div>
            )}

            <a
              href="/auth"
              className="px-5 py-2 rounded-lg text-white font-semibold shadow hover:scale-105 transition bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-soft)]"
            >
              Get Started
            </a>
          </div>
        </nav>

        {/* Hero */}
        <section className="w-full min-h-screen flex items-center justify-center pt-32 px-6 text-white">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
                Take Control of Your Money 💸
              </h2>
              <p className="text-lg md:text-xl text-white/90 mb-8 max-w-xl">
                Track expenses, analyze habits, and build smarter financial decisions.
              </p>
              <div className="flex gap-4">
                <a
                  href="/auth"
                  className="px-6 py-3 bg-white text-slate-900 rounded-xl font-semibold shadow-lg hover:scale-105 transition animate-float"
                >
                  Start Tracking 🚀
                </a>
                <a
                  href="#features"
                  className="px-6 py-3 border border-white/40 text-white rounded-xl hover:bg-white/10 transition"
                >
                  Learn More
                </a>
              </div>
            </div>

            <div className="relative h-80 lg:h-[420px] rounded-3xl bg-white/20 backdrop-blur-lg shadow-2xl border border-white/30 p-6 overflow-hidden">
              <div className="absolute inset-4 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-soft)] opacity-40" />
              <img
                src="expense.png"
                alt="Live Dashboard Preview"
                className="relative z-10 w-full h-full object-cover rounded-2xl shadow-xl"
              />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-black/40 text-white text-sm backdrop-blur">
                Live Dashboard Preview
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="w-full py-24 px-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
          <div className="max-w-7xl mx-auto text-center mb-14">
            <h3 className="text-4xl font-bold mb-4">Powerful Features</h3>
            <p className="text-slate-600 dark:text-slate-400">Everything you need to master your finances.</p>
          </div>

          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              ["💱 Currency Converter", "Convert currencies in real-time."],
              ["📊 Expense Tracking", "Log and categorize every spend."],
              ["🤖 AI Advisor", "Get smart financial guidance."],
              ["📈 Smart Dashboard", "Visualize your money instantly."],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow hover:scale-105 hover:shadow-xl transition bg-slate-50 dark:bg-slate-950"
              >
                <h4 className="text-xl font-bold mb-3">{title}</h4>
                <p className="text-slate-600 dark:text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <Testimonials />
        <FAQSection />

        {/* Footer */}
        <footer className="w-full py-12 px-6 dark:bg-slate-900 dark:text-slate-200">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-white p-2 rounded-xl">
                  <Vault className="h-5 w-5 text-slate-900" />
                </div>
                <span className="text-lg font-semibold">Wealth Vault</span>
              </div>
              <p className="dark:text-slate-400"> Smarter money management for a better future. </p>
            </div>
            <div>
              <h5 className="font-semibold mb-3">Product</h5>
              <ul className="space-y-2 dark:text-slate-400">
                <li><a href="#features" className="dark:hover:text-white">Features</a></li>
                <li><a href="/auth" className="dark:hover:text-white">Get Started</a></li>
                <li><a href="#" className="dark:hover:text-white">Docs</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold mb-3">Company</h5>
              <ul className="space-y-2 dark:text-slate-400">
                <li><a href="#" className="dark:hover:text-white">About</a></li>
                <li><a href="#" className="dark:hover:text-white">Privacy</a></li>
                <li><a href="#" className="dark:hover:text-white">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="text-center dark:text-slate-500 mt-10">
            © {new Date().getFullYear()} Wealth Vault. All rights reserved.
          </div>
        </footer>
        </div>
    </>
  );
}

export default Home;
