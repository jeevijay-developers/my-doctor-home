import { useDoctorData } from "@/contexts/DoctorContext";

const GallerySection = () => {
  const { gallery } = useDoctorData();
  if (gallery.length === 0) return null;

  return (
    <section id="gallery" className="relative py-16 md:py-24 bg-secondary overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--pattern-line)) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />
      <div className="container mx-auto px-4 relative z-10">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Our Clinic</h2>
        <div
          className={
            gallery.length === 1
              ? "flex justify-center"
              : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto"
          }
        >
          {gallery.map((p: any) => (
            <div
              key={p.id}
              className={
                gallery.length === 1
                  ? "rounded-xl overflow-hidden group cursor-pointer w-full max-w-[360px]"
                  : "rounded-xl overflow-hidden group cursor-pointer"
              }
            >
              <img src={p.photo_url} alt={p.caption || "Clinic"} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
              {p.caption && <p className="text-sm text-text-gray text-center mt-2">{p.caption}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GallerySection;
