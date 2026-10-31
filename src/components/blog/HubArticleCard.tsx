import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock3, Tag, User } from "lucide-react";
import { format } from "date-fns";
import BlogImagePlaceholder from "@/components/doctor/BlogImagePlaceholder";
import { articlePath, type HubArticle } from "@/lib/seo/healthArticlesSeo";
import { formatDoctorName } from "@/lib/seo/doctorSeo";

/** One article on the hub / homepage strip. The article itself lives on the doctor's site. */
const HubArticleCard = ({ article, priority = false }: { article: HubArticle; priority?: boolean }) => {
  const date = article.published_at ?? article.updated_at;
  const doctor = formatDoctorName(article.doctor_name ?? "");
  const where = [article.doctor_specialization, article.doctor_city].filter(Boolean).join(" · ");

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={articlePath(article)} className="flex flex-1 flex-col">
        <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
          {article.featured_image_url ? (
            <img
              src={article.featured_image_url}
              alt={article.title}
              width={640}
              height={400}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <BlogImagePlaceholder className="h-full w-full" />
          )}
          {article.category && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm">
              <Tag className="h-3 w-3" /> {article.category}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {date && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(date), "MMM d, yyyy")}</span>}
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{article.reading_minutes} min read</span>
          </div>
          <h2 className="mt-3 line-clamp-2 font-heading text-lg font-bold leading-snug text-primary group-hover:text-royal">{article.title}</h2>
          {article.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p>}
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-royal">
            Read article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
      <Link to={`/dr/${article.doctor_slug}`} className="flex items-center gap-3 border-t px-5 py-3 hover:bg-secondary/60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
          {article.doctor_photo_url ? (
            <img src={article.doctor_photo_url} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <User className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-primary">{doctor}</span>
          {where && <span className="block truncate text-xs text-muted-foreground">{where}</span>}
        </span>
      </Link>
    </article>
  );
};

export default HubArticleCard;
