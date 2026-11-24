import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { dsCn as cn } from "../ui/dsCn";
import { DUR, EASE } from "../motion/tokens";

/**
 * Numbered steps with labels, joined by a line that fills as the patient moves on.
 * Screen readers get "Step 2 of 3 · Your details" (live) and a progressbar, as before.
 */
const BookingStepper = ({ labels, current }: { labels: string[]; current: number }) => {
  const total = labels.length;
  return (
    <div>
      <p aria-live="polite" className="sr-only">
        Step {current} of {total} · {labels[current - 1]}
      </p>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-label="Booking progress" className="relative">
        {/* The rail behind the dots, and its filled part. */}
        <div aria-hidden="true" className="absolute left-4 right-4 top-4 h-[2px] rounded-full bg-ds-line" />
        <motion.div
          aria-hidden="true"
          className="absolute left-4 top-4 h-[2px] origin-left rounded-full bg-gradient-to-r from-ds-accent to-[rgb(var(--ds-aurora-3))]"
          style={{ right: "1rem" }}
          initial={false}
          animate={{ scaleX: total > 1 ? (current - 1) / (total - 1) : 1 }}
          transition={{ duration: DUR.medium, ease: EASE.out }}
        />
        <ol className="relative flex justify-between">
          {labels.map((label, i) => {
            const n = i + 1;
            const done = n < current;
            const on = n === current;
            return (
              <li key={label} className={cn("flex flex-col gap-2", i === 0 ? "items-start" : i === total - 1 ? "items-end" : "items-center")}>
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
                <span aria-hidden="true" className={cn("text-ds-label font-medium", on ? "text-ds-ink" : "text-ds-ink-3")}>
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
