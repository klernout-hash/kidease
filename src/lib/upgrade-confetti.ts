/**
 * Full-screen burst for a confirmed paid upgrade only.
 * canvas-confetti stays out of the main bundle until this runs.
 * Brand hexes match the light and dark tokens in src/styles.css.
 */
export const UPGRADE_CONFETTI_MS = 2000;

export const UPGRADE_CONFETTI_COLORS = [
  "#1a3790",
  "#6d89d8",
  "#1a7a5a",
  "#4ea882",
  "#eef2fb",
] as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Side bursts, then remove the canvas. Returns a cancel for unmount. */
export function burstUpgradeConfetti(): () => void {
  if (typeof document === "undefined" || prefersReducedMotion()) return () => {};

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("data-ke", "upgrade-confetti");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.right = "0";
  canvas.style.bottom = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "75";
  document.body.appendChild(canvas);

  let cancel = false;
  let stop = () => {
    canvas.remove();
  };

  void import("canvas-confetti")
    .then((mod) => {
      if (cancel || !canvas.isConnected) {
        canvas.remove();
        return;
      }
      const fire = mod.default.create(canvas, {
        resize: true,
        useWorker: false,
        disableForReducedMotion: true,
      });
      const timer = window.setTimeout(() => {
        fire.reset();
        canvas.remove();
      }, UPGRADE_CONFETTI_MS);
      stop = () => {
        window.clearTimeout(timer);
        fire.reset();
        canvas.remove();
      };
      if (cancel) {
        stop();
        return;
      }
      const shared = {
        particleCount: 42,
        spread: 62,
        startVelocity: 34,
        ticks: 100,
        gravity: 1.15,
        decay: 0.92,
        scalar: 0.8,
        colors: [...UPGRADE_CONFETTI_COLORS],
        disableForReducedMotion: true,
      };
      void fire({ ...shared, angle: 60, origin: { x: 0, y: 0.68 } });
      void fire({ ...shared, angle: 120, origin: { x: 1, y: 0.68 } });
    })
    .catch(() => {
      stop();
    });

  return () => {
    cancel = true;
    stop();
  };
}
