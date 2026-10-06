// In-process pub/sub for landing-page arrival pulses. SeedEnv runs as a single
// Render web instance, so an in-memory listener set reaches every connected visitor.

export type VisitorPulse = {
  // Normalized 0–1 viewport position so every visitor lights the same relative dot.
  x: number;
  y: number;
};

type Listener = (pulse: VisitorPulse) => void;

const MIN_BROADCAST_INTERVAL_MS = 150;

type Hub = { listeners: Set<Listener>; lastBroadcast: number };

const globalForPulse = globalThis as typeof globalThis & { __seedenvVisitorPulse?: Hub };
const hub: Hub = (globalForPulse.__seedenvVisitorPulse ??= { listeners: new Set(), lastBroadcast: 0 });

export function subscribeToVisitorPulses(listener: Listener) {
  hub.listeners.add(listener);
  return () => {
    hub.listeners.delete(listener);
  };
}

export function broadcastVisitorArrival() {
  const now = Date.now();
  // Global throttle so a burst (or abuse) of arrival requests can't flood clients.
  if (now - hub.lastBroadcast < MIN_BROADCAST_INTERVAL_MS) return false;
  hub.lastBroadcast = now;

  const pulse: VisitorPulse = { x: Math.random(), y: Math.random() };
  for (const listener of hub.listeners) {
    try {
      listener(pulse);
    } catch {
      hub.listeners.delete(listener);
    }
  }
  return true;
}
