import { motion } from "framer-motion";

const logos = [
  "Apollo Hospitals", "Max Healthcare", "Fortis", "AIIMS Alumni", 
  "IMA Members", "Medanta", "Narayana Health", "Manipal Hospitals",
  "Apollo Hospitals", "Max Healthcare", "Fortis", "AIIMS Alumni",
  "IMA Members", "Medanta", "Narayana Health", "Manipal Hospitals",
];

const MediaLogos = () => (
  <section className="py-6 md:py-8 bg-white border-y border-border/50 overflow-hidden">
    <div className="container mx-auto px-4 mb-4">
      <p className="text-center text-xs md:text-sm text-muted-foreground font-medium tracking-wide uppercase">
        Trusted by doctors from India's top hospitals & clinics
      </p>
    </div>
    <div className="relative">
      <div className="absolute left-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-l from-white to-transparent z-10" />
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="flex gap-8 md:gap-12 items-center whitespace-nowrap"
      >
        {logos.map((name, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 rounded-lg bg-secondary/50 border border-border/30 shrink-0"
          >
            <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-royal/10 flex items-center justify-center">
              <span className="text-royal font-bold text-[10px] md:text-xs">{name.charAt(0)}</span>
            </div>
            <span className="text-xs md:text-sm font-medium text-muted-foreground/70">{name}</span>
          </div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default MediaLogos;
