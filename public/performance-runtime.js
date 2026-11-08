/* Mobile performance layer. No changes to the original verified simulator bundle. */
(() => {
  "use strict";
  const narrowTouch = (() => {
    try {
      return window.matchMedia("(pointer: coarse)").matches &&
        Math.min(window.screen.width, window.screen.height) < 820;
    } catch { return false; }
  })();
  const compact = narrowTouch ||
    (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4) ||
    (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4);
  // 320x192 thumbnails instead of 640x384 on constrained devices: 75% fewer pixels.
  window.__AQUARIUM_THUMB_DPR__ = compact ? 1 : 2;

  const queue = [];
  let scheduled = false;
  let generation = 0;
  let completed = 0;

  function schedule() {
    if (scheduled || !queue.length || document.visibilityState === "hidden") return;
    scheduled = true;
    const ticket = ++generation;
    const runOne = () => {
      if (ticket !== generation) return; // a suspended background callback
      scheduled = false;
      if (document.visibilityState === "hidden") return;
      const task = queue.shift();
      if (!task) return;
      try { task.resolve(task.render()); }
      catch (error) { task.reject(error); }
      finally {
        completed += 1;
        schedule();
      }
    };
    // Only one WebGL thumbnail per idle slice instead of a synchronous burst.
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runOne, { timeout: 100 });
    } else {
      window.setTimeout(runOne, 48);
    }
  }

  window.__AQUARIUM_QUEUE_THUMB__ = (render) => {
    queue.push({
      render,
      resolve() {},
      reject(error) { console.warn("Thumbnail render failed", error); },
    });
    schedule();
  };
  window.__AQUARIUM_QUEUE_THUMB_ASYNC__ = (render) =>
    new Promise((resolve, reject) => {
      queue.push({ render, resolve, reject });
      schedule();
    });
  window.__FISH_AQUARIUM_PERF__ = Object.freeze({
    thumbnailScale: window.__AQUARIUM_THUMB_DPR__,
    pendingThumbnails: () => queue.length,
    renderedThumbnails: () => completed,
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      ++generation;
      scheduled = false;
    } else {
      schedule();
    }
  });
})();
