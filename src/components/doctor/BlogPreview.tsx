import { useDoctorData } from "@/contexts/DoctorContext";

const BlogPreview = () => {
  const { settings } = useDoctorData();
  if (!settings?.show_blog) return null;

  return (
    <section id="blog" className="py-16 md:py-24 bg-secondary">
      <div className="container mx-auto px-4 text-center">
        <h2 className="font-heading font-bold text-3xl text-primary mb-4">Health Articles</h2>
        <p className="text-text-gray">Blog posts coming soon. Stay tuned for health tips and insights!</p>
      </div>
    </section>
  );
};

export default BlogPreview;
