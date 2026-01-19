import React, { useState, useEffect } from "react";
import { Sun, Moon, Vault, ArrowRight, MoreHorizontal, ArrowUpRight, TrendingDown, ShoppingBag, Coffee, Home as HomeIcon } from "lucide-react";
import AOS from "aos";
import "aos/dist/aos.css";
import FAQSection from "./Faq";

const sectionBg =
  "relative overflow-hidden rounded-3xl border border-white/10 dark:border-slate-800 " +
  "bg-[radial-gradient(80%_60%_at_50%_0%,rgba(16,185,129,0.25),transparent_60%)," +
  "linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.1))] " +
  "dark:bg-[radial-gradient(80%_60%_at_50%_0%,rgba(16,185,129,0.25),transparent_60%)," +
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
    <div className="min-h-screen transition-colors bg-white dark:bg-slate-950 text-black dark:text-white relative overflow-hidden font-sans">
      
      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full z-50 px-4 md:px-8 py-4 flex justify-between items-center backdrop-blur-md border-b border-white/10 bg-white/60 dark:bg-slate-950/60 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500 shadow shadow-emerald-500/40">
            <Vault className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold">Wealth Vault</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-6 font-medium text-black/80 dark:text-white/80">
            <a href="#features" className="hover:text-emerald-400">Features</a>
            <a href="#platform" className="hover:text-emerald-400">Platform</a>
            
            <a href="#faq" className="hover:text-emerald-400">FAQ</a>
            <a href="/auth" className="hover:text-emerald-400">Get Started</a>
          </div>

          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="p-2 rounded-full bg-black/10 dark:bg-white/10 hover:bg-emerald-500/20 transition"
          >
            {theme === "light" ? <Moon className="text-black" /> : <Sun className="text-white" />}
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative w-full pt-32 pb-16 flex flex-col items-center justify-center overflow-hidden">
        
        {/* --- NEW Background Image with Theme Tint --- */}
        {/* 1. The base image - abstract finance/network */}
        <div
          className="absolute inset-0 h-full w-full bg-cover bg-center z-0
                     // Abstract finance network image
                     bg-[url('https://images.unsplash.com/photo-1642543492481-44e81e3914a7?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3')]
                     // Light mode: subtle opacity, desaturated to remain decent
                     opacity-15 saturate-0
                     // Dark mode: even subtler so it doesn't clash with dark text
                     dark:opacity-[0.08] dark:saturate-0
                     // Fade out smoothly towards the bottom
                     [mask-image:linear-gradient(to_bottom,black_50%,transparent_100%)]
                     pointer-events-none"
        />
        {/* 2. The Emerald Tint Overlay to enforce the theme */}
        <div className="absolute inset-0 h-full w-full z-0 pointer-events-none
                        bg-gradient-to-b from-emerald-500/10 to-transparent
                        dark:from-emerald-400/5
                        [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)]">
        </div>
        {/* ------------------------------------------- */}


        <div className="relative w-full max-w-6xl mx-auto px-6 z-10 flex flex-col items-center">
            
            {/* Headline */}
            <h1 
              data-aos="fade-up" 
              className="text-4xl md:text-6xl font-extrabold text-center tracking-tight text-slate-900 dark:text-white leading-tight mb-8 max-w-4xl"
            >
                Manage your wealth <br className="hidden md:block"/>
                without the <span className="relative inline-block">
                    spreadsheet headache
                    <svg className="absolute w-full h-3 -bottom-1 left-0 text-emerald-400 opacity-60" viewBox="0 0 100 10" preserveAspectRatio="none">
                         <path d="M0,5 Q50,10 100,5" stroke="currentColor" strokeWidth="4" fill="none" />
                    </svg>
                </span>
            </h1>

            {/* Subtitle */}
            <p 
              data-aos="fade-up" 
              data-aos-delay="100"
              className="text-lg md:text-xl text-center text-slate-600 dark:text-slate-400 mb-12 max-w-2xl"
            >
                Wealth Vault makes it easy to handle all your financial tasks, from tracking and budgeting to saving and investing effortlessly.
            </p>

           

            {/* BROWSER MOCKUP - WIDER (max-w-5xl) BUT NOT TALLER */}
            <div 
              data-aos="fade-up" 
              data-aos-delay="300"
              className="w-full max-w-5xl relative"
            >
                {/* Glow */}
                <div className="absolute -inset-4 bg-emerald-500/20 blur-3xl rounded-[50%] opacity-40 pointer-events-none"></div>
                
                {/* Window Container */}
                <div className="relative rounded-t-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                        </div>
                        <div className="hidden sm:flex bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md text-[10px] text-slate-400 w-48 items-center justify-center">
                            wealthvault.app/my-finances
                        </div>
                        <div className="flex gap-2 text-slate-400">
                            <MoreHorizontal size={12} />
                        </div>
                    </div>

                    {/* PERSONAL FINANCE DASHBOARD */}
                    <div className="p-4 bg-slate-50 dark:bg-[#0B1120] grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">

                        {/* Card 1: Total Deposited */}
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-24 relative overflow-hidden">
                            <div className="z-10">
                                <div className="text-xs text-slate-500 font-medium mb-1">Total Deposited</div>
                                <div className="text-2xl font-bold text-slate-900 dark:text-white">$12,450</div>
                            </div>
                            <div className="z-10 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-100 dark:bg-emerald-500/10 w-fit px-1.5 py-0.5 rounded-full">
                                <ArrowUpRight size={10} /> +12%
                            </div>
                            <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl"></div>
                        </div>

                        {/* Card 2: This Month Expenses */}
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-24 relative overflow-hidden">
                            <div className="z-10">
                                <div className="text-xs text-slate-500 font-medium mb-1">Expenses (Oct)</div>
                                <div className="text-2xl font-bold text-slate-900 dark:text-white">$3,240</div>
                            </div>
                            <div className="z-10 flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium bg-rose-100 dark:bg-rose-500/10 w-fit px-1.5 py-0.5 rounded-full">
                                <TrendingDown size={10} /> Good
                            </div>
                            <div className="absolute -right-4 -top-4 w-16 h-16 bg-rose-500/10 rounded-full blur-xl"></div>
                        </div>

                        {/* Card 3: Balance Action */}
                        <div className="bg-emerald-500 p-4 rounded-xl shadow-lg shadow-emerald-500/20 flex flex-col justify-center items-center h-24 text-center text-white">
                            <div className="font-medium opacity-90 mb-1 text-xs">Available Balance</div>
                            <div className="text-3xl font-extrabold mb-1">$9,210</div>
                        </div>

                        {/* Row 2: Expense Categories & Recent Activity */}
                        <div className="md:col-span-2 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-slate-800 dark:text-white text-sm">Spending Breakdown</h4>
                                <div className="bg-slate-100 dark:bg-slate-700 text-[10px] px-2 py-0.5 rounded text-slate-500">
                                    October
                                </div>
                            </div>
                            <div className="space-y-4">
                                {/* Category 1 */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1.5 items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                                                <Coffee size={12}/>
                                            </div>
                                            <span className="font-medium text-slate-700 dark:text-slate-300">Food & Dining</span>
                                        </div>
                                        <span className="font-bold text-slate-900 dark:text-white">$850</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-orange-400 w-[45%]"></div>
                                    </div>
                                </div>

                                {/* Category 2 */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1.5 items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                                <ShoppingBag size={12}/>
                                            </div>
                                            <span className="font-medium text-slate-700 dark:text-slate-300">Clothing</span>
                                        </div>
                                        <span className="font-bold text-slate-900 dark:text-white">$420</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-blue-400 w-[25%]"></div>
                                    </div>
                                </div>

                                {/* Category 3 */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1.5 items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                                                <HomeIcon size={12}/>
                                            </div>
                                            <span className="font-medium text-slate-700 dark:text-slate-300">Bills</span>
                                        </div>
                                        <span className="font-bold text-slate-900 dark:text-white">$950</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-purple-500 w-[60%]"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Transactions List */}
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <h4 className="font-bold text-slate-800 dark:text-white mb-4 text-sm">Recent</h4>
                            <div className="space-y-3">
                                {[
                                    { name: 'Uber Eats', cat: 'Food', price: '-$24' },
                                    { name: 'H&M', cat: 'Shop', price: '-$120' },
                                    { name: 'Freelance', cat: 'Inc', price: '+$450', positive: true },
                                    { name: 'Netflix', cat: 'Sub', price: '-$15' },
                                ].map((tx, i) => (
                                    <div key={i} className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition cursor-default">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${tx.positive ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                                {tx.positive ? <ArrowUpRight size={10}/> : <TrendingDown size={10}/>}
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-slate-800 dark:text-white">{tx.name}</div>
                                                <div className="text-[9px] text-slate-500 uppercase tracking-wide">{tx.cat}</div>
                                            </div>
                                        </div>
                                        <div className={`text-xs font-bold ${tx.positive ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
                                            {tx.price}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
      </section>

      {/* Key Metrics Section */}
      <section className="py-24 px-6 relative z-10 bg-white dark:bg-slate-950">
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
                className="w-[120px] md:w-[150px] p-6 rounded-2xl bg-white/10 dark:bg-slate-800/20 backdrop-blur hover:bg-emerald-500/10 transition"
                data-aos="zoom-in"
                data-aos-delay={Math.floor(Math.random() * 200)}
              >
                <div className="text-2xl md:text-3xl font-extrabold text-emerald-400">
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
                className="p-8 rounded-2xl bg-white/5 dark:bg-white/5 border border-white/10 backdrop-blur hover:bg-emerald-500/10 dark:hover:bg-emerald-800 transition"
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
          <div data-aos="zoom-in" className="h-72 w-full rounded-2xl p-6 bg-emerald-500/5 dark:bg-slate-900/40 backdrop-blur border border-emerald-400/20">
            <svg viewBox="0 0 400 220" className="w-full h-full">
              <defs>
                <linearGradient id="dashGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>

              <rect x="10" y="10" width="380" height="200" rx="16" fill="none" stroke="url(#dashGrad)" opacity="0.6" />
              <rect x="30" y="35" width="120" height="14" rx="4" fill="url(#dashGrad)" opacity="0.5" />

              <rect x="40" y="70" width="40" height="90" rx="6" fill="#34d399" opacity="0.35" />
              <rect x="100" y="95" width="40" height="65" rx="6" fill="#4ade80" opacity="0.45" />
              <rect x="160" y="60" width="40" height="100" rx="6" fill="#22c55e" opacity="0.6" />
              <rect x="220" y="110" width="40" height="50" rx="6" fill="#86efac" opacity="0.4" />
              <rect x="280" y="85" width="40" height="75" rx="6" fill="#10b981" opacity="0.5" />
            </svg>
          </div>
        </div>

        <div className={`max-w-7xl mb-10 mx-auto grid md:grid-cols-2 gap-16 items-center p-16 ${sectionBg}`}>
          <div data-aos="zoom-in" className="h-72 w-full rounded-2xl p-6 bg-emerald-500/5 dark:bg-slate-900/40 backdrop-blur border border-emerald-400/20">
            <svg viewBox="0 0 400 220" className="w-full h-full">
              <defs>
                <linearGradient id="aiGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#16a34a" />
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
          <div data-aos="flip-left" className="h-72 w-full rounded-2xl p-6 bg-emerald-500/5 dark:bg-slate-900/40 backdrop-blur border border-emerald-400/20 flex items-center justify-center">
            <svg viewBox="0 0 220 240" className="w-44 h-44">
              <defs>
                <linearGradient id="secGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#16a34a" />
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

      {/* Pricing Section
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
                hover:shadow-[0_10px_60px_rgba(16,185,129,0.6)]
                ${p.popular 
                  ? "bg-gradient-to-br from-emerald-500/25 via-green-600/20 to-teal-600/20 border-emerald-400/40" 
                  : "bg-white/5 border-white/10"}`}
            >
              {p.popular && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full
                                text-xs font-semibold tracking-wide
                                bg-gradient-to-r from-emerald-400 to-green-500 text-slate-900 shadow-lg">
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
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href="/auth"
                className={`block text-center px-8 py-4 rounded-2xl font-semibold transition
                  ${p.popular 
                    ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-xl hover:shadow-emerald-500/40" 
                    : "border border-white/20 hover:bg-emerald-500/20"}`}
              >
                Get Started
              </a>
            </div>
          ))}
        </div>
      </section> */}

      {/* FAQ Section */}
      <FAQSection />

      {/* Footer */}
      <footer className="relative mt-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(16,185,129,0.25),transparent_70%),linear-gradient(180deg,#020617,#020617)]" />
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="mb-20 text-center">
            <h3 className="text-4xl md:text-5xl font-extrabold mb-4">Ready to take control of your money?</h3>
            <p className="text-black/60 dark:text-white/60 max-w-xl mx-auto mb-8">
              Join thousands of users who manage, grow, and protect their wealth with Wealth Vault.
            </p>
            <a
              href="/auth"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl
                         bg-gradient-to-r from-emerald-500 to-green-600
                         font-semibold shadow-xl hover:scale-105 transition"
            >
              Get Started Free
            </a>
          </div>

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