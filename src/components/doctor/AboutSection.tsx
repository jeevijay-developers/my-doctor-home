import { useDoctorData } from "@/contexts/DoctorContext";

const AboutSection = () => {
  const { profile } = useDoctorData();

  return (
    <section id="about" className="py-16 md:py-24 bg-secondary">
      <div className="container mx-auto px-4">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">About the Doctor</h2>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-card rounded-2xl p-6 border border-border">
            <h3 className="font-heading font-semibold text-lg text-primary mb-3">Professional Background</h3>
            <div className="space-y-2 text-foreground">
              {profile?.qualifications && <p><strong>Qualifications:</strong> {profile.qualifications}</p>}
              {profile?.experience_years && <p><strong>Experience:</strong> {profile.experience_years}+ years</p>}
              {profile?.specialization && <p><strong>Specialization:</strong> {profile.specialization}</p>}
            </div>
          </div>
          {profile?.clinic_name && (
            <div className="bg-card rounded-2xl p-6 border border-border">
              <h3 className="font-heading font-semibold text-lg text-primary mb-3">Practice</h3>
              <p className="text-foreground">{profile.clinic_name}{profile.city ? `, ${profile.city}` : ""}</p>
              {profile.address && <p className="text-text-gray text-sm mt-1">{profile.address}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
