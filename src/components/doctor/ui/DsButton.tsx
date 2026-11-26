import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { dsCn as cn } from "./dsCn";

// The doctor site's one button: a plain pill, >= 48px tall. No hover lift, press scale or
// cursor pull; only a colour change on hover. Renders an <a> when `href` is set so links
// (tel:, wa.me, routes) stay real links for assistive tech and long-press.

type Variant = "primary" | "secondary" | "quiet" | "inverse";
type Size = "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold " +
  "transition-[background-color,border-color,color] duration-ds-1 ease-ds-out " +
  "disabled:pointer-events-none disabled:opacity-50 [-webkit-tap-highlight-color:transparent] touch-manipulation";

const variants: Record<Variant, string> = {
  primary: "bg-ds-accent text-white hover:bg-ds-accent-hover",
  secondary: "border border-ds-line bg-ds-surface text-ds-ink hover:border-ds-ink/30",
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
  className?: string;
  children: ReactNode;
};

type ButtonProps = CommonProps & Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & { href?: undefined };
type AnchorProps = CommonProps & Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps> & { href: string };

export type DsButtonProps = ButtonProps | AnchorProps;

const DsButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, DsButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...rest }, forwardedRef) => {
    const classes = cn(base, variants[variant], sizes[size], className);

    if ("href" in rest && rest.href !== undefined) {
      const anchorProps = rest as Omit<AnchorProps, keyof CommonProps>;
      return (
        <a {...anchorProps} ref={forwardedRef as React.Ref<HTMLAnchorElement>} className={classes}>
          {children}
        </a>
      );
    }
    const buttonProps = rest as Omit<ButtonProps, keyof CommonProps>;
    return (
      <button type="button" {...buttonProps} ref={forwardedRef as React.Ref<HTMLButtonElement>} className={classes}>
        {children}
      </button>
    );
  },
);
DsButton.displayName = "DsButton";

export default DsButton;
