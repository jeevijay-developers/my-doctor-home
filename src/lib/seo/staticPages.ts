// Per-page SEO for the static marketing pages. They are client-rendered like the
// rest of the SPA, but the built index.html carries the HOMEPAGE title, description
// and canonical, so without this Googlebot's first look at /about, /terms etc. says
// "I am a copy of the homepage". api/seo.ts serves these through handleSeoRequest
// (kind=page) so each page declares itself.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { escapeHtml, INDEXABLE, NOINDEX, type PageHead } from "./injectHead";

interface StaticPage {
  title: string;
  description: string;
  h1: string;
  /** Login/signup are not search landing pages; keep them out of the index. */
  index: boolean;
}

export const STATIC_PAGES: Record<string, StaticPage> = {
  "/about": {
    title: "About Us | Doctylia",
    description:
      "Learn about Doctylia by Jeevijay Technologies, India's AI-powered website builder and clinic management platform for doctors.",
    h1: "About Doctylia",
    index: true,
  },
  "/features": {
    title: "Features | Doctylia",
    description:
      "Doctylia features: branded clinic website, WhatsApp reminders, GST invoices with UPI QR, digital Rx and EMR, AI blog writer, teleconsultation and analytics.",
    h1: "Doctylia Features",
    index: true,
  },
  "/pricing": {
    title: "Pricing | Doctylia",
    description:
      "Simple monthly plans for doctors on Doctylia. Start a 7-day free trial, then pick Pro or Premium, or request a custom plan.",
    h1: "Doctylia Pricing",
    index: true,
  },
  "/contact": {
    title: "Contact Us | Doctylia",
    description:
      "Contact the Doctylia team for a live demo, pricing help or support. Send an enquiry and we reply within 24 hours, Monday to Saturday.",
    h1: "Contact Doctylia",
    index: true,
  },
  "/terms": {
    title: "Terms of Service | Doctylia",
    description:
      "The terms that govern the use of Doctylia's website builder, online appointment booking and practice-management platform for doctors in India.",
    h1: "Terms of Service",
    index: true,
  },
  "/privacy": {
    title: "Privacy Policy | Doctylia",
    description: "How Doctylia collects, uses and protects the personal information of doctors, clinic staff and patients.",
    h1: "Privacy Policy",
    index: true,
  },
  "/refund-policy": {
    title: "Refund Policy | Doctylia",
    description: "Doctylia's refund and cancellation policy for doctor subscription plans and online patient payments.",
    h1: "Refund Policy",
    index: true,
  },
  "/auth": {
    title: "Doctor & Staff Login | Doctylia",
    description: "Log in to Doctylia or create a doctor account to manage your clinic website, appointments and patients.",
    h1: "Doctor & Staff Login",
    index: false,
  },
};

/** Static pages served `noindex`; kept out of the sitemap. */
export const NOINDEX_STATIC_PATHS: readonly string[] = Object.entries(STATIC_PAGES)
  .filter(([, page]) => !page.index)
  .map(([path]) => path);

export function isStaticPagePath(path: string | null | undefined): path is string {
  return !!path && Object.prototype.hasOwnProperty.call(STATIC_PAGES, path);
}

export function buildStaticPageHead(origin: string, path: string): PageHead | null {
  if (!isStaticPagePath(path)) return null;
  const page = STATIC_PAGES[path];
  return {
    title: page.title,
    description: page.description,
    canonical: `${origin}${path}`,
    robots: page.index ? INDEXABLE : NOINDEX,
    bodyHtml: `<main><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.description)}</p></main>`,
  };
}
