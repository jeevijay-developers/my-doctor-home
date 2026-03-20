import { ArrowRight } from "lucide-react";

const articles = [
  { title: "10 Warning Signs of Heart Disease You Shouldn't Ignore", category: "Heart Health", excerpt: "Learn the early symptoms that could save your life...", date: "10 Mar 2025" },
  { title: "Managing Hypertension: A Complete Guide for Indian Patients", category: "Blood Pressure", excerpt: "Practical tips for controlling BP with diet and medication...", date: "28 Feb 2025" },
  { title: "When Should You Get an Echo Test? A Cardiologist Explains", category: "Diagnostics", excerpt: "Understanding when an echocardiogram is truly necessary...", date: "15 Feb 2025" },
];

const BlogPreview = () => (
  <section className="py-16 md:py-24 bg-secondary/50">
    <div className="container mx-auto px-4">
      <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Health Articles by Dr. Sharma</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {articles.map((a, i) => (
          <div key={i} className="bg-card rounded-xl overflow-hidden border border-border hover:shadow-lg transition-shadow group cursor-pointer">
            <div className="h-40 gradient-hero opacity-80" />
            <div className="p-5">
              <span className="text-xs font-medium text-teal">{a.category}</span>
              <h3 className="font-heading font-semibold text-foreground mt-1 mb-2 group-hover:text-royal transition-colors">{a.title}</h3>
              <p className="text-sm text-text-gray mb-3">{a.excerpt}</p>
              <p className="text-xs text-text-gray">{a.date}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="text-center mt-8">
        <button className="inline-flex items-center gap-1 text-teal font-heading font-semibold hover:underline">
          View All Articles <ArrowRight size={16} />
        </button>
      </div>
    </div>
  </section>
);

export default BlogPreview;
