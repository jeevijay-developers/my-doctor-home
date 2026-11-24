import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";
import { dsCn as cn } from "./dsCn";

// Adapted from Magic UI "Shine Border" (MIT, https://magicui.design/docs/components/shine-border).
// Changes: keyframes live in src/styles/doctor-site.css (`ds-shine`) instead of the global
// Tailwind config, the default palette is the doctor site's warm sheen, and the sweep
// (a paint-bound animation) pauses whenever the border is off screen.

interface ShineBorderProps extends HTMLAttributes<HTMLDivElement> {
  borderWidth?: number;
  /** Seconds per sweep. */
  duration?: number;
  shineColor?: string | string[];
}

export function ShineBorder({
  borderWidth = 1,
  duration = 12,
  shineColor = ["rgb(var(--ds-star) / 0.9)", "rgb(var(--ds-accent) / 0.55)"],
  className,
  style,
  ...props
}: ShineBorderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={
        {
          "--ds-shine-duration": `${duration}s`,
          animationPlayState: onScreen ? "running" : "paused",
          backgroundImage: `radial-gradient(transparent, transparent, ${
            Array.isArray(shineColor) ? shineColor.join(",") : shineColor
          }, transparent, transparent)`,
          backgroundSize: "300% 300%",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: `${borderWidth}px`,
          ...style,
        } as CSSProperties
      }
      className={cn("ds-shine pointer-events-none absolute inset-0 size-full rounded-[inherit]", className)}
      {...props}
    />
  );
}
