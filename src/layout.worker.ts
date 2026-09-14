import { computeLayout } from "./layout";
import type { LayoutRequest, LayoutResponse } from "./layout";
self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  let response: LayoutResponse;
  try {
    response = { status: "ready", positions: computeLayout(event.data) };
  } catch {
    response = { status: "fallback" };
  }
  self.postMessage(response);
};
