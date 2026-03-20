const stats = [
  { number: "10,000+", label: "Doctors Trust Us" },
  { number: "5,00,000+", label: "Appointments Booked" },
  { number: "200+", label: "Cities in India" },
  { number: "99.9%", label: "Uptime" },
];

const TrustBar = () => (
  <section className="py-10 bg-primary">
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="font-heading font-extrabold text-2xl md:text-3xl text-white">{s.number}</div>
            <div className="text-sm text-primary-foreground/70 mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default TrustBar;
