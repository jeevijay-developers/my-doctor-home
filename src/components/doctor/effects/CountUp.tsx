import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { EASE } from "../motion/tokens";
import { parseCount } from "@/lib/doctorSite/countUp";

/**
 * Counts the number in a short fact up from zero when it first scrolls into view (port of
 * Magic UI's Number Ticker). Text without a number, and reduced motion, render as-is.
 */
const CountUp = ({ text, duration = 1.4 }: { text: string; duration?: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const parsed = parseCount(text);

  useEffect(() => {
    const el = ref.current;
    const target = parseCount(text);
    if (!target || !inView || reduce || !el) return;
    const controls = animate(0, target.value, {
      duration,
      ease: EASE.out,
      onUpdate: (v) => {
        el.textContent = target.format(v);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, text, duration]);

  if (!parsed) return <>{text}</>;
  // One text node per part, so the fact reads (and matches) as its final text; only the
  // digits change while counting, which takes about a second after it scrolls into view.
  return (
    <>
      {parsed.prefix}
      <span ref={ref}>{parsed.format(parsed.value)}</span>
      {parsed.suffix}
    </>
  );
};

export default CountUp;
