import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const data = [
  { name: "Aarav", country: "India", text: "Wealth Vault changed how I manage money.", img: "https://i.pravatar.cc/150?img=12" },
  { name: "Sophia", country: "USA", text: "Clean UI and powerful insights!", img: "https://i.pravatar.cc/150?img=32" },
  { name: "Liam", country: "UK", text: "Best finance dashboard I’ve used.", img: "https://i.pravatar.cc/150?img=45" },
  { name: "Mia", country: "Canada", text: "AI tips are super helpful.", img: "https://i.pravatar.cc/150?img=5" },
  { name: "Noah", country: "Germany", text: "Love the design and speed.", img: "https://i.pravatar.cc/150?img=20" },
];

const Testimonials: React.FC = () => {
  const [index, setIndex] = useState(0);
  const timer = useRef<any>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setIndex(i => (i + 1) % data.length);
    }, 4000);
    return () => clearInterval(timer.current);
  }, []);

  const prev = () => setIndex(i => (i - 1 + data.length) % data.length);
  const next = () => setIndex(i => (i + 1) % data.length);

  const Card = ({ u, big = false }: any) => (
    <div
      className={`rounded-2xl p-6 border shadow transition-all bg-slate-50 dark:bg-slate-950 ${
        big
          ? "scale-100 border-[color:var(--accent)] shadow-xl"
          : "scale-90 opacity-70 border-slate-200 dark:border-slate-800"
      }`}
    >
      <img src={u.img} className="w-16 h-16 rounded-full mx-auto mb-3" />
      <h4 className="font-semibold text-center">{u.name}</h4>
      <p className="text-xs text-center text-slate-500">{u.country}</p>
      <p className="mt-3 text-sm text-center text-slate-600 dark:text-slate-400">
        “{u.text}”
      </p>
    </div>
  );

  // For desktop: left, center, right cards
  const left = data[(index - 1 + data.length) % data.length];
  const mid = data[index];
  const right = data[(index + 1) % data.length];

  return (
    <section className="w-full py-24 px-6 bg-white dark:bg-slate-900">
      <div className="max-w-6xl mx-auto text-center mb-10">
        <h3 className="text-4xl font-bold dark:text-white">What Users Say</h3>
      </div>

      {/* Desktop View */}
      <div className="relative max-w-5xl mx-auto hidden md:grid grid-cols-3 gap-6 items-center">
        <Card u={left} />
        <Card u={mid} big />
        <Card u={right} />

        <button
          onClick={prev}
          className="absolute -left-12 top-1/2 transform -translate-y-1/2 p-2 rounded-full border bg-white dark:bg-slate-950 dark:text-white hover:scale-110 transition"
        >
          <ChevronLeft />
        </button>
        <button
          onClick={next}
          className="absolute -right-12 top-1/2 transform -translate-y-1/2 p-2 rounded-full border bg-white dark:bg-slate-950 dark:text-white hover:scale-110 transition"
        >
          <ChevronRight />
        </button>
      </div>

      {/* Mobile View */}
      <div className="md:hidden max-w-sm mx-auto relative">
        <Card u={mid} big />
        <div className="flex justify-between mt-6">
          <button
            onClick={prev}
            className="p-2 rounded-full border bg-white dark:bg-slate-950 dark:text-white hover:scale-105 transition"
          >
            <ChevronLeft />
          </button>
          <button
            onClick={next}
            className="p-2 rounded-full border bg-white dark:bg-slate-950 dark:text-white hover:scale-105 transition"
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
