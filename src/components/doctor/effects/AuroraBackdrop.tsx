import { useEffect, useRef } from "react";

/**
 * Drifting colour light behind a section (port of Aceternity's Aurora Background, done in
 * CSS: three radial gradients moved with transforms, so it never repaints). Paused while
 * the section is off screen; static for reduced motion (see doctor-site.css).
 */
const AuroraBackdrop = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) el.removeAttribute("data-paused");
      else el.setAttribute("data-paused", "");
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="ds-aurora">
      <span />
      <span />
      <span />
    </div>
  );
};

export default AuroraBackdrop;
