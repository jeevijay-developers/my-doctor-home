import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import HubArticleCard from "@/components/blog/HubArticleCard";
import { supabase } from "@/integrations/supabase/client";
import { ARTICLES_BASE, type HubArticle } from "@/lib/seo/healthArticlesSeo";

const MIN_TO_SHOW = 3;

/** Homepage strip: internal links from the highest-authority page to the hub and to fresh articles. */
const LatestArticles = () => {
  const [articles, setArticles] = useState<HubArticle[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)("search_blog_posts", { p_query: null, p_category: null, p_limit: 6, p_offset: 0 }) as Promise<{ data: HubArticle[] | null; error: unknown }>,
    )
      .then(({ data, error }) => { if (!cancelled && !error) setArticles(data ?? []); })
      .catch(() => { /* hub RPC unavailable: render nothing */ });
    return () => { cancelled = true; };
  }, []);

  if (articles.length < MIN_TO_SHOW) return null;

  return (
    <section id="health-articles" className="py-12 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal">Written by doctors</p>
            <h2 className="mt-1 font-heading text-2xl font-bold text-primary md:text-4xl">Latest Health Articles</h2>
          </div>
          <Link to={ARTICLES_BASE} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-royal hover:underline">
            View all articles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => <li key={a.id}><HubArticleCard article={a} /></li>)}
        </ul>
      </div>
    </section>
  );
};

export default LatestArticles;
