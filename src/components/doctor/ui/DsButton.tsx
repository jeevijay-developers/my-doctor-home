import { forwardRef, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { dsCn as cn } from "./dsCn";
import { SPRING } from "../motion/tokens";

// The doctor site's one button. Pill-shaped, >= 48px tall, spring press feedback,
// optional magnetic pull on precise pointers. Renders an <a> when `href` is set so
// links (tel:, wa.me, routes) stay real links for assistive tech and long-press.

type Variant = "primary" | "secondary" | "quiet" | "inverse";
type Size = "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold " +
  "transition-[background-color,border-color,color,box-shadow] duration-ds-1 ease-ds-out " +
  "disabled:pointer-events-none disabled:opacity-50 [-webkit-tap-highlight-color:transparent] touch-manipulation";

const variants: Record<Variant, string> = {
  primary: "bg-ds-accent text-white shadow-ds-1 hover:bg-ds-accent-hover hover:shadow-ds-2",
  secondary: "border border-ds-line bg-ds-surface/70 text-ds-ink hover:border-ds-ink/30 hover:bg-ds-surface",
  quiet: "text-ds-ink hover:bg-ds-ink/[0.06]",
  inverse: "bg-ds-ink text-ds-paper hover:bg-ds-ink/90",
};

const sizes: Record<Size, string> = {
  md: "h-12 px-6 text-[0.9375rem]",
  lg: "h-14 px-7 text-base",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  /** Pull toward the cursor on hover (desktop only, off for reduced motion). */
  magnetic?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonProps = CommonProps & Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps | "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> & { href?: undefined };
type AnchorProps = CommonProps & Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps | "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> & { href: string };

export type DsButtonProps = ButtonProps | AnchorProps;

const MAGNET = 0.22;

const DsButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, DsButtonProps>(
  ({ variant = "primary", size = "md", magnetic = false, className, children, ...rest }, forwardedRef) => {
    const reduce = useReducedMotion();
    const localRef = useRef<HTMLElement | null>(null);
    const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 20, mass: 0.6 });
    const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 20, mass: 0.6 });
    const pullEnabled = magnetic && !reduce;

    const onPointerMove = (event: React.PointerEvent) => {
      if (!pullEnabled || event.pointerType !== "mouse" || !localRef.current) return;
      const rect = localRef.current.getBoundingClientRect();
      x.set((event.clientX - (rect.left + rect.width / 2)) * MAGNET);
      y.set((event.clientY - (rect.top + rect.height / 2)) * MAGNET);
    };
    const onPointerLeave = () => {
      x.set(0);
      y.set(0);
    };

    const setRef = (node: HTMLElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node as HTMLButtonElement & HTMLAnchorElement);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node;
    };

    // Compose rather than override what a caller passes.
    const callerStyle = (rest as { style?: React.CSSProperties }).style;
    const callerMove = (rest as { onPointerMove?: (e: React.PointerEvent) => void }).onPointerMove;
    const callerLeave = (rest as { onPointerLeave?: (e: React.PointerEvent) => void }).onPointerLeave;
    const shared = {
      ref: setRef,
      className: cn(base, variants[variant], sizes[size], className),
      style: pullEnabled ? { ...callerStyle, x, y } : callerStyle,
      whileTap: reduce ? undefined : { scale: 0.97 },
      transition: SPRING,
      onPointerMove: (event: React.PointerEvent) => {
        callerMove?.(event);
        onPointerMove(event);
      },
      onPointerLeave: (event: React.PointerEvent) => {
        callerLeave?.(event);
        onPointerLeave();
      },
    };

    if ("href" in rest && rest.href !== undefined) {
      const anchorProps = rest as Omit<AnchorProps, keyof CommonProps>;
      return (
        <motion.a {...(anchorProps as object)} {...shared}>
          {children}
        </motion.a>
      );
    }
    const buttonProps = rest as Omit<ButtonProps, keyof CommonProps>;
    return (
      <motion.button type="button" {...(buttonProps as object)} {...shared}>
        {children}
      </motion.button>
    );
  },
);
DsButton.displayName = "DsButton";

export default DsButton;
