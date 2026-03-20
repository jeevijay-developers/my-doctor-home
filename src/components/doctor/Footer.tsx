import { Facebook, Instagram, Youtube, Linkedin, MessageCircle } from "lucide-react";
import logo from "@/assets/doctylia-logo.png";

const Footer = () => {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <footer className="bg-primary text-primary-foreground py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-heading font-bold text-xl mb-2">Dr. Rahul Sharma</h3>
              <p className="text-sm opacity-80">Cardiologist · MBBS, MD (Cardiology)</p>
              <p className="text-sm opacity-80 mt-1">Sharma Heart Care, Andheri West, Mumbai</p>
            </div>
            <div>
              <h4 className="font-heading font-semibold mb-3">Quick Links</h4>
              <div className="space-y-2 text-sm opacity-80">
                {["About", "Services", "Gallery", "Reviews", "Contact"].map(l => (
                  <button key={l} onClick={() => scrollTo(l.toLowerCase())} className="block hover:opacity-100 transition-opacity">{l}</button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-heading font-semibold mb-3">Follow Us</h4>
              <div className="flex gap-3">
                {[Facebook, Instagram, Youtube, Linkedin].map((Icon, i) => (
                  <a key={i} href="#" className="w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors">
                    <Icon size={18} />
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs opacity-60">© 2025 Dr. Rahul Sharma. All Rights Reserved.</p>
            <div className="flex items-center gap-2 opacity-40">
              <span className="text-xs">Powered by</span>
              <img src={logo} alt="Doctylia" className="h-5 brightness-200" />
            </div>
            <p className="text-xs opacity-40">For educational purposes only. Consult your doctor.</p>
          </div>
        </div>
      </footer>

      {/* WhatsApp Float */}
      <a href="https://wa.me/919876543210" target="_blank" rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-success shadow-xl flex items-center justify-center hover:scale-110 transition-transform">
        <MessageCircle size={26} className="text-primary-foreground" />
      </a>
    </>
  );
};

export default Footer;
