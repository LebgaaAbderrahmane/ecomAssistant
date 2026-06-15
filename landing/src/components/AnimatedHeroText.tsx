"use client";

import { useState, useEffect } from "react";

const words = ["darija", "24h/24", "68 wilayas", "toute confiance"];

export default function AnimatedHeroText() {
  const [index, setIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
      setAnimKey((k) => k + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-5xl lg:text-6xl">
      Vos commandes COD confirmées automatiquement,{" "}
      <span key={animKey} className="inline-block text-brand-600 animate-cycle">
        {words[index]}
      </span>
    </h1>
  );
}
