import { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import clinic1 from "@/assets/clinic-1.jpg";
import clinic2 from "@/assets/clinic-2.jpg";
import clinic3 from "@/assets/clinic-3.jpg";

const photos = [
  { src: clinic3, caption: "Clinic Exterior" },
  { src: clinic1, caption: "Reception Area" },
  { src: clinic2, caption: "Consultation Room" },
  { src: clinic1, caption: "Waiting Lounge" },
  { src: clinic2, caption: "ECG & Echo Room" },
  { src: clinic3, caption: "Building View" },
];

const GallerySection = () => {
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <section id="gallery" className="py-16 md:py-24 bg-secondary/50">
      <div className="container mx-auto px-4">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Our Clinic</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {photos.map((p, i) => (
            <div key={i} className={`relative overflow-hidden rounded-xl cursor-pointer group ${i < 2 ? "md:row-span-1" : ""}`} onClick={() => setLightbox(i)}>
              <img src={p.src} alt={p.caption} className="w-full h-48 md:h-56 object-cover transition-transform duration-300 group-hover:scale-105" />
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/40 transition-colors flex items-center justify-center">
                <p className="text-primary-foreground font-heading font-semibold opacity-0 group-hover:opacity-100 transition-opacity">{p.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-near-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-primary-foreground" onClick={() => setLightbox(null)}><X size={28} /></button>
          <button className="absolute left-4 text-primary-foreground" onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + photos.length) % photos.length); }}><ChevronLeft size={32} /></button>
          <img src={photos[lightbox].src} alt="" className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button className="absolute right-4 text-primary-foreground" onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % photos.length); }}><ChevronRight size={32} /></button>
        </div>
      )}
    </section>
  );
};

export default GallerySection;
