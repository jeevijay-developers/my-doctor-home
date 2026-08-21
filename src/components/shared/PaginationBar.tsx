import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export const PAGE_SIZE = 10;

type PaginationBarProps = {
  page: number;
  totalCount: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
};

const PaginationBar = ({ page, totalCount, pageSize = PAGE_SIZE, onPageChange }: PaginationBarProps) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  // Keep the pager compact: always show first, last, current ± 1, with
  // ellipses for gaps, rather than a full page-number list.
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const items = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  return (
    <Pagination className="justify-between sm:justify-center">
      <PaginationContent className="flex-wrap">
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            onClick={(e) => { e.preventDefault(); if (page > 1) onPageChange(page - 1); }}
          />
        </PaginationItem>
        {items.map((p, i) => (
          <PaginationItem key={p}>
            {i > 0 && p - items[i - 1] > 1 && (
              <span className="px-1.5 text-muted-foreground text-sm select-none">…</span>
            )}
            <PaginationLink
              href="#"
              isActive={p === page}
              onClick={(e) => { e.preventDefault(); onPageChange(p); }}
            >
              {p}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
            onClick={(e) => { e.preventDefault(); if (page < totalPages) onPageChange(page + 1); }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

export default PaginationBar;
