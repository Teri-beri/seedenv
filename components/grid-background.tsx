"use client";

import { useEffect, useRef } from "react";

const cellSize = 40;
const trailRadius = 56;
const fadeMs = 1000;
const spawnPulseCount = 22;

type Dot = {
  x: number;
  y: number;
  intensity: number;
};

function nearestGridPoint(value: number) {
  return Math.round(value / cellSize) * cellSize;
}

export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotsRef = useRef<Map<string, Dot>>(new Map());
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;
    const context = canvasElement.getContext("2d");
    if (!context) return;
    const context2d = context;

    function keyFor(x: number, y: number) {
      return `${x}:${y}`;
    }

    function lightDot(x: number, y: number, intensity = 1) {
      dotsRef.current.set(keyFor(x, y), { x, y, intensity });
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      sizeRef.current = { width, height, dpr };
      canvasElement.width = Math.ceil(width * dpr);
      canvasElement.height = Math.ceil(height * dpr);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      context2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seedInitialPulse() {
      const { width, height } = sizeRef.current;
      const columns = Math.max(1, Math.floor(width / cellSize));
      const rows = Math.max(1, Math.floor(height / cellSize));

      for (let index = 0; index < spawnPulseCount; index += 1) {
        const column = Math.floor(Math.random() * (columns + 1));
        const row = Math.floor(Math.random() * (rows + 1));
        lightDot(column * cellSize, row * cellSize, 0.72 + Math.random() * 0.28);
      }
    }

    function drawGrid(width: number, height: number) {
      context2d.strokeStyle = "rgba(148, 163, 184, 0.05)";
      context2d.lineWidth = 1;
      context2d.beginPath();

      for (let x = 0; x <= width + cellSize; x += cellSize) {
        context2d.moveTo(x + 0.5, 0);
        context2d.lineTo(x + 0.5, height);
      }

      for (let y = 0; y <= height + cellSize; y += cellSize) {
        context2d.moveTo(0, y + 0.5);
        context2d.lineTo(width, y + 0.5);
      }

      context2d.stroke();
    }

    function drawBaseDots(width: number, height: number) {
      context2d.fillStyle = "rgba(255, 255, 255, 0.075)";
      for (let x = 0; x <= width + cellSize; x += cellSize) {
        for (let y = 0; y <= height + cellSize; y += cellSize) {
          context2d.beginPath();
          context2d.arc(x, y, 1, 0, Math.PI * 2);
          context2d.fill();
        }
      }
    }

    function drawActiveDots(deltaMs: number) {
      for (const [key, dot] of dotsRef.current) {
        dot.intensity = Math.max(0, dot.intensity - deltaMs / fadeMs);
        if (dot.intensity <= 0) {
          dotsRef.current.delete(key);
          continue;
        }

        context2d.save();
        context2d.globalAlpha = dot.intensity;
        context2d.shadowBlur = 22;
        context2d.shadowColor = "rgba(34, 197, 94, 0.9)";
        context2d.fillStyle = "#22c55e";
        context2d.beginPath();
        context2d.arc(dot.x, dot.y, 2.4, 0, Math.PI * 2);
        context2d.fill();
        context2d.restore();
      }
    }

    function render(timestamp: number) {
      const { width, height } = sizeRef.current;
      const deltaMs = lastFrameRef.current ? timestamp - lastFrameRef.current : 16;
      lastFrameRef.current = timestamp;

      context2d.clearRect(0, 0, width, height);
      drawGrid(width, height);
      drawBaseDots(width, height);
      drawActiveDots(deltaMs);

      animationRef.current = requestAnimationFrame(render);
    }

    function handleMouseMove(event: MouseEvent) {
      const centerX = nearestGridPoint(event.clientX);
      const centerY = nearestGridPoint(event.clientY);
      for (let x = centerX - cellSize; x <= centerX + cellSize; x += cellSize) {
        for (let y = centerY - cellSize; y <= centerY + cellSize; y += cellSize) {
          const distance = Math.hypot(event.clientX - x, event.clientY - y);
          if (distance <= trailRadius) lightDot(x, y, 1);
        }
      }
    }

    resize();
    seedInitialPulse();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    animationRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />;
}

