import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, Search } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import HubArticleCard from "@/components/blog/HubArticleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentHead } from "@/hooks/useDocumentHead";
import {
  ARTICLES_PAGE_SIZE, articlesHeading, articlesPath, buildArticlesHead, totalPages,
  type ArticleFacet, type HubArticle,
} from "@/lib/seo/healthArticlesSeo";
import { NOINDEX } from "@/lib/seo/injectHead";

type Row = HubArticle & { total_count: number | string };

const titleFromSlug = (slug?: string) =>
  slug ? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : undefined;

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
  useDocumentHead({
    title: head.title,
    description: head.description,
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

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-background">
      <LandingNavbar />
      <main className="container mx-auto max-w-6xl px-4 pb-16 pt-28">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap gap-1 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-royal">Doctylia</Link><span>/</span>
          <Link to={articlesPath()} className="hover:text-royal">Health Articles</Link>
          {category && <><span>/</span><span>{categoryLabel}</span></>}
        </nav>

        <h1 className="mb-2 font-heading text-2xl font-bold text-primary sm:text-3xl">{heading}</h1>
        <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
          Practical, patient-friendly health guidance written by practising doctors across India. Every article is published by its author on their own clinic page, where you can also book an appointment.
        </p>

        <form onSubmit={onSearch} role="search" className="mb-6 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search articles, topics or doctors" aria-label="Search articles" className="h-11 pl-9" maxLength={80} />
          </div>
          <Button type="submit" className="h-11">Search</Button>
        </form>

        {facets.length > 0 && (
          <nav aria-label="Topics" className="mb-8 flex flex-wrap gap-2">
            <Link to={articlesPath()} className={`rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-royal hover:text-royal ${!category ? "border-royal bg-royal text-white hover:text-white" : "bg-card"}`}>All topics</Link>
            {facets.slice(0, 30).map((f) => (
              <Link key={f.slug} to={articlesPath(f.slug)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-royal hover:text-royal ${f.slug === category ? "border-royal bg-royal text-white hover:text-white" : "bg-card"}`}>
                {f.label} <span className="opacity-70">({Number(f.post_count)})</span>
              </Link>
            ))}
          </nav>
        )}

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-secondary" />)}
          </div>
        ) : error ? (
          <p role="alert" className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Couldn't load articles right now. Please try again.</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-semibold text-primary">No articles yet</p>
            <p className="mt-1 text-sm text-muted-foreground">New articles from doctors will appear here as they are published.</p>
          </div>
        ) : (
          <>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((a, i) => <li key={a.id}><HubArticleCard article={a} priority={page === 1 && i < 3} /></li>)}
            </ul>
            {pages > 1 && (
              <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3 text-sm">
                {page > 1 && <Link rel="prev" aria-label="Previous page" to={pageHref(page - 1)} className="rounded-full border px-4 py-2 hover:border-royal hover:text-royal">Previous</Link>}
                <span className="text-muted-foreground">Page {page} of {pages}</span>
                {page < pages && <Link rel="next" aria-label="Next page" to={pageHref(page + 1)} className="rounded-full border px-4 py-2 hover:border-royal hover:text-royal">Next</Link>}
              </nav>
            )}
          </>
        )}
      </main>
      <LandingFooter />
    </div>
  );
};

export default HealthArticlesHub;
