import { useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { dsCn as cn } from "./dsCn";
import { useSplitReveal } from "../motion/useSplitReveal";
import { DUR, EASE } from "../motion/tokens";

type Props = {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  /** Right-hand slot on wide screens (e.g. a rating summary or "All articles"). */
  aside?: ReactNode;
  className?: string;
  /** Extra attributes for the <h2> (e.g. a data-* focus marker). */
  headingAttrs?: Record<string, string>;
};

/**
 * Section opening used across the doctor site: eyebrow, serif H2 with the
 * kinetic line reveal, optional intro and aside. `id` is the heading id the
 * section references via aria-labelledby.
 */
const SectionHeader = ({ id, eyebrow, title, intro, aside, className, headingAttrs }: Props) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useSplitReveal(headingRef);

  return (
    <div className={cn("flex flex-col gap-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-[40rem]">
        {eyebrow && <p className="ds-eyebrow">{eyebrow}</p>}
        <h2 id={id} ref={headingRef} tabIndex={-1} {...headingAttrs} className="mt-3 font-ds-display text-ds-h2 font-medium text-ds-ink outline-none">
          {title}
        </h2>
        {intro && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: DUR.medium, ease: EASE.out, delay: 0.1 }}
            className="mt-4 max-w-[52ch] text-ds-lead text-ds-ink-2"
          >
            {intro}
          </motion.p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
};

export default SectionHeader;
