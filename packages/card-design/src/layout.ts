import { type RefObject, useEffect } from "react";

const namespace = "http://www.w3.org/2000/svg";

function placeHighlights(card: HTMLElement): void {
  const layer = card.querySelector<SVGSVGElement>(":scope > .highlight-layer");
  if (!layer) return;
  const cardBounds = card.getBoundingClientRect();
  layer.setAttribute("viewBox", `0 0 ${cardBounds.width} ${cardBounds.height}`);
  layer.replaceChildren(
    ...[...card.querySelectorAll("mark")]
      .flatMap((mark) => [...mark.getClientRects()])
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((bounds) => {
        const rect = document.createElementNS(namespace, "rect");
        rect.setAttribute("x", String(bounds.left - cardBounds.left));
        rect.setAttribute("y", String(bounds.top - cardBounds.top));
        rect.setAttribute("width", String(bounds.width));
        rect.setAttribute("height", String(bounds.height));
        return rect;
      }),
  );
}

function placeTimeline(card: HTMLElement): void {
  for (const track of card.querySelectorAll<HTMLElement>(".phase-track")) {
    const rail = track.querySelector<SVGSVGElement>(".phase-rail");
    const bounds = track.getBoundingClientRect();
    rail?.setAttribute("viewBox", `0 0 ${bounds.width} 8`);
    const labels = [...track.querySelectorAll(".phase")];
    for (const [index, dot] of [...track.querySelectorAll(".phase-dot")].entries()) {
      const label = labels[index]?.getBoundingClientRect();
      if (label) dot.setAttribute("cx", String(label.left + label.width / 2 - bounds.left));
    }
  }
}

function contentFits(card: HTMLElement): boolean {
  const content = card.querySelector<HTMLElement>(":scope > .card-content");
  const footer = card.querySelector<HTMLElement>(":scope > .card-footer");
  if (!content || !footer) return true;
  return (
    content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 0.5 &&
    footer.getBoundingClientRect().bottom <=
      card.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(card).paddingBottom) +
        0.5
  );
}

/** Scope every measurement and subscription to one mounted card. */
export function useCardLayout(
  ref: RefObject<HTMLElement | null>,
  content: readonly unknown[],
  fixed: boolean,
): void {
  useEffect(() => {
    const card = ref.current;
    if (!card || content.length === 0) return;
    let disposed = false;
    let frame = 0;
    let observedWidth = -1;
    const measure = () => {
      frame = 0;
      if (disposed) return;
      card.dataset.fit = "ready";
      card.style.setProperty("--card-fit", "1");
      card.style.setProperty("--card-rule-gap", "4.5pt");
      if (fixed) {
        let size = 9.5;
        while (!contentFits(card) && size > 7) {
          size = Math.max(7, size - 0.25);
          card.style.setProperty("--card-fit", String(size / 9.5));
          card.style.setProperty("--card-rule-gap", `${Math.max(2, size - 5)}pt`);
        }
        // Browser presentation retains all text by growing if the physical card cannot fit.
        if (!contentFits(card)) card.dataset.fit = "expanded";
      }
      placeHighlights(card);
      placeTimeline(card);
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined && width !== observedWidth) {
        observedWidth = width;
        schedule();
      }
    });
    observer.observe(card);
    void document.fonts.ready.then(schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [ref, content, fixed]);
}
