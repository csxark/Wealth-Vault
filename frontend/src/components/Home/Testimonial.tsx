import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import AOS from "aos";
import "aos/dist/aos.css";

interface TestimonialData {
  name: string;
  location: string;
  text: string;
  img: string;
  stars: number;
}

const data = [
  {
    name: "Aarav",
    location: "New York, USA",
    text: "Wealth Vault has completely transformed the way I manage my finances. I now understand where every dollar goes and can plan my savings with confidence. The AI insights are incredibly helpful.",
    img: "https://i.pravatar.cc/150?img=12",
    stars: 5,
  },
  {
    name: "Sophia",
    location: "London, UK",
    text: "Clean, intuitive interface with powerful analytics. I can see my spending habits clearly and make better decisions. Truly a must-have for anyone who wants control over their money.",
    img: "https://i.pravatar.cc/150?img=32",
    stars: 4.4,
  },
  {
    name: "Liam",
    location: "Toronto, Canada",
    text: "Best finance dashboard I've used. Tracks expenses perfectly and the smart dashboard visualizations make understanding my finances effortless.",
    img: "https://i.pravatar.cc/150?img=45",
    stars: 5,
  },
  {
    name: "Olivia",
    location: "Sydney, Australia",
    text: "Finally, an app that lets me truly understand my spending. The AI suggestions have saved me so much time and money.",
    img: "https://i.pravatar.cc/150?img=56",
    stars: 4.8,
  },
  {
    name: "Noah",
    location: "Berlin, Germany",
    text: "AI suggestions are spot on! I’ve started investing smartly and can track everything in one place. Amazing app!",
    img: "https://i.pravatar.cc/150?img=66",
    stars: 5,
  },
  {
    name: "Emma",
    location: "Paris, France",
    text: "Highly recommend Wealth Vault for beginners and pros alike. It's powerful yet simple to use, and the insights are invaluable.",
    img: "https://i.pravatar.cc/150?img=7",
    stars: 4.5,
  },
];

const Testimonials: React.FC = () => {
  const [index, setIndex] = useState(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    AOS.init({ duration: 1000, easing: "ease-out-cubic", once: false });

    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % data.length);
    }, 5000);
    return () => clearInterval(timer.current);
  }, []);

  const Card = ({ u, big = false }: { u: TestimonialData; big?: boolean }) => (
    <div
      className={`rounded-2xl p-6 border transition-all duration-500 transform
        bg-white/70 dark:bg-slate-950/70 backdrop-blur
        ${big
          ? "-translate-y-2 scale-105 border-cyan-400 shadow-[0_25px_60px_rgba(59,130,246,0.45)]"
          : "scale-90 opacity-60 border-slate-200 dark:border-slate-800"
        }`}
    >
      <img src={u.img} className="w-16 h-16 rounded-full mx-auto mb-3" />
      <h4 className="font-semibold text-center">{u.name}</h4>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-2">{u.location}</p>
      <p className="mt-2 text-sm text-center text-slate-600 dark:text-slate-300">{u.text}</p>
      <div className="flex justify-center mt-4 space-x-1">
        {Array.from({ length: u.stars }).map((_, i) => (
          <Star key={i} className="h-4 w-4 text-yellow-400" />
        ))}
      </div>
    </div>
  );

  const left = data[(index - 1 + data.length) % data.length];
  const mid = data[index];
  const right = data[(index + 1) % data.length];

  return (
    <section className="py-24 px-6 bg-transparent relative">
      <h3 data-aos="fade-up" className="text-4xl font-bold text-center mb-12">
        What Users Say
      </h3>

      {/* Desktop Carousel */}
      <div
        className="relative max-w-5xl mx-auto hidden md:grid grid-cols-3 gap-6 items-center"
        data-aos="fade-up"
      >
        <Card u={left} />
        <Card u={mid} big />
        <Card u={right} />

        {/* Navigation Buttons */}
        <button
          onClick={() => setIndex((i) => (i - 1 + data.length) % data.length)}
          className="absolute -left-12 p-2 rounded-full border bg-white/30 dark:bg-slate-800/30 hover:bg-cyan-500/20 transition"
        >
          <ChevronLeft />
        </button>

        <button
          onClick={() => setIndex((i) => (i + 1) % data.length)}
          className="absolute -right-12 p-2 rounded-full border bg-white/30 dark:bg-slate-800/30 hover:bg-cyan-500/20 transition"
        >
          <ChevronRight />
        </button>
      </div>

      {/* Mobile Carousel */}
      <div className="md:hidden overflow-x-auto flex gap-6 snap-x snap-mandatory scroll-smooth px-4">
        {data.map((u, i) => (
          <Card key={i} u={u} />
        ))}
      </div>
    </section>
  );
};

export default Testimonials;
