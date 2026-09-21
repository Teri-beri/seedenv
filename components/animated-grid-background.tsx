"use client";

const dots = Array.from({ length: 120 }, (_, index) => ({
  index,
  left: `${(index * 37) % 101}%`,
  top: `${(index * 61) % 101}%`,
  delay: `${((index * 17) % 700) / 1000}s`,
  size: index % 5 === 0 ? "size-[3px]" : "size-0.5",
}));

export function AnimatedGridBackground() {
  return (
    <div className="seedenv-grid-flash pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {dots.map((dot) => <span className={`seedenv-grid-dot absolute rounded-full bg-white/20 ${dot.size}`} key={dot.index} style={{ left: dot.left, top: dot.top, animationDelay: dot.delay }} />)}
    </div>
  );
}
