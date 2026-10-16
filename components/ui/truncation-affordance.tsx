"use client";

import { useEffect } from "react";

/**
 * Gives every clipped single-line element a tooltip and a help cursor.
 *
 * CSS can truncate text but cannot report that it did, so the affordance has
 * to be measured. Doing that per call site means editing hundreds of cells and
 * missing new ones; this mounts once and watches the whole document instead.
 *
 * Only elements that are genuinely cut off are marked, so a cell whose text
 * fits looks exactly as it did before.
 */
export function TruncationAffordance() {
  useEffect(() => {
    let frame = 0;

    const scan = () => {
      frame = 0;

      const nodes = document.querySelectorAll<HTMLElement>(".truncate, .text-ellipsis");

      // Measure everything first, then write. Interleaving reads and writes
      // would force a reflow per element on tables with hundreds of cells.
      const measured: Array<[HTMLElement, boolean]> = [];

      for (const node of nodes) {
        // Sub-pixel layout leaves a fraction of overflow on text that visually
        // fits, so require a whole pixel before calling it clipped.
        measured.push([node, node.scrollWidth - node.clientWidth > 1]);
      }

      for (const [node, clipped] of measured) {
        if (!clipped) {
          if (node.dataset.clipped) {
            delete node.dataset.clipped;

            if (node.dataset.clippedTitle) {
              node.removeAttribute("title");
              delete node.dataset.clippedTitle;
            }
          }

          continue;
        }

        node.dataset.clipped = "true";

        // Never clobber a title the page already set — those are often richer
        // than the visible text (a full list behind a summary, say).
        if (!node.title) {
          const text = node.textContent?.trim();

          if (text) {
            node.title = text;
            node.dataset.clippedTitle = "true";
          }
        }
      }
    };

    const schedule = () => {
      if (frame) {
        return;
      }

      frame = requestAnimationFrame(scan);
    };

    schedule();

    // Re-measure when the DOM changes (pagination, filtering, dialogs) and
    // when layout changes (window resize, sidebar collapse, font load).
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true, characterData: true });

    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);

    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => {});

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }

      mutation.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return null;
}
