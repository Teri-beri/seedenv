"use client";

import { useEffect, useRef } from "react";

const cellSize = 44;
const trailRadius = 56;
const trailDuration = 760;

function isGridVisibleAt(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  const gridRoot = element?.closest("main");
  if (!element || !gridRoot) return false;

  const hasGrid = gridRoot.classList.contains("terminal-grid")
    || Boolean(gridRoot.querySelector(".seedenv-ambient-grid, .seedenv-grid-flash, canvas"));
  if (!hasGrid) return false;
  if (element.closest("button, a, input, textarea, select, nav, header, [role='button'], [role='tab'], [role='switch'], .luxury-panel")) return false;

  let current: Element | null = element;
  while (current && current !== gridRoot) {
    const backgroundColor = window.getComputedStyle(current).backgroundColor;
    const rgba = backgroundColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
    const alpha = rgba ? Number(rgba[1]) : backgroundColor === "transparent" ? 0 : 1;
    if (alpha > 0.22) return false;
    current = current.parentElement;
  }

  return true;
}

export function CursorGridTrail() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const trailLayer = layer;
    const dots = new Map<string, HTMLSpanElement>();
    const removalTimers = new Map<string, number>();

    function removeDot(key: string, dot: HTMLSpanElement) {
      if (dots.get(key) !== dot) return;
      dot.remove();
      dots.delete(key);
      const timer = removalTimers.get(key);
      if (timer !== undefined) window.clearTimeout(timer);
      removalTimers.delete(key);
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === "touch" || !isGridVisibleAt(event.target)) return;

      const centerX = Math.round(event.clientX / cellSize) * cellSize;
      const centerY = Math.round(event.clientY / cellSize) * cellSize;
      for (let x = centerX - cellSize; x <= centerX + cellSize; x += cellSize) {
        for (let y = centerY - cellSize; y <= centerY + cellSize; y += cellSize) {
          if (Math.hypot(event.clientX - x, event.clientY - y) > trailRadius) continue;
          const key = `${x}:${y}`;
          let dot = dots.get(key);
          if (!dot) {
            dot = document.createElement("span");
            dot.className = "cursor-grid-trail-dot";
            trailLayer.appendChild(dot);
            dots.set(key, dot);
          }

          dot.style.left = `${x}px`;
          dot.style.top = `${y}px`;
          dot.getAnimations().forEach((animation) => animation.cancel());
          const oldTimer = removalTimers.get(key);
          if (oldTimer !== undefined) window.clearTimeout(oldTimer);
          const currentDot = dot;
          const animation = dot.animate(
            [
              { opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" },
              { opacity: 0.16, transform: "translate(-50%, -50%) scale(1)", offset: 0.15 },
              { opacity: 0, transform: "translate(-50%, -50%) scale(1.1)" },
            ],
            { duration: trailDuration, easing: "ease-out", fill: "forwards" },
          );
          animation.onfinish = () => removeDot(key, currentDot);
          removalTimers.set(key, window.setTimeout(() => removeDot(key, currentDot), trailDuration + 100));
        }
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      dots.forEach((dot) => dot.getAnimations().forEach((animation) => animation.cancel()));
      removalTimers.forEach((timer) => window.clearTimeout(timer));
      removalTimers.clear();
      trailLayer.replaceChildren();
    };
  }, []);

  return <div aria-hidden="true" className="cursor-grid-trail-layer pointer-events-none fixed inset-0 z-20 overflow-hidden" ref={layerRef} />;
}