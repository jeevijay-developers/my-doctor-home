import { MapPin, Phone, MessageCircle, Mail, Clock, Car, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

const hours = [
  { day: "Monday", time: "9:00 AM – 1:00 PM, 5:00 PM – 9:00 PM" },
  { day: "Tuesday", time: "9:00 AM – 1:00 PM, 5:00 PM – 9:00 PM" },
  { day: "Wednesday", time: "9:00 AM – 1:00 PM, 5:00 PM – 9:00 PM" },
  { day: "Thursday", time: "9:00 AM – 1:00 PM, 5:00 PM – 9:00 PM" },
  { day: "Friday", time: "9:00 AM – 1:00 PM, 5:00 PM – 9:00 PM" },
  { day: "Saturday", time: "9:00 AM – 2:00 PM" },
  { day: "Sunday", time: "Closed" },
];

const ClinicDetails = () => (
  <section id="contact" className="py-16 md:py-24 bg-card">
    <div className="container mx-auto px-4">
      <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Clinic Details & Contact</h2>
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Map */}
        <div className="space-y-4">
          <div className="w-full h-64 rounded-xl overflow-hidden border border-border bg-muted">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3769.5!2d72.83!3d19.13!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTnCsDA3JzQ4LjAiTiA3MsKwNDknNDguMCJF!5e0!3m2!1sen!2sin!4v1"
              width="100%" height="100%" style={{ border: 0 }} allowFullScreen loading="lazy"
              title="Clinic Location"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin size={20} className="text-royal flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-heading font-semibold text-foreground">Sharma Heart Care</p>
                <p className="text-sm text-text-gray">304, Sterling Heights, Andheri West, Mumbai, Maharashtra 400058</p>
              </div>
            </div>
            <p className="flex items-center gap-3 text-sm text-text-gray">
              <Navigation size={16} className="text-royal" />
              Near Andheri Metro Station, Exit 2
            </p>
            <p className="flex items-center gap-3 text-sm text-text-gray">
              <Car size={16} className="text-royal" />
              Free parking available in basement
            </p>
          </div>
          <Button variant="outline" className="border-royal text-royal hover:bg-royal hover:text-primary-foreground font-heading" asChild>
            <a href="https://maps.google.com" target="_blank" rel="noreferrer">
              <Navigation size={16} className="mr-2" /> Get Directions
            </a>
          </Button>
        </div>

        {/* Hours & Contact */}
        <div className="space-y-6">
          <div>
            <h3 className="font-heading font-semibold text-foreground flex items-center gap-2 mb-4">
              <Clock size={18} className="text-royal" /> Working Hours
            </h3>
            <div className="space-y-2">
              {hours.map(h => (
                <div key={h.day} className="flex justify-between text-sm py-2 border-b border-border last:border-0">
                  <span className="font-medium text-foreground">{h.day}</span>
                  <span className={h.time === "Closed" ? "text-destructive font-medium" : "text-text-gray"}>{h.time}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-gray mt-2">* Closed on 2nd and 4th Sundays</p>
          </div>

          <div className="space-y-3">
            <a href="tel:+919876543210" className="flex items-center gap-3 text-foreground hover:text-royal transition-colors">
              <Phone size={18} className="text-royal" />
              <span className="font-medium">+91 98765 43210</span>
            </a>
            <a href="https://wa.me/919876543210" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-foreground hover:text-success transition-colors">
              <MessageCircle size={18} className="text-success" />
              <span className="font-medium">+91 98765 43210 (WhatsApp)</span>
            </a>
            <a href="mailto:dr.rahul@sharmaheartcare.com" className="flex items-center gap-3 text-foreground hover:text-royal transition-colors">
              <Mail size={18} className="text-royal" />
              <span className="font-medium">dr.rahul@sharmaheartcare.com</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default ClinicDetails;
