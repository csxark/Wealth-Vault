import React, { useState, useEffect } from "react";
import { Sun, Moon, Vault } from "lucide-react";
import AOS from "aos";
import "aos/dist/aos.css";
import Testimonials from "./Testimonial";
import FAQSection from "./Faq";

const sectionBg =
  "relative overflow-hidden rounded-3xl border border-white/10 dark:border-slate-800 " +
  "bg-[radial-gradient(80%_60%_at_50%_0%,rgba(59,130,246,0.25),transparent_60%)," +
  "linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.1))] " +
  "dark:bg-[radial-gradient(80%_60%_at_50%_0%,rgba(59,130,246,0.25),transparent_60%)," +
  "linear-gradient(180deg,#020617,#020617)] backdrop-blur-xl";

const Home: React.FC = () => {
  const [theme, setTheme] = useState<"light" | "dark">(
    localStorage.getItem("theme") === "dark" ? "dark" : "light"
  );

  useEffect(() => {
    document.documentElement.className = theme === "dark" ? "dark" : "";
    localStorage.setItem("theme", theme);

    AOS.init({
      duration: 900,
      easing: "ease-out-cubic",
      once: false,
      mirror: true,
      offset: 120,
    });
  }, [theme]);

  return (
    <div className="min-h-screen transition-colors bg-white dark:bg-slate-950 text-black dark:text-white relative overflow-hidden">
      {/* Bubble Background */}
      <style>{`
        @keyframes drift {
          0% { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.4; }
          50% { transform: translateY(-40px) translateX(20px) scale(1.05); opacity: 0.6; }
          100% { transform: translateY(0px) translateX(-20px) scale(1); opacity: 0.4; }
        }
        .bubble {
          position: absolute;
          border-radius: 9999px;
          background: radial-gradient(circle at 30% 30%, rgba(59,130,246,0.8), rgba(59,130,246,0.12));
          animation: drift ease-in-out infinite;
          filter: blur(3px);
          pointer-events: none;
        }
        @keyframes floatCard { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes pulseGlow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
      `}</style>

      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="bubble"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: 24 + Math.random() * 80,
            height: 24 + Math.random() * 80,
            animationDuration: `${18 + Math.random() * 25}s`,
            animationDelay: `${Math.random() * 10}s`,
          }}
        />
      ))}

      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full z-50 px-4 md:px-8 py-4 flex justify-between items-center backdrop-blur-md border-b border-white/10 bg-white/60 dark:bg-slate-950/60 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500 shadow shadow-cyan-500/40">
            <Vault className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold">Wealth Vault</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-6 font-medium text-black/80 dark:text-white/80">
            <a href="#features" className="hover:text-cyan-400">Features</a>
            <a href="#platform" className="hover:text-cyan-400">Platform</a>
            <a href="#pricing" className="hover:text-cyan-400">Pricing</a>
            <a href="#faq" className="hover:text-cyan-400">FAQ</a>
            <a href="/auth" className="hover:text-cyan-400">Get Started</a>
          </div>

          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="p-2 rounded-full bg-black/10 dark:bg-white/10 hover:bg-cyan-500/20 transition"
          >
            {theme === "light" ? <Moon className="text-black" /> : <Sun className="text-white" />}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="w-full min-h-screen flex flex-col justify-center items-center text-center px-6 pt-32">
        <div data-aos="fade-up">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-4">
            The modern capital platform
          </h1>
          <p className="text-base sm:text-lg md:text-xl mb-8 max-w-xl text-black/70 dark:text-white/70">
            Track expenses, analyze habits, and make smarter financial decisions effortlessly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/auth" className="px-6 py-3 rounded-xl bg-cyan-500 font-semibold hover:scale-105 transition shadow-lg shadow-cyan-500/40">
              Get Started
            </a>
            <a href="#features" className="px-6 py-3 rounded-xl border border-black/20 dark:border-white/20 hover:bg-cyan-500/10 transition">
              Learn More
            </a>
          </div>
        </div>

        {/* Dashboard */}
        <div className="mt-24 w-full max-w-5xl mx-auto relative animate-[floatCard_6s_ease-in-out_infinite]">
          <div className="absolute -inset-6 rounded-t-3xl rounded-b-none
                          bg-gradient-to-r from-cyan-400/50 via-blue-500/40 to-indigo-500/50
                          blur-3xl animate-[pulseGlow_4s_ease-in-out_infinite]" />
          <div className="relative overflow-hidden rounded-t-2xl rounded-b-none h-60 md:h-96">
            <img
              src="expense.png"
              alt="Dashboard"
              className="w-full absolute top-0 left-0
                         rounded-t-2xl rounded-b-none
                         border border-white/10 shadow-2xl
                         hover:shadow-[0_0_100px_rgba(59,130,246,0.75)]
                         hover:-translate-y-2 transition-all duration-500"
            />
          </div>
        </div>
      </section>

      {/* Key Metrics Section */}
      <section className="py-24 px-6">
        <div className={`max-w-7xl mx-auto p-12 ${sectionBg}`} data-aos="fade-up">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-12 text-black dark:text-white">
            Our Impact in Numbers
          </h3>

          <div className="flex flex-wrap justify-center gap-12 text-center">
            {[
              { title: "5K", subtitle: "Active Users" },
              { title: "99.9%", subtitle: "Uptime" },
              { title: "10K+", subtitle: "Transactions" },
              { title: "50+", subtitle: "Countries" },
              { title: "24/7", subtitle: "Support" },
            ].map((metric) => (
              <div
                key={metric.title}
                className="w-[120px] md:w-[150px] p-6 rounded-2xl bg-white/10 dark:bg-slate-800/20 backdrop-blur hover:bg-cyan-500/10 transition"
                data-aos="zoom-in"
                data-aos-delay={Math.floor(Math.random() * 200)}
              >
                <div className="text-2xl md:text-3xl font-extrabold text-cyan-400">
                  {metric.title}
                </div>
                <div className="mt-2 text-sm md:text-base text-black/60 dark:text-white/60">
                  {metric.subtitle}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section id="features" className="py-20 px-6">
        <div className={`max-w-7xl mx-auto p-16 ${sectionBg}`} data-aos="fade-up">
          <h2 className="text-4xl font-bold text-center mb-4">Simplify your finances</h2>
          <p className="text-center mb-12 text-black/60 dark:text-white/60">
            Powerful tools to help you master your money.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              ["💱 Currency Converter", "Convert currencies in real-time."],
              ["📊 Expense Tracking", "Log and categorize every spend."],
              ["🤖 AI Advisor", "Get smart financial guidance."],
              ["📈 Smart Dashboard", "Visualize your money instantly."],
            ].map(([title, desc], i) => (
              <div
                key={title}
                data-aos="zoom-in"
                data-aos-delay={i * 120}
                className="p-8 rounded-2xl bg-white/5 dark:bg-white/5 border border-white/10 backdrop-blur hover:bg-cyan-500/10 dark:hover:bg-cyan-500/10 transition"
              >
                <h3 className="text-xl font-bold mb-3">{title}</h3>
                <p className="text-black/60 dark:text-white/60">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Sections */}
      <section id="platform" className="py-15 px-6">
        <div className={`max-w-7xl mb-10 mx-auto grid md:grid-cols-2 gap-16 items-center p-16 ${sectionBg}`}>
          <div data-aos="fade-right">
            <h3 className="text-4xl font-bold mb-4">Built for modern finance</h3>
            <p className="text-black/60 dark:text-white/60 mb-6">
              Wealth Vault adapts to your financial life with speed and clarity.
            </p>
            <ul className="space-y-2 text-black/70 dark:text-white/70">
              <li>✔ Real-time sync</li>
              <li>✔ Smart categorization</li>
              <li>✔ Cloud backups</li>
            </ul>
          </div>
          <div data-aos="zoom-in" className="h-72 w-full rounded-2xl p-6 bg-cyan-500/5 dark:bg-slate-900/40 backdrop-blur border border-cyan-400/20">
            <svg viewBox="0 0 400 220" className="w-full h-full">
              <defs>
                <linearGradient id="dashGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>

              <rect x="10" y="10" width="380" height="200" rx="16" fill="none" stroke="url(#dashGrad)" opacity="0.6" />
              <rect x="30" y="35" width="120" height="14" rx="4" fill="url(#dashGrad)" opacity="0.5" />

              <rect x="40" y="70" width="40" height="90" rx="6" fill="#22d3ee" opacity="0.35" />
              <rect x="100" y="95" width="40" height="65" rx="6" fill="#38bdf8" opacity="0.45" />
              <rect x="160" y="60" width="40" height="100" rx="6" fill="#3b82f6" opacity="0.6" />
              <rect x="220" y="110" width="40" height="50" rx="6" fill="#60a5fa" opacity="0.4" />
              <rect x="280" y="85" width="40" height="75" rx="6" fill="#0ea5e9" opacity="0.5" />
            </svg>
          </div>
        </div>

        <div className={`max-w-7xl mb-10 mx-auto grid md:grid-cols-2 gap-16 items-center p-16 ${sectionBg}`}>
          <div data-aos="zoom-in" className="h-72 w-full rounded-2xl p-6 bg-cyan-500/5 dark:bg-slate-900/40 backdrop-blur border border-cyan-400/20">
            <svg viewBox="0 0 400 220" className="w-full h-full">
              <defs>
                <linearGradient id="aiGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>

              <circle cx="80" cy="110" r="20" fill="url(#aiGrad)" opacity="0.7" />
              <circle cx="200" cy="60" r="18" fill="url(#aiGrad)" opacity="0.6" />
              <circle cx="320" cy="120" r="20" fill="url(#aiGrad)" opacity="0.8" />

              <line x1="80" y1="110" x2="200" y2="60" stroke="url(#aiGrad)" strokeWidth="2" />
              <line x1="200" y1="60" x2="320" y2="120" stroke="url(#aiGrad)" strokeWidth="2" />

              <rect x="110" y="150" width="180" height="40" rx="12" fill="url(#aiGrad)" opacity="0.25" />
            </svg>
          </div>
          <div data-aos="fade-left">
            <h3 className="text-4xl font-bold mb-4">Intelligence that works</h3>
            <p className="text-black/60 dark:text-white/60 mb-6">
              AI-driven insights to help you save more and grow faster.
            </p>
            <ul className="space-y-2 text-black/70 dark:text-white/70">
              <li>✔ Smart alerts</li>
              <li>✔ Personalized plans</li>
              <li>✔ Monthly reports</li>
            </ul>
          </div>
        </div>

        <div className={`max-w-7xl mb-10 mx-auto grid md:grid-cols-2 gap-16 items-center p-16 ${sectionBg}`}>
          <div data-aos="fade-up">
            <h3 className="text-4xl font-bold mb-4">Security at every layer</h3>
            <p className="text-black/60 dark:text-white/60 mb-6">
              Enterprise-grade encryption and privacy-first architecture.
            </p>
            <ul className="space-y-2 text-black/70 dark:text-white/70">
              <li>✔ End-to-end encryption</li>
              <li>✔ Secure auth</li>
              <li>✔ Continuous monitoring</li>
            </ul>
          </div>
          <div data-aos="flip-left" className="h-72 w-full rounded-2xl p-6 bg-cyan-500/5 dark:bg-slate-900/40 backdrop-blur border border-cyan-400/20 flex items-center justify-center">
            <svg viewBox="0 0 220 240" className="w-44 h-44">
              <defs>
                <linearGradient id="secGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>

              <path
                d="M110 10 L190 45 V130 C190 175 145 210 110 230 C75 210 30 175 30 130 V45 Z"
                fill="none"
                stroke="url(#secGrad)"
                strokeWidth="3"
              />
              <rect x="80" y="95" width="60" height="50" rx="10" fill="url(#secGrad)" opacity="0.85" />
              <path
                d="M95 95 V75 C95 60 125 60 125 75 V95"
                fill="none"
                stroke="url(#secGrad)"
                strokeWidth="3"
              />
              <path
                d="M90 120 L105 135 L135 105"
                stroke="white"
                strokeWidth="3"
                fill="none"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />

      {/* Pricing Section */}
      <section id="pricing" className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12">
          {[
            {
              title: "Free",
              price: "₹0",
              desc: "Perfect to get started",
              features: ["Basic dashboard", "Expense tracking", "Email support"],
            },
            {
              title: "Pro",
              price: "₹299/mo",
              desc: "Best for individuals",
              popular: true,
              features: ["Everything in Free", "AI financial insights", "Unlimited categories", "Priority support"],
            },
            {
              title: "Enterprise",
              price: "Custom",
              desc: "For teams & businesses",
              features: ["Team collaboration", "Advanced analytics", "Custom integrations", "Dedicated manager"],
            },
          ].map((p, i) => (
            <div
              key={p.title}
              data-aos="fade-up"
              data-aos-delay={i * 150}
              className={`relative rounded-[2rem] p-12 min-h-[520px] flex flex-col justify-between
                backdrop-blur border transition-all duration-500 
                hover:-translate-y-5 hover:scale-[1.03]
                hover:shadow-[0_10px_60px_rgba(59,130,246,0.6)]
                ${p.popular ? "bg-gradient-to-br from-cyan-500/25 via-blue-600/20 to-indigo-600/20 border-cyan-400/40" : "bg-white/5 border-white/10"}`}
            >
              {p.popular && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full
                                text-xs font-semibold tracking-wide
                                bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-900 shadow-lg">
                  Most Popular
                </span>
              )}

              <div>
                <h3 className="text-2xl font-bold mb-2">{p.title}</h3>
                <p className="text-black/60 dark:text-white/60 mb-6">{p.desc}</p>

                <div className="flex items-end gap-2 mb-8">
                  <span className="text-5xl font-extrabold">{p.price}</span>
                  {p.price !== "Custom" && <span className="text-black/50 dark:text-white/50">/month</span>}
                </div>

                <ul className="space-y-3 text-left mb-10">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-black/80 dark:text-white/80">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href="/auth"
                className={`block text-center px-8 py-4 rounded-2xl font-semibold transition
                  ${p.popular ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-xl hover:shadow-cyan-500/40" : "border border-white/20 hover:bg-cyan-500/20"}`}
              >
                Get Started
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection />

      {/* Footer */}
      <footer className="relative mt-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(59,130,246,0.25),transparent_70%),linear-gradient(180deg,#020617,#020617)]" />
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="mb-20 text-center">
            <h3 className="text-4xl md:text-5xl font-extrabold mb-4">Ready to take control of your money?</h3>
            <p className="text-black/60 dark:text-white/60 max-w-xl mx-auto mb-8">
              Join thousands of users who manage, grow, and protect their wealth with Wealth Vault.
            </p>
            <a
              href="/auth"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl
                         bg-gradient-to-r from-cyan-500 to-blue-600
                         font-semibold shadow-xl hover:scale-105 transition"
            >
              Get Started Free
            </a>
          </div>

          {/* Footer Links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-sm">
            <div>
              <h4 className="font-semibold text-black dark:text-white mb-4">Product</h4>
              <ul className="space-y-2 text-black/60 dark:text-white/60">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#platform" className="hover:text-white">Platform</a></li>
                <li><a href="#" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-black dark:text-white mb-4">Company</h4>
              <ul className="space-y-2 text-black/60 dark:text-white/60">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Careers</a></li>
                <li><a href="#" className="hover:text-white">Press</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-black dark:text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-black/60 dark:text-white/60">
                <li><a href="#" className="hover:text-white">Help Center</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">API Docs</a></li>
                <li><a href="#" className="hover:text-white">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-black dark:text-white mb-4">Social</h4>
              <ul className="space-y-2 text-black/60 dark:text-white/60">
                <li><a href="#" className="hover:text-white">Twitter</a></li>
                <li><a href="#" className="hover:text-white">LinkedIn</a></li>
                <li><a href="#" className="hover:text-white">GitHub</a></li>
                <li><a href="#" className="hover:text-white">Dribbble</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-20 text-center text-black/50 dark:text-white/50 text-sm">
            &copy; {new Date().getFullYear()} Wealth Vault. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
