"use client";

import { useEffect, useRef } from "react";

// Matches the 44px `.terminal-grid` lines so pulses land on intersections.
const GRID_SPACING = 44;
const BASE_DOT_COLOR = "rgba(255, 255, 255, 0.05)";
const BASE_DOT_RADIUS = 1;
const PULSE_DURATION_MS = 1200;
const GLOW_RADIUS = 6;
const ARRIVAL_POST_FALLBACK_MS = 2000;

type ActivePoint = {
  col: number;
  row: number;
  start: number;
};

const EMERALD_PULSE = [16, 185, 129] as const; // #10B981

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export default function TelemetryGridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const active = new Map<string, ActivePoint>();
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let rafId: number | null = null;

    // Static base grid is pre-rendered once per resize, then blitted each frame.
    const baseLayer = document.createElement("canvas");
    const baseCtx = baseLayer.getContext("2d");

    const drawBase = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(baseLayer, 0, 0, width, height);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      cols = Math.ceil(width / GRID_SPACING) + 1;
      rows = Math.ceil(height / GRID_SPACING) + 1;

      for (const target of [canvas, baseLayer]) {
        target.width = Math.round(width * dpr);
        target.height = Math.round(height * dpr);
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (baseCtx) {
        baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        baseCtx.clearRect(0, 0, width, height);
        baseCtx.fillStyle = BASE_DOT_COLOR;
        baseCtx.beginPath();
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const x = c * GRID_SPACING;
            const y = r * GRID_SPACING;
            baseCtx.moveTo(x + BASE_DOT_RADIUS, y);
            baseCtx.arc(x, y, BASE_DOT_RADIUS, 0, Math.PI * 2);
          }
        }
        baseCtx.fill();
      }

      for (const [key, point] of active) {
        if (point.col >= cols || point.row >= rows) active.delete(key);
      }
      drawBase();
      if (active.size) startLoop();
    };

    const frame = (now: number) => {
      drawBase();

      for (const [key, point] of active) {
        const t = Math.min((now - point.start) / PULSE_DURATION_MS, 1);
        if (t >= 1) {
          active.delete(key);
          continue;
        }
        const intensity = 1 - easeOutCubic(t);
        const x = point.col * GRID_SPACING;
        const y = point.row * GRID_SPACING;
        const [r, g, b] = EMERALD_PULSE;

        const glow = ctx.createRadialGradient(x, y, 0, x, y, GLOW_RADIUS);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.4 * intensity})`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, GLOW_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity})`;
        ctx.beginPath();
        ctx.arc(x, y, BASE_DOT_RADIUS + 0.5 * intensity, 0, Math.PI * 2);
        ctx.fill();
      }

      if (active.size) {
        rafId = requestAnimationFrame(frame);
      } else {
        rafId = null;
        drawBase();
      }
    };

    function startLoop() {
      if (rafId === null) rafId = requestAnimationFrame(frame);
    }

    const pulse = (col: number, row: number) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      active.set(`${col}:${row}`, { col, row, start: performance.now() });
      startLoop();
    };

    // Each landing-page load announces itself once; the server fans that arrival
    // out to every open landing page (including this one) as a single pulse.
    let announced = false;
    const announceArrival = () => {
      if (announced) return;
      announced = true;
      fetch("/api/presence/arrive", { method: "POST", keepalive: true }).catch(() => {});
    };

    const events = new EventSource("/api/presence/stream");
    events.addEventListener("open", announceArrival);
    events.addEventListener("arrival", (event) => {
      try {
        const { x, y } = JSON.parse((event as MessageEvent<string>).data) as { x: number; y: number };
        pulse(Math.min(Math.floor(x * cols), cols - 1), Math.min(Math.floor(y * rows), rows - 1));
      } catch {}
    });
    const announceFallback = setTimeout(announceArrival, ARRIVAL_POST_FALLBACK_MS);

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      events.close();
      clearTimeout(announceFallback);
      if (rafId !== null) cancelAnimationFrame(rafId);
      active.clear();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
