"use client";

import { useEffect, useRef } from "react";

const cellSize = 44;
const trailRadius = 56;
const fadeDuration = 760;
const trailIntensity = 0.13;

type TrailDot = { x: number; y: number; intensity: number };

export function CursorGridTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotsRef = useRef<Map<string, TrailDot>>(new Map());
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(any-pointer: fine)").matches) return;

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(window.innerWidth * pixelRatio);
      canvas.height = Math.ceil(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      dotsRef.current.clear();
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const render = (timestamp: number) => {
      const elapsed = lastFrameRef.current ? timestamp - lastFrameRef.current : 16;
      lastFrameRef.current = timestamp;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const [key, dot] of dotsRef.current) {
        dot.intensity = Math.max(0, dot.intensity - (elapsed / fadeDuration) * trailIntensity);
        if (dot.intensity <= 0) {
          dotsRef.current.delete(key);
          continue;
        }

        context.save();
        context.globalAlpha = dot.intensity;
        context.shadowBlur = 5;
        context.shadowColor = "rgba(255, 140, 0, 0.2)";
        context.fillStyle = "#ff8c00";
        context.beginPath();
        context.arc(dot.x, dot.y, 1.6, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      if (dotsRef.current.size) frameRef.current = window.requestAnimationFrame(render);
      else {
        frameRef.current = null;
        lastFrameRef.current = 0;
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const centerX = Math.round(event.clientX / cellSize) * cellSize;
      const centerY = Math.round(event.clientY / cellSize) * cellSize;
      for (let x = centerX - cellSize; x <= centerX + cellSize; x += cellSize) {
        for (let y = centerY - cellSize; y <= centerY + cellSize; y += cellSize) {
          if (Math.hypot(event.clientX - x, event.clientY - y) > trailRadius) continue;
          const key = `${x}:${y}`;
          const existing = dotsRef.current.get(key);
          dotsRef.current.set(key, { x, y, intensity: Math.max(existing?.intensity || 0, trailIntensity) });
        }
      }
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return <canvas aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 opacity-70 mix-blend-screen" ref={canvasRef} />;
}