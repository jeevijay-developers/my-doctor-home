import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BulkSelectionBarProps {
  itemLabel: string;
  selectedCount: number;
  allOnPageSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDeleteClick: () => void;
}

// Floating bulk-action bar shared by the Patients and Prescriptions list
// pages — a two-row card on mobile (count/select-all/clear, then a
// full-width Delete Selected) and the original single-row pill on desktop.
const BulkSelectionBar = ({ itemLabel, selectedCount, allOnPageSelected, onSelectAll, onClear, onDeleteClick }: BulkSelectionBarProps) => {
  if (selectedCount === 0) return null;
  const countLabel = `${selectedCount} ${itemLabel}${selectedCount === 1 ? "" : "s"} selected`;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="fixed left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] sm:w-auto max-w-md"
      style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
    >
      {/* Mobile — two rows: count/select-all/clear, then a full-width Delete Selected */}
      <div className="sm:hidden bg-background/90 backdrop-blur-md border shadow-lg rounded-2xl p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground whitespace-nowrap truncate">{countLabel}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!allOnPageSelected && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs px-2.5 rounded-full border-royal/40 text-royal hover:bg-royal/10 hover:text-royal"
                onClick={onSelectAll}
              >
                Select all
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={onClear}>
              Clear
            </Button>
          </div>
        </div>
        <Button
          size="sm"
          className="h-9 w-full text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl"
          onClick={onDeleteClick}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Selected
        </Button>
      </div>

      {/* Desktop — single-row pill */}
      <div className="hidden sm:flex bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-6 py-3 items-center gap-4">
        <span className="text-sm font-medium text-foreground whitespace-nowrap">{countLabel}</span>
        <Button variant="ghost" size="sm" className="h-8 text-xs px-3" onClick={onClear}>
          Clear
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full px-4"
          onClick={onDeleteClick}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Selected
        </Button>
      </div>
    </div>
  );
};

export default BulkSelectionBar;
