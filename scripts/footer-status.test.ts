import test from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import { Footer } from "../components/Footer";

function renderedText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return renderedText(node.props.children);
  return "";
}

test("footer displays the polished operational label only for configured health", () => {
  const previous = process.env.NEXT_PUBLIC_SEEDENV_STATUS;
  try {
    delete process.env.NEXT_PUBLIC_SEEDENV_STATUS;
    const unknown = renderedText(Footer());
    assert.match(unknown, /System Status/);
    assert.doesNotMatch(unknown, /All Systems Operational|uptime unverified|Status Unverified|99\.98/);
    process.env.NEXT_PUBLIC_SEEDENV_STATUS = "operational";
    assert.match(renderedText(Footer()), /All Systems Operational/);
    process.env.NEXT_PUBLIC_SEEDENV_STATUS = "degraded";
    assert.match(renderedText(Footer()), /Degraded Service/);
    assert.doesNotMatch(renderedText(Footer()), /All Systems Operational/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SEEDENV_STATUS;
    else process.env.NEXT_PUBLIC_SEEDENV_STATUS = previous;
  }
});