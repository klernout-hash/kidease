import { useEffect, useRef } from "react";
import { careCategoryArt } from "@/lib/care-category-art";

/** The surrounding category control supplies the accessible text label. */
export function CareCategoryIcon({ id, index = 0 }: { id: string; index?: number }) {
  const artRef = useRef<HTMLSpanElement>(null);
  const art = careCategoryArt(id);

  useEffect(() => {
    const node = artRef.current;
    const control = node?.closest("a, button");
    const image = node?.querySelector("img");
    if (!node || !control || !image) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = typeof IntersectionObserver === "undefined";
    let idle: Animation | undefined;
    let interaction: Animation | undefined;
    const canMove = () => visible && !document.hidden && !reducedMotion.matches;
    const cancel = () => {
      idle?.cancel();
      interaction?.cancel();
      idle = undefined;
      interaction = undefined;
    };
    const sync = () => {
      if (reducedMotion.matches) {
        cancel();
        return;
      }
      if (!canMove()) {
        idle?.pause();
        interaction?.pause();
        return;
      }
      if (!idle && typeof node.animate === "function") {
        // A gentle sway followed by a rest, without moving the label or control.
        idle = node.animate(
          [
            { offset: 0, transform: "rotate(0) translateY(0)" },
            { offset: 0.22, transform: "rotate(-2deg) translateY(-2px)" },
            { offset: 0.45, transform: "rotate(1.5deg) translateY(-1px)" },
            { offset: 0.65, transform: "rotate(0) translateY(0)" },
            { offset: 1, transform: "rotate(0) translateY(0)" },
          ],
          { duration: 6000, delay: index * 140, iterations: Infinity, easing: "ease-in-out" },
        );
      } else if (idle?.playState === "paused") {
        idle.play();
      }
      if (interaction?.playState === "paused") interaction.play();
    };
    const play = () => {
      if (!canMove() || typeof image.animate !== "function") return;
      interaction?.cancel();
      interaction = image.animate(
        [
          { offset: 0, transform: "rotate(0) translateY(0)" },
          { offset: 0.3, transform: "rotate(-6deg) translateY(-4px)" },
          { offset: 0.65, transform: "rotate(5deg) translateY(-2px)" },
          { offset: 1, transform: "rotate(0) translateY(0)" },
        ],
        { duration: 1050, easing: "cubic-bezier(.35, .05, .2, 1)", fill: "none" },
      );
    };
    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
      sync();
    });

    control.addEventListener("pointerenter", play);
    control.addEventListener("focus", play);
    control.addEventListener("click", play);
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);
    observer?.observe(control);
    sync();

    return () => {
      control.removeEventListener("pointerenter", play);
      control.removeEventListener("focus", play);
      control.removeEventListener("click", play);
      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
      observer?.disconnect();
      cancel();
    };
  }, [id, index]);

  if (!art) return null;

  return (
    <span
      ref={artRef}
      className="ke-category-art"
      aria-hidden="true"
    >
      <img
        className="ke-category-icon"
        src={art.src}
        alt=""
        width={256}
        height={256}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
