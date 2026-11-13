import { useEffect, useRef, type CSSProperties } from "react";
import { careCategoryArt } from "@/lib/care-category-art";

/** The surrounding category control supplies the accessible text label. */
export function CareCategoryIcon({ id, index = 0 }: { id: string; index?: number }) {
  const artRef = useRef<HTMLSpanElement>(null);
  const art = careCategoryArt(id);

  useEffect(() => {
    const node = artRef.current;
    const control = node?.closest("a, button");
    if (!node || !control) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => node.getAnimations?.().forEach((animation) => animation.cancel());
    const play = () => {
      if (reducedMotion.matches) {
        cancel();
        return;
      }
      if (typeof node.animate !== "function" || typeof node.getAnimations !== "function") return;
      cancel();
      node.animate(
        [
          { offset: 0, transform: "rotate(0) translateY(0)" },
          { offset: 0.3, transform: "rotate(-6deg) translateY(-4px)" },
          { offset: 0.65, transform: "rotate(5deg) translateY(-2px)" },
          { offset: 1, transform: "rotate(0) translateY(0)" },
        ],
        { duration: 1050, easing: "cubic-bezier(.35, .05, .2, 1)", fill: "none" },
      );
    };
    const onMotionChange = () => {
      if (reducedMotion.matches) cancel();
    };

    control.addEventListener("pointerenter", play);
    control.addEventListener("focus", play);
    control.addEventListener("click", play);
    reducedMotion.addEventListener("change", onMotionChange);
    onMotionChange();

    return () => {
      control.removeEventListener("pointerenter", play);
      control.removeEventListener("focus", play);
      control.removeEventListener("click", play);
      reducedMotion.removeEventListener("change", onMotionChange);
      cancel();
    };
  }, [id]);

  if (!art) return null;

  return (
    <span
      ref={artRef}
      className="ke-category-art"
      aria-hidden="true"
      style={{ "--ke-category-delay": `${index * 0.14}s` } as CSSProperties}
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
