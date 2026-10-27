import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, MapPin, Star, Stethoscope } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentHead } from "@/hooks/useDocumentHead";
import { buildHubHead, hubHeading, hubPath, type DirectoryDoctor, type DirectoryFacet } from "@/lib/seo/directorySeo";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import { NOINDEX } from "@/lib/seo/injectHead";

const PAGE_SIZE = 24;

interface Row extends DirectoryDoctor {
  id: string;
  qualifications: string | null;
  state: string | null;
  consultation_fee: number | string | null;
  profile_photo_url: string | null;
  total_count: number | string;
}

const titleFromSlug = (slug?: string) =>
  slug ? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : undefined;

const DoctorDirectory = () => {
  const { city, specialty } = useParams<{ city?: string; specialty?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = (searchParams.get("q") ?? "").trim();

  const [input, setInput] = useState(q);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<DirectoryFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
      rpc("search_doctors", { p_query: q || null, p_city: city ?? null, p_specialty: specialty ?? null, p_limit: PAGE_SIZE, p_offset: 0 }),
      rpc("directory_facets", { p_city: city ?? null }),
    ]).then(([res, fac]) => {
      if (cancelled) return;
      if (res.error) {
        setError(true);
      } else {
        const data = (res.data ?? []) as Row[];
        setRows(data);
        setTotal(Number(data[0]?.total_count ?? 0));
      }
      setFacets(((fac.data ?? []) as DirectoryFacet[]).filter(Boolean));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [q, city, specialty, rpc]);

  const loadMore = async () => {
    setLoadingMore(true);
    const res = await rpc("search_doctors", {
      p_query: q || null, p_city: city ?? null, p_specialty: specialty ?? null, p_limit: PAGE_SIZE, p_offset: rows.length,
    });
    if (!res.error) setRows((prev) => [...prev, ...((res.data ?? []) as Row[])]);
    setLoadingMore(false);
  };

  const cityLabel = city ? rows[0]?.city?.trim() || titleFromSlug(city) : undefined;
  const specialtyLabel = specialty ? rows[0]?.specialization?.trim() || titleFromSlug(specialty) : undefined;
  const heading = q ? `Results for "${q}"` : hubHeading(cityLabel, specialtyLabel);

  const head = useMemo(
    () =>
      buildHubHead({
        origin: window.location.origin,
        citySlug: city, specialtySlug: specialty, cityLabel, specialtyLabel,
        doctors: rows, total, facets,
      }),
    [city, specialty, cityLabel, specialtyLabel, rows, total, facets],
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
    navigate(`${hubPath(city, specialty)}${value ? `?q=${encodeURIComponent(value)}` : ""}`);
  };

  const facetLinks = facets.filter((f) => (city ? f.kind === "specialty" : f.kind === "city"));

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-background">
      <LandingNavbar />
      <main className="container mx-auto px-4 pt-28 pb-16 max-w-5xl">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-3 flex flex-wrap gap-1">
          <Link to="/doctors" className="hover:text-royal">Doctors</Link>
          {city && <><span>/</span><Link to={hubPath(city)} className="hover:text-royal">{cityLabel}</Link></>}
          {city && specialty && <><span>/</span><span>{specialtyLabel}</span></>}
        </nav>

        <h1 className="font-heading font-bold text-2xl sm:text-3xl text-primary mb-2">{heading}</h1>
        {!loading && !error && (
          <p className="text-sm text-muted-foreground mb-5">
            {total} {total === 1 ? "doctor" : "doctors"} found
          </p>
        )}

        <form onSubmit={onSearch} role="search" className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search by doctor name, specialty or city"
              aria-label="Search doctors"
              className="pl-9 h-11"
              maxLength={80}
            />
          </div>
          <Button type="submit" className="h-11">Search</Button>
        </form>

        {facetLinks.length > 0 && (
          <nav aria-label={city ? "Specialties" : "Cities"} className="flex flex-wrap gap-2 mb-6">
            {facetLinks.slice(0, 40).map((f) => (
              <Link
                key={`${f.kind}-${f.slug}`}
                to={f.kind === "city" ? hubPath(f.slug) : hubPath(city, f.slug)}
                className={`px-3 py-1.5 rounded-full border text-sm hover:border-royal hover:text-royal transition-colors ${
                  f.slug === specialty ? "bg-royal text-white border-royal hover:text-white" : "bg-card"
                }`}
              >
                {f.label} <span className="text-muted-foreground">({Number(f.doctor_count)})</span>
              </Link>
            ))}
          </nav>
        )}

        {loading && <p className="text-muted-foreground py-12 text-center">Searching doctors…</p>}

        {!loading && error && (
          <p className="py-12 text-center text-muted-foreground">Doctor search is temporarily unavailable. Please try again shortly.</p>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground mb-3">No doctors found{q ? ` for "${q}"` : ""}.</p>
            <Button asChild variant="outline"><Link to="/doctors">Browse all doctors</Link></Button>
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                to={`/dr/${d.slug}`}
                className="flex gap-3 p-4 rounded-xl border bg-card hover:border-royal hover:shadow-md transition-all h-full"
              >
                {d.profile_photo_url ? (
                  <img src={d.profile_photo_url} alt="" loading="lazy" className="h-16 w-16 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    <Stethoscope className="h-7 w-7 text-royal" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="font-heading font-semibold text-primary truncate">{formatDoctorName(d.full_name ?? "")}</h2>
                  <p className="text-sm text-muted-foreground truncate">{[d.specialization, d.qualifications].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[d.clinic_name, d.locality, d.city].filter(Boolean).join(", ")}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs mt-1.5">
                    {Number(d.review_count) > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-warning text-warning" />
                        {Number(d.avg_rating).toFixed(1)} ({Number(d.review_count)})
                      </span>
                    )}
                    {d.experience_years ? <span>{d.experience_years} yrs exp</span> : null}
                    {Number(d.consultation_fee) > 0 && <span>₹{Number(d.consultation_fee)}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {!loading && rows.length < total && (
          <div className="text-center mt-6">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Show more doctors"}
            </Button>
          </div>
        )}
      </main>
      <LandingFooter />
    </div>
  );
};

export default DoctorDirectory;
