import { List } from "lucide-react";
import type { TocItem } from "@/lib/articleToc";

interface Props {
  headings: TocItem[];
  activeId: string | null;
  /** "sidebar" for desktop, "inline" for a collapsible panel on phones and tablets. */
  variant: "sidebar" | "inline";
}

/** Fewer than this many headings and a contents list is clutter, not help. */
export const MIN_TOC_HEADINGS = 3;

const ArticleToc = ({ headings, activeId, variant }: Props) => {
  if (headings.length < MIN_TOC_HEADINGS) return null;

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };

  const list = (
    <ol className="space-y-0.5">
      {headings.map((h) => {
        const active = h.id === activeId;
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => jump(e, h.id)}
              aria-current={active ? "location" : undefined}
              className={`block border-l-2 py-1.5 pr-2 text-sm leading-snug transition-colors ${
                h.level === 3 ? "pl-6" : "pl-3 font-medium"
              } ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-navy"
              }`}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ol>
  );

  if (variant === "inline") {
    return (
      <details className="group mb-8 rounded-2xl border border-border bg-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-navy [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <List className="h-4 w-4 text-primary" aria-hidden="true" /> In this article
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{headings.length}</span>
          </span>
          <span className="text-xs font-medium text-primary group-open:hidden">Show</span>
          <span className="hidden text-xs font-medium text-primary group-open:inline">Hide</span>
        </summary>
        <nav aria-label="In this article" className="max-h-72 overflow-y-auto border-t border-border px-4 py-3">
          {list}
        </nav>
      </details>
    );
  }

  return (
    <nav aria-label="In this article" className="rounded-2xl border border-border bg-card p-5">
      <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy">
        <List className="h-4 w-4 text-primary" aria-hidden="true" /> In this article
      </p>
      <div className="max-h-[50vh] overflow-y-auto">{list}</div>
    </nav>
  );
};

export default ArticleToc;
