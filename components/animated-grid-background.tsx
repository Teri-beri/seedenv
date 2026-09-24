"use client";

const gridSize = 64;
const columnCount = 28;
const rowCount = 18;
const activeDots = new Set([2, 17, 39, 51, 74, 86, 109, 132, 146, 168, 191, 207, 221, 244, 267, 283, 301, 326, 349, 372, 388, 411, 433, 456, 479]);

const dots = Array.from({ length: columnCount * rowCount }, (_, index) => {
  const column = index % columnCount;
  const row = Math.floor(index / columnCount);
  return {
    index,
    left: `${column * gridSize}px`,
    top: `${row * gridSize}px`,
    delay: `${((column * 73 + row * 41) % 900) / 1000}s`,
    size: activeDots.has(index) ? "size-[3px]" : "size-0.5",
  };
});

export function AnimatedGridBackground() {
  return (
    <div className="seedenv-grid-flash pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {dots.map((dot) => <span className={`seedenv-grid-dot absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 ${dot.size}`} key={dot.index} style={{ left: dot.left, top: dot.top, animationDelay: dot.delay }} />)}
    </div>
  );
}
