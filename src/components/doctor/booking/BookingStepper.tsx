import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { dsCn as cn } from "../ui/dsCn";
import { DUR, EASE } from "../motion/tokens";

/**
 * Numbered steps in equal columns, each label centered under its circle, joined by a rail
 * that runs from the first circle's center to the last one's and fills as the patient moves on.
 * Screen readers get "Step 2 of 3 · Your details" (live) and a progressbar.
 */
const BookingStepper = ({ labels, current }: { labels: string[]; current: number }) => {
  const total = labels.length;
  // The rail starts and ends at the centers of the outer columns.
  const inset = `${100 / (2 * total)}%`;
  return (
    <div>
      <p aria-live="polite" className="sr-only">
        Step {current} of {total} · {labels[current - 1]}
      </p>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-label="Booking progress" className="relative">
        <div aria-hidden="true" className="absolute top-4 h-[2px] -translate-y-1/2 rounded-full bg-ds-line" style={{ left: inset, right: inset }} />
        <motion.div
          aria-hidden="true"
          className="absolute top-4 h-[2px] origin-left -translate-y-1/2 rounded-full bg-gradient-to-r from-ds-accent to-[rgb(var(--ds-aurora-3))]"
          style={{ left: inset, right: inset }}
          initial={false}
          animate={{ scaleX: total > 1 ? (current - 1) / (total - 1) : 1 }}
          transition={{ duration: DUR.medium, ease: EASE.out }}
        />
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {labels.map((label, i) => {
            const n = i + 1;
            const done = n < current;
            const on = n === current;
            return (
              <li key={label} className="flex flex-col items-center gap-2 text-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-ds-label font-semibold transition-colors duration-ds-2",
                    done && "border-ds-accent bg-ds-accent text-white",
                    on && "border-ds-accent bg-ds-surface text-ds-accent-ink shadow-[0_0_0_4px_rgb(var(--ds-accent)/0.14)]",
                    !done && !on && "border-ds-line bg-ds-surface text-ds-ink-3",
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : n}
                </span>
                <span aria-hidden="true" className={cn("text-ds-label font-medium leading-tight", on ? "text-ds-ink" : "text-ds-ink-3")}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

export default BookingStepper;
