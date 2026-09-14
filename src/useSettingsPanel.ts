import { useEffect } from "react";

// Mobile settings cover the graph, so keyboard and assistive-technology focus
// must stay in the visible panel until it closes.
export function useSettingsPanel(id: string | null) {
  useEffect(() => {
    if (!id) return;
    const panel = document.getElementById(id)!;
    const trigger = document.querySelector<HTMLElement>(
      `[aria-controls="${id}"]`,
    );
    const media = window.matchMedia("(max-width: 700px)");
    const background = new Map<HTMLElement, boolean>();
    const restoreBackground = () => {
      for (const [element, inert] of background) element.inert = inert;
      background.clear();
    };
    const disableBackground = () => {
      if (!media.matches) return;
      for (const child of panel.parentElement!.children) {
        if (
          !(child instanceof HTMLElement) ||
          child === panel ||
          child.classList.contains("panel-backdrop")
        )
          continue;
        if (!background.has(child)) background.set(child, child.inert);
        child.inert = true;
      }
    };
    const update = () => {
      restoreBackground();
      if (media.matches) {
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        disableBackground();
      } else {
        panel.removeAttribute("role");
        panel.removeAttribute("aria-modal");
      }
      panel.querySelector<HTMLElement>("button")?.focus();
    };
    const trap = (event: KeyboardEvent) => {
      if (!media.matches || event.key !== "Tab") return;
      const controls = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    update();
    const observer = new MutationObserver(disableBackground);
    observer.observe(panel.parentElement!, { childList: true });
    media.addEventListener("change", update);
    document.addEventListener("keydown", trap);
    return () => {
      restoreBackground();
      observer.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("keydown", trap);
      if (
        panel.contains(document.activeElement) ||
        document.activeElement === document.body
      )
        trigger?.focus();
    };
  }, [id]);
}
