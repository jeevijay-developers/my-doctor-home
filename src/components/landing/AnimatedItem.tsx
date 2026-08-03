import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedItemProps {
  children: ReactNode;
  className?: string;
  index?: number;
  staggerMs?: number;
}

const AnimatedItem = ({ children, className = "", index = 0, staggerMs = 100 }: AnimatedItemProps) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : (index * staggerMs) / 1000, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedItem;
