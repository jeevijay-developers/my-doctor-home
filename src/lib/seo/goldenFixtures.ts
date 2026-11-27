// Shared fixtures for the single-doctor golden tests (blogSeo, healthArticlesSeo, directorySeo).
// Their expected output was captured from the code BEFORE multi-doctor changes and must not move.
export const ORIGIN = "https://doctylia.com";

export const blogDoctor = {
  slug: "dr-anita-sharma", full_name: "anita sharma", display_name: "Anita Sharma", specialization: "Dentist", city: "Kota",
  clinic_name: "Sharma Dental Clinic", profile_photo_url: "https://cdn.example.com/anita.jpg",
};

export const blogPost = {
  id: "11111111-1111-4111-8111-111111111111", slug: "gum-care-basics", title: "Gum care basics", excerpt: "How to look after your gums.",
  content: "## Brush well\n\nBrush **twice** a day.\n\n- Floss daily\n- Visit your dentist",
  category: "Dental Health", featured_image_url: "https://cdn.example.com/gums.jpg",
  published_at: "2026-03-01T10:00:00Z", created_at: "2026-02-28T10:00:00Z", updated_at: "2026-03-02T10:00:00Z",
};

export const hubArticles = [
  {
    id: "a1", slug: "gum-care-basics", title: "Gum care basics", excerpt: "How to look after your gums.", category: "Dental Health",
    featured_image_url: null, published_at: "2026-03-01T10:00:00Z", updated_at: "2026-03-02T10:00:00Z", reading_minutes: 3,
    doctor_slug: "dr-anita-sharma", doctor_name: "anita sharma", doctor_specialization: "Dentist", doctor_city: "Kota", doctor_photo_url: null,
  },
  {
    id: "a2", slug: "", title: "Heart & you", excerpt: null, category: "Cardiology", featured_image_url: null,
    published_at: null, updated_at: null, reading_minutes: 5,
    doctor_slug: "dr-ravi", doctor_name: "Dr. Ravi Rao", doctor_specialization: null, doctor_city: "Jaipur", doctor_photo_url: null,
  },
];
export const hubFacets = [
  { slug: "dental-health", label: "Dental Health", post_count: 4 },
  { slug: "cardiology", label: "Cardiology", post_count: "2" },
];

export const dirDoctors = [
  { slug: "dr-anita-sharma", full_name: "anita sharma", specialization: "Dentist", city: "Kota", locality: "Talwandi" },
  { slug: "dr ravi", full_name: "Dr. Ravi Rao", specialization: "Dentist", city: "Kota", locality: null },
];
export const dirFacets = [
  { kind: "city", slug: "kota", label: "Kota", doctor_count: 2 },
  { kind: "specialty", slug: "dentist", label: "Dentist", doctor_count: "2" },
];
