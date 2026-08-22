import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DateFilterProps = {
  selectedDate: Date;
  dateFilterActive: boolean;
  calendarOpen: boolean;
  onCalendarOpenChange: (open: boolean) => void;
  onDateChange: (date: Date) => void;
  onClear: () => void;
  datesWithRecords?: Set<string>;
  markerClassName?: string;
  activeLabel?: string;
  inactiveLabel?: string;
  clearClassName?: string;
};

const DateFilter = ({
  selectedDate,
  dateFilterActive,
  calendarOpen,
  onCalendarOpenChange,
  onDateChange,
  onClear,
  datesWithRecords = new Set(),
  markerClassName = "after:bg-royal",
  activeLabel = "Showing",
  inactiveLabel = "Showing all records",
  clearClassName = "text-royal",
}: DateFilterProps) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={calendarOpen} onOpenChange={onCalendarOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateFilterActive ? format(selectedDate, "EEE, d MMM yyyy") : "Filter by date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={dateFilterActive ? selectedDate : undefined}
              onSelect={(date) => {
                if (date) onDateChange(date);
              }}
              modifiers={{ hasRecords: (day) => datesWithRecords.has(format(day, "yyyy-MM-dd")) }}
              modifiersClassNames={{
                hasRecords: `relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full ${markerClassName}`,
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {dateFilterActive ? (
          <>
            <span className="text-xs text-muted-foreground">
              {activeLabel}: {format(selectedDate, "EEEE, d MMMM yyyy")}
            </span>
            <Button variant="ghost" size="sm" className={`h-7 gap-1 text-xs ${clearClassName}`} onClick={onClear}>
              <X className="h-3 w-3" /> Clear
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{inactiveLabel}</span>
        )}
      </div>
    </CardContent>
  </Card>
);

export default DateFilter;