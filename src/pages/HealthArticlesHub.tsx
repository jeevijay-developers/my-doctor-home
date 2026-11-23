import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, FileSignature, Gavel, MailCheck, Rocket, Search,
  Shield, ShieldCheck, Stethoscope, Tag, TrendingUp, User, Users,
} from "lucide-react";
import { format } from "date-fns";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentHead } from "@/hooks/useDocumentHead";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import {
  ARTICLES_PAGE_SIZE, articlePath, articlesHeading, articlesPath, buildArticlesHead, totalPages,
  type ArticleFacet, type HubArticle,
} from "@/lib/seo/healthArticlesSeo";
import { NOINDEX } from "@/lib/seo/injectHead";

type Row = HubArticle & { total_count: number | string };

const titleFromSlug = (slug?: string) =>
  slug ? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : undefined;

const SPECIALTY_PLAYBOOKS = [
  { id: "gp", label: "General Physicians", tag: "OPD Flow Optimization", title: "GP Quick-Rx: Fast Digital Prescriptions with an Indian Drug Formulary", desc: "How high-throughput family practitioners write error-free digital prescriptions with built-in drug interaction warnings and auto-dosage calculators for chronic hypertension and diabetes.", kpis: ["Indian generic brand mappings", "Automated refill WhatsApp nudge"] },
  { id: "derma", label: "Dermatology", tag: "Clinical Workflow", title: "Dermatology Protocol: Photo Case Timeline & Aesthetic Packages", desc: "Structured before-and-after photo capture right inside patient charts, coupled with multi-session procedure billing and customized skincare instruction handouts.", kpis: ["Side-by-side skin progress tracking", "Follow-up adherence reminders"] },
  { id: "ped", label: "Pediatrics", tag: "Clinical Workflow", title: "Pediatric Growth & Vaccine Milestone Automation", desc: "Automatic calculation of WHO percentile growth curves and timely WhatsApp reminder triggers for Indian Academy of Pediatrics (IAP) immunization schedules.", kpis: ["Auto-calculated IAP vaccination calendar", "On-time vaccination reminders"] },
  { id: "cardio", label: "Cardiology", tag: "Clinical Workflow", title: "Cardiology Hub: ECG Digitization & Ambulatory BP Tracking", desc: "Seamless synchronization of vitals, Holter monitoring telemetry, and automated alerts for hypertensive patients needing emergency titration consultations.", kpis: ["ECG trace PDF attachment", "WhatsApp alert for systolic spikes"] },
  { id: "dental", label: "Dental Clinics", tag: "Clinical Workflow", title: "Dental Suite: 32-Tooth Charting & Multi-Sitting Treatment Plans", desc: "Visual interactive odontogram for rapid decay, crown, and root canal status mapping with transparent stage-by-stage patient quotation generation.", kpis: ["Color-coded interactive odontogram", "Estimated vs actual procedure revenue logs"] },
];

const COMPLIANCE_ITEMS = [
  { icon: Shield, title: "DPDP Act 2023 for Outpatient Clinics", body: "Explicit consent requirements for storing patient phone numbers and WhatsApp messaging permissions." },
  { icon: FileSignature, title: "Digital Prescription Validity", body: "Requirements for doctor registration number, digital signatures, and schedule X drug restrictions under NMC guidelines." },
  { icon: Users, title: "Role-Based Staff Access", body: "Choose which sections each receptionist or team member can open, so patient records stay limited to the people who need them." },
];

const formatDate = (d?: string | null) => {
  if (!d) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : format(date, "MMM d, yyyy");
};

const authorOf = (a: HubArticle) => ({
  name: formatDoctorName(a.doctor_name ?? ""),
  where: [a.doctor_specialization, a.doctor_city].filter(Boolean).join(" · "),
});

const FeaturedArticle = ({ article }: { article: HubArticle }) => {
  const date = formatDate(article.published_at ?? article.updated_at);
  const { name, where } = authorOf(article);
  return (
    <article className="group relative overflow-hidden rounded-2xl border bg-card shadow-xl">
      <div className="grid grid-cols-1 items-stretch lg:grid-cols-12">
        <div className="z-10 order-2 flex flex-col justify-between p-5 sm:p-8 lg:order-none lg:col-span-7 lg:p-10">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground sm:mb-4">
              {article.category && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">{article.category}</span>
              )}
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{article.reading_minutes} min read</span>
              {date && <><span aria-hidden>•</span><span>Published {date}</span></>}
            </div>
            <h2 className="font-heading text-xl font-bold leading-tight text-navy sm:text-3xl">
              <Link to={articlePath(article)} className="transition-colors hover:text-royal after:absolute after:inset-0 after:content-['']">{article.title}</Link>
            </h2>
            {article.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:line-clamp-4 sm:text-base">{article.excerpt}</p>}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 sm:mt-6 sm:pt-6">
            <Link to={`/dr/${article.doctor_slug}`} className="relative z-10 flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary shadow-inner">
                {article.doctor_photo_url ? (
                  <img src={article.doctor_photo_url} alt="" width={44} height={44} loading="eager" decoding="async" className="h-full w-full object-cover" />
                ) : <Stethoscope className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-navy">{name}</span>
                {where && <span className="block truncate text-sm text-muted-foreground">{where}</span>}
              </span>
            </Link>
            <Link
              to={articlePath(article)}
              tabIndex={-1}
              aria-hidden="true"
              className="relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full py-2 pl-3 text-sm font-semibold text-royal transition-transform hover:underline group-hover:translate-x-1"
            >
              <span className="hidden sm:inline">Read Full Article</span><span className="sm:hidden">Read</span><ArrowRight className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </div>
        <div className="relative order-1 aspect-[16/10] overflow-hidden bg-gradient-to-tr from-secondary via-accent to-card lg:order-none lg:col-span-5 lg:aspect-auto lg:min-h-[320px]">
          {article.featured_image_url ? (
            <img src={article.featured_image_url} alt={article.title} width={640} height={400} loading="eager" fetchPriority="high" decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <img src="/stitch/landing-06.png" alt="" width={640} height={640} loading="eager" decoding="async"
                className="max-h-full w-full max-w-sm object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-105" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

const GridArticle = ({ article, priority }: { article: HubArticle; priority: boolean }) => {
  const date = formatDate(article.published_at ?? article.updated_at);
  const { name, where } = authorOf(article);
  return (
    <article className="group flex h-full flex-col justify-between rounded-2xl border bg-card p-4 shadow-md transition-all duration-300 hover:shadow-xl sm:p-6">
      <div>
        <div className="relative mb-4 flex aspect-[16/10] w-full sm:mb-5 sm:aspect-auto sm:h-44 items-center justify-center overflow-hidden rounded-xl bg-secondary">
          {article.featured_image_url ? (
            <img src={article.featured_image_url} alt={article.title} width={640} height={400} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
              className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <img src="/stitch/landing-02.png" alt="" width={640} height={400} loading={priority ? "eager" : "lazy"} decoding="async"
              className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy/50 via-transparent to-transparent" />
          {article.category && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-navy shadow-sm backdrop-blur">
              <Tag className="h-3 w-3" />{article.category}
            </span>
          )}
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="max-w-full truncate font-medium text-navy/80">{name}</span><span aria-hidden>•</span>
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{article.reading_minutes} min read</span>
          {date && <><span aria-hidden>•</span><span>{date}</span></>}
        </div>
        <h3 className="line-clamp-3 font-heading text-base font-bold leading-snug text-navy transition-colors group-hover:text-royal sm:text-lg">
          <Link to={articlePath(article)} className="after:absolute after:inset-0 after:content-['']">{article.title}</Link>
        </h3>
        {article.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:line-clamp-3 sm:text-base">{article.excerpt}</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 sm:mt-4 sm:border-t-0 sm:pt-6">
        <Link to={`/dr/${article.doctor_slug}`} className="relative z-10 flex min-w-0 items-center gap-2 text-xs font-semibold text-royal hover:underline">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
            {article.doctor_photo_url ? <img src={article.doctor_photo_url} alt="" width={24} height={24} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
          </span>
          <span className="truncate">{where || "View clinic"}</span>
        </Link>
        <Link
          to={articlePath(article)}
          tabIndex={-1}
          aria-hidden="true"
          className="relative z-10 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal transition-colors hover:bg-primary/10"
        >
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
};

const SpecialtyPlaybooks = () => {
  const [active, setActive] = useState(SPECIALTY_PLAYBOOKS[0].id);
  const item = SPECIALTY_PLAYBOOKS.find((s) => s.id === active) ?? SPECIALTY_PLAYBOOKS[0];
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-md sm:p-8 lg:col-span-7">
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4 sm:items-center">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-royal">Customized Clinical Workflows</span>
          <h3 className="mt-1 font-heading text-2xl font-bold text-navy">Specialty Playbooks</h3>
        </div>
        <Stethoscope className="h-7 w-7 text-royal" />
      </div>
      <div className="-mx-4 mb-4 flex snap-x snap-proximity gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:mb-2 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-4 sm:pt-2" role="tablist" aria-label="Specialties">
        {SPECIALTY_PLAYBOOKS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === active} onClick={() => setActive(s.id)}
            className={`shrink-0 snap-start whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all sm:rounded-lg sm:px-3.5 sm:py-1.5 ${s.id === active ? "bg-royal text-white shadow-sm" : "bg-secondary text-muted-foreground hover:bg-accent"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="space-y-4 rounded-xl bg-secondary/60 p-4 sm:p-5">
        <div>
          <span className="mb-2 inline-block rounded bg-royal/10 px-2.5 py-0.5 text-[11px] font-semibold text-royal">{item.tag}</span>
          <h4 className="font-heading text-lg font-semibold text-navy">{item.title}</h4>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{item.desc}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 border-t pt-3 text-sm text-navy sm:grid-cols-2">
          {item.kpis.map((k) => (
            <div key={k} className="flex items-center gap-2"><CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success" /><span>{k}</span></div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Link to="/features" className="inline-flex items-center gap-1 text-sm font-semibold text-royal hover:underline">Explore Doctylia Features <ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </div>
  );
};

const HealthArticlesHub = () => {
  const { category } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [input, setInput] = useState(q);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<ArticleFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => setInput(q), [q]);

  const rpc = useCallback(
    (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args) as Promise<{ data: any; error: any }>,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([
      rpc("search_blog_posts", { p_query: q || null, p_category: category ?? null, p_limit: ARTICLES_PAGE_SIZE, p_offset: (page - 1) * ARTICLES_PAGE_SIZE }),
      rpc("blog_facets", {}),
    ]).then(([res, fac]) => {
      if (cancelled) return;
      if (res.error) {
        setError(true);
        setRows([]);
        setTotal(0);
      } else {
        const data = (res.data ?? []) as Row[];
        setRows(data);
        setTotal(Number(data[0]?.total_count ?? 0));
      }
      setFacets(((fac.data ?? []) as ArticleFacet[]).filter(Boolean));
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError(true);
      setRows([]);
      setTotal(0);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [q, category, page, rpc]);

  const categoryLabel = category
    ? facets.find((f) => f.slug === category)?.label ?? rows[0]?.category?.trim() ?? titleFromSlug(category)
    : undefined;
  const heading = q ? `Results for "${q}"` : articlesHeading(categoryLabel);

  const head = useMemo(
    () => buildArticlesHead({ origin: window.location.origin, categorySlug: category, categoryLabel, page, articles: rows, total, facets }),
    [category, categoryLabel, page, rows, total, facets],
  );
  // Don't advertise a title/count before data arrives, and never index free-text searches.
  // The count is only known (and only describes the whole listing) once loaded and not searching.
  const neutralDescription = "Practical, patient-friendly health articles written by practising doctors across India. Browse by topic, then book an appointment with the author.";
  useDocumentHead({
    title: head.title,
    description: q || loading || error ? neutralDescription : head.description,
    canonical: head.canonical,
    robots: q || loading || error ? NOINDEX : head.robots,
  });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    navigate(`${articlesPath(category)}${value ? `?q=${encodeURIComponent(value)}` : ""}`);
  };

  const pages = totalPages(total);
  const pageHref = (p: number) => (q ? `${articlesPath(category)}?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}` : articlesPath(category, p));

  // Stitch's "featured story" slot = the newest/first real post on page 1; the rest fill the grid.
  const showFeatured = !loading && !error && rows.length > 0 && page === 1;
  const gridRows = showFeatured ? rows.slice(1) : rows;

  const pagination = pages > 1 && (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3 text-sm">
      {page > 1 && <Link rel="prev" aria-label="Previous page" to={pageHref(page - 1)} className="rounded-full border bg-card px-4 py-2 hover:border-royal hover:text-royal">Previous</Link>}
      <span className="text-muted-foreground">Page {page} of {pages}</span>
      {page < pages && <Link rel="next" aria-label="Next page" to={pageHref(page + 1)} className="rounded-full border bg-card px-4 py-2 hover:border-royal hover:text-royal">Next</Link>}
    </nav>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background font-body">
      <LandingNavbar />
      <main className="w-full pt-20">
        <div className="relative w-full overflow-hidden">
          <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[360px] w-[900px] max-w-full -translate-x-1/2 rounded-full bg-gradient-to-b from-royal/15 via-accent to-transparent blur-3xl" />

          {/* Hero & search */}
          <section className="mx-auto w-full max-w-[1440px] px-4 pb-6 pt-10 sm:px-6 lg:px-10 lg:pt-16">
            <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
              <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap justify-center gap-1 text-sm text-muted-foreground">
                <Link to="/" className="hover:text-royal">Doctylia</Link><span>/</span>
                <Link to={articlesPath()} className="hover:text-royal">Health Articles</Link>
                {category && <><span>/</span><span>{categoryLabel}</span></>}
              </nav>
              <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-royal shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-royal" />
                Doctylia Clinical &amp; Practice Insights
              </div>
              <h1 className="mt-4 font-heading text-3xl font-extrabold leading-tight tracking-tight text-navy md:text-5xl">{heading}</h1>
              <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Practical, patient-friendly health guidance written by practising doctors across India. Every article is published by its author on their own clinic page, where you can also book an appointment.
              </p>

              <form onSubmit={onSearch} role="search" className="relative mt-8 w-full max-w-2xl">
                <div className="relative flex items-center rounded-xl border bg-card p-2 shadow-md">
                  <Search className="ml-2 mr-1.5 h-5 w-5 shrink-0 text-muted-foreground sm:ml-3 sm:mr-2" />
                  <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search articles, topics or doctors" aria-label="Search articles" maxLength={80}
                    className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 sm:text-base" />
                  <button type="submit" aria-label="Explore articles" className="ml-1 flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-royal text-sm font-semibold text-white shadow-sm transition-all hover:bg-royal/90 active:scale-[0.98] sm:h-auto sm:w-auto sm:px-5 sm:py-2.5">
                    <span className="hidden sm:inline">Explore</span><ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>

              {facets.length > 0 && (
                <nav aria-label="Topics" className="-mx-4 mt-6 flex w-[calc(100%+2rem)] max-w-4xl snap-x snap-proximity items-center gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:w-full sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0">
                  <Link to={articlesPath()} className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium shadow-sm transition-all ${!category ? "bg-navy text-white" : "bg-card text-muted-foreground hover:bg-accent hover:text-royal"}`}>All Articles</Link>
                  {facets.slice(0, 30).map((f) => (
                    <Link key={f.slug} to={articlesPath(f.slug)} className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium shadow-sm transition-all ${f.slug === category ? "bg-navy text-white" : "bg-card text-muted-foreground hover:bg-accent hover:text-royal"}`}>
                      {f.label} <span className="opacity-70">({Number(f.post_count)})</span>
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </section>

          {/* Featured story + article grid (real data) */}
          {loading ? (
            <section className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10" aria-busy="true">
              <div className="h-80 animate-pulse rounded-2xl bg-secondary" />
              <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-secondary" />)}
              </div>
            </section>
          ) : error ? (
            <section className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10">
              <p role="alert" className="rounded-2xl border bg-card p-8 text-center text-muted-foreground shadow-md">Couldn't load articles right now. Please try again.</p>
            </section>
          ) : rows.length === 0 ? (
            <section className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10">
              <div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center shadow-sm">
                <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-semibold text-navy">No articles yet</p>
                <p className="mt-1 text-sm text-muted-foreground">New articles from doctors will appear here as they are published.</p>
              </div>
            </section>
          ) : (
            <>
              {showFeatured && (
                <section className="relative mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 lg:px-10"><FeaturedArticle article={rows[0]} /></section>
              )}
              {gridRows.length > 0 && (
                <section className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12 lg:px-10">
                  <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                      <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-royal"><TrendingUp className="h-[15px] w-[15px]" />Latest Editorials</div>
                      <h2 className="font-heading text-2xl font-bold text-navy">{q ? "Matching articles" : "Essential Health Guides from Practising Doctors"}</h2>
                    </div>
                    <span className="text-sm text-muted-foreground">Published by doctors on their own clinic pages</span>
                  </div>
                  <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
                    {gridRows.map((a, i) => <li key={a.id} className="relative"><GridArticle article={a} priority={page === 1 && i < 3} /></li>)}
                  </ul>
                  {pagination}
                </section>
              )}
              {gridRows.length === 0 && pagination}
            </>
          )}

          {/* Specialty playbooks + compliance corner */}
          <section className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
              <SpecialtyPlaybooks />
              <div className="flex h-full flex-col justify-between rounded-2xl bg-gradient-to-br from-navy to-royal p-6 text-white shadow-xl sm:p-8 lg:col-span-5">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase text-teal-bright backdrop-blur"><Gavel className="h-3.5 w-3.5" />Legal &amp; Compliance Corner</div>
                    <ShieldCheck className="h-6 w-6 shrink-0 text-teal-bright" />
                  </div>
                  <h3 className="mb-3 font-heading text-xl font-bold text-white">NMC Telemedicine &amp; Digital Health Compliance</h3>
                  <p className="mb-6 text-base leading-relaxed text-white/80">Digestible, practitioner-focused analyses of current healthcare acts, digital data protection laws, and clinical register mandates in India.</p>
                  <div className="space-y-3.5">
                    {COMPLIANCE_ITEMS.map(({ icon: Icon, title, body }) => (
                      <div key={title} className="flex items-start gap-3 rounded-xl bg-white/10 p-3.5 backdrop-blur-sm">
                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-bright" />
                        <div>
                          <div className="text-base font-semibold text-white">{title}</div>
                          <div className="mt-0.5 text-sm text-white/80">{body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Newsletter-style CTA (no newsletter backend: links to sign-up) */}
          <section className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10">
            <div className="relative overflow-hidden rounded-2xl bg-accent p-8 shadow-sm sm:p-12">
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-royal/5 blur-2xl" />
              <div className="relative z-10 mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-royal text-white shadow-sm"><MailCheck className="h-6 w-6" /></div>
                <h3 className="font-heading text-2xl font-bold text-navy">The Autonomous Doctor Weekly</h3>
                <p className="mx-auto mt-2 max-w-lg text-base leading-relaxed text-muted-foreground">Join Indian practitioners getting clinical workflow tips, tax advice, and patient engagement strategies from Doctylia. Create your free account to stay in the loop.</p>
                <Link to="/auth?mode=signup" className="mx-auto mt-6 inline-flex items-center justify-center gap-1.5 rounded-lg bg-royal px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-royal/90 active:scale-[0.98]">
                  Subscribe Free <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="mt-3 flex items-center justify-center gap-1 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />Zero spam guarantee
                </div>
              </div>
            </div>
          </section>

          {/* Bottom banner */}
          <section className="mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-6 lg:px-10">
            <div className="relative flex flex-col items-center justify-between gap-8 overflow-hidden rounded-2xl bg-gradient-to-r from-navy via-royal to-teal p-8 text-white shadow-2xl sm:p-12 lg:flex-row">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,_white_1px,_transparent_1px)] bg-[length:24px_24px] opacity-10" />
              <div className="relative z-10 max-w-xl text-center lg:text-left">
                <span className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-spark-bright">Autonomous Practice OS</span>
                <h2 className="font-heading text-3xl font-bold leading-tight text-white">Experience the Future of Clinic Operations</h2>
                <p className="mt-3 text-base leading-relaxed text-white/80">Eliminate reception bottlenecks, stop patient revenue leaks, and deliver a frictionless 5-star clinic experience for your patients today.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-white/80 lg:justify-start">
                  {["7-Day Full Access Trial", "Free Data Migration", "No Credit Card Required"].map((t) => (
                    <span key={t} className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-teal-bright" />{t}</span>
                  ))}
                </div>
              </div>
              <div className="relative z-10 flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
                <Link to="/auth?mode=signup" className="flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-center text-sm font-bold text-navy shadow-lg transition-all hover:bg-accent active:scale-[0.98]">
                  <span>Start 7-Day Free Trial</span><Rocket className="h-[18px] w-[18px]" />
                </Link>
                <Link to="/features" className="flex items-center justify-center gap-2 rounded-xl bg-navy/40 px-7 py-3.5 text-center text-sm font-semibold text-white backdrop-blur transition-all hover:bg-navy/60 active:scale-[0.98]">
                  <span>Explore Features</span><ArrowRight className="h-[18px] w-[18px]" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
};

export default HealthArticlesHub;
