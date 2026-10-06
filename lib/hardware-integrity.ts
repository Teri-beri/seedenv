export type HardwareIntegrityStatus = "VERIFIED_PHYSICAL_NODE" | "EMULATOR_FLAGGED" | "UNVERIFIED";

export type HardwareSignals = {
  gpuRenderer: string | null;
  isTouchCapable: boolean | null;
  batteryLevel: number | null;
  isLowPowerMode: boolean | null;
  webglBlocked: boolean;
};

export type HardwareCheckResult = {
  integrity: HardwareIntegrityStatus;
  gpuRenderer: string;
  flags: string[];
};

const emulatorSignatures = [/SwiftShader/i, /llvmpipe/i, /VirtualBox/i, /Bluestacks/i, /Mesa Offscreen/i, /VMware/i, /Android Emulator/i, /Google SwiftShader/i];

// Heuristic only: browsers can mask or spoof these values, so a clean result means "no emulator signals", not proof of a physical device.
export function classifyHardwareSignals(signals: Pick<HardwareSignals, "gpuRenderer" | "isTouchCapable" | "webglBlocked"> | null, userAgent: string): HardwareCheckResult {
  if (!signals) return { integrity: "UNVERIFIED", gpuRenderer: "NOT_REPORTED", flags: [] };
  const flags: string[] = [];
  const gpuRenderer = signals.gpuRenderer?.slice(0, 200) || "UNKNOWN";
  if (signals.webglBlocked) flags.push("WEBGL_BLOCKED");
  const signature = emulatorSignatures.find((pattern) => pattern.test(gpuRenderer));
  if (signature) flags.push(`EMULATOR_GPU: ${gpuRenderer}`);
  if (/iPhone|iPad|Android/i.test(userAgent) && signals.isTouchCapable === false) flags.push("MOBILE_UA_WITHOUT_TOUCH");
  if (/HeadlessChrome|PhantomJS|Electron/i.test(userAgent)) flags.push("AUTOMATION_USER_AGENT");
  if (flags.length > 0) return { integrity: "EMULATOR_FLAGGED", gpuRenderer, flags };
  if (gpuRenderer === "UNKNOWN") return { integrity: "UNVERIFIED", gpuRenderer, flags };
  return { integrity: "VERIFIED_PHYSICAL_NODE", gpuRenderer, flags };
}

type BatteryManagerLike = { level: number; charging: boolean };

export async function collectHardwareSignals(): Promise<HardwareSignals | null> {
  if (typeof window === "undefined") return null;
  let gpuRenderer: string | null = null;
  let webglBlocked = false;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      gpuRenderer = String(gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "") || null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } else {
      webglBlocked = true;
    }
  } catch {
    webglBlocked = true;
  }

  let batteryLevel: number | null = null;
  try {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery;
    if (getBattery) batteryLevel = Math.round((await getBattery.call(navigator)).level * 100) / 100;
  } catch {
    batteryLevel = null;
  }

  // Browsers do not expose OS low-power mode; this stays null rather than being guessed.
  return { gpuRenderer, isTouchCapable: navigator.maxTouchPoints > 0, batteryLevel, isLowPowerMode: null, webglBlocked };
}
