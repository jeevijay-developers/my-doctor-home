import { createContext, useContext, useEffect, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import type { MotionValue } from "framer-motion";

const SPRING = { stiffness: 160, damping: 18, mass: 0.6 };
const TiltContext = createContext<{ glareX: MotionValue<string> | null; active: boolean }>({ glareX: null, active: false });

/** True on devices with a mouse/trackpad (no tilt on touch, where it would fight scrolling). */
function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setFine(mq.matches);
    const onChange = () => setFine(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return fine;
}

/**
 * A card that tilts towards the cursor in 3D, with children floating at different depths
 * (port of Aceternity's 3D Card Effect onto framer-motion springs). Flat on touch screens
 * and for reduced motion.
 */
export const TiltCard = ({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) => {
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const active = fine && !reduce;

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-max, max]), SPRING);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), SPRING);
  const glarePos = useSpring(useTransform(px, [-0.5, 0.5], [120, -20]), SPRING);
  const glareX = useMotionTemplate`${glarePos}%`;

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!active || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  };
  const leave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <TiltContext.Provider value={{ glareX: active ? glareX : null, active }}>
      <div className={className} style={{ perspective: 1100 }}>
        <motion.div
          onPointerMove={move}
          onPointerLeave={leave}
          style={active ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
          className="relative"
        >
          {children}
        </motion.div>
      </div>
    </TiltContext.Provider>
  );
};

/** A child of TiltCard lifted `depth` px towards the viewer while the card tilts. */
export const TiltLayer = ({ depth, children, className, style }: { depth: number; children: ReactNode; className?: string; style?: CSSProperties }) => {
  const { active } = useContext(TiltContext);
  return (
    <div className={className} style={active ? { ...style, transform: `translateZ(${depth}px)`, transformStyle: "preserve-3d" } : style}>
      {children}
    </div>
  );
};

/** A light streak across a photo that slides with the tilt. Put it inside the photo frame. */
export const TiltGlare = () => {
  const { glareX } = useContext(TiltContext);
  if (!glareX) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 mix-blend-soft-light"
      style={{
        backgroundImage: "linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 0.55) 50%, transparent 65%)",
        backgroundSize: "250% 100%",
        backgroundPositionX: glareX,
      }}
    />
  );
};
