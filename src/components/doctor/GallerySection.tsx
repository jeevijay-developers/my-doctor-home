import { useDoctorData } from "@/contexts/DoctorContext";

const GallerySection = () => {
  const { gallery } = useDoctorData();
  if (gallery.length === 0) return null;

  return (
    <section id="gallery" className="py-16 md:py-24 bg-secondary">
      <div className="container mx-auto px-4">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Our Clinic</h2>
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 max-w-4xl mx-auto">
          {gallery.map((p: any) => (
            <div
              key={p.id}
              className="rounded-xl overflow-hidden group cursor-pointer w-full xs:w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-1rem)] max-w-[320px]"
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
