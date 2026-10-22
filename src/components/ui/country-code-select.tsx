import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ISO 3166-1 alpha-2 -> flag emoji (regional indicator symbols), so flags
// don't need to be hand-typed/maintained for every country below.
function isoToFlagEmoji(iso2: string) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

// name + E.164 calling code per ISO 3166-1 alpha-2. India is listed first
// (and pinned first in the dropdown below) since it's the default/primary
// market; the rest are alphabetical by name.
//
// Note: OTP delivery (MSG91's DLT-templated flow, see
// supabase/functions/send-sms-hook) currently only works for Indian numbers
// — selecting another country here lets a user enter that number, but an
// OTP won't actually be deliverable until an international SMS route is
// added.
const RAW_COUNTRIES: { code: string; dial: string; name: string }[] = [
  { code: "IN", dial: "+91", name: "India" },
  { code: "AF", dial: "+93", name: "Afghanistan" },
  { code: "AL", dial: "+355", name: "Albania" },
  { code: "DZ", dial: "+213", name: "Algeria" },
  { code: "AR", dial: "+54", name: "Argentina" },
  { code: "AU", dial: "+61", name: "Australia" },
  { code: "AT", dial: "+43", name: "Austria" },
  { code: "BD", dial: "+880", name: "Bangladesh" },
  { code: "BE", dial: "+32", name: "Belgium" },
  { code: "BR", dial: "+55", name: "Brazil" },
  { code: "BG", dial: "+359", name: "Bulgaria" },
  { code: "KH", dial: "+855", name: "Cambodia" },
  { code: "CA", dial: "+1", name: "Canada" },
  { code: "CL", dial: "+56", name: "Chile" },
  { code: "CN", dial: "+86", name: "China" },
  { code: "CO", dial: "+57", name: "Colombia" },
  { code: "HR", dial: "+385", name: "Croatia" },
  { code: "CZ", dial: "+420", name: "Czech Republic" },
  { code: "DK", dial: "+45", name: "Denmark" },
  { code: "EG", dial: "+20", name: "Egypt" },
  { code: "FI", dial: "+358", name: "Finland" },
  { code: "FR", dial: "+33", name: "France" },
  { code: "DE", dial: "+49", name: "Germany" },
  { code: "GH", dial: "+233", name: "Ghana" },
  { code: "GR", dial: "+30", name: "Greece" },
  { code: "HK", dial: "+852", name: "Hong Kong" },
  { code: "HU", dial: "+36", name: "Hungary" },
  { code: "IS", dial: "+354", name: "Iceland" },
  { code: "ID", dial: "+62", name: "Indonesia" },
  { code: "IR", dial: "+98", name: "Iran" },
  { code: "IQ", dial: "+964", name: "Iraq" },
  { code: "IE", dial: "+353", name: "Ireland" },
  { code: "IL", dial: "+972", name: "Israel" },
  { code: "IT", dial: "+39", name: "Italy" },
  { code: "JP", dial: "+81", name: "Japan" },
  { code: "JO", dial: "+962", name: "Jordan" },
  { code: "KE", dial: "+254", name: "Kenya" },
  { code: "KW", dial: "+965", name: "Kuwait" },
  { code: "MY", dial: "+60", name: "Malaysia" },
  { code: "MX", dial: "+52", name: "Mexico" },
  { code: "MM", dial: "+95", name: "Myanmar" },
  { code: "NP", dial: "+977", name: "Nepal" },
  { code: "NL", dial: "+31", name: "Netherlands" },
  { code: "NZ", dial: "+64", name: "New Zealand" },
  { code: "NG", dial: "+234", name: "Nigeria" },
  { code: "NO", dial: "+47", name: "Norway" },
  { code: "OM", dial: "+968", name: "Oman" },
  { code: "PK", dial: "+92", name: "Pakistan" },
  { code: "PH", dial: "+63", name: "Philippines" },
  { code: "PL", dial: "+48", name: "Poland" },
  { code: "PT", dial: "+351", name: "Portugal" },
  { code: "QA", dial: "+974", name: "Qatar" },
  { code: "RO", dial: "+40", name: "Romania" },
  { code: "RU", dial: "+7", name: "Russia" },
  { code: "SA", dial: "+966", name: "Saudi Arabia" },
  { code: "RS", dial: "+381", name: "Serbia" },
  { code: "SG", dial: "+65", name: "Singapore" },
  { code: "ZA", dial: "+27", name: "South Africa" },
  { code: "KR", dial: "+82", name: "South Korea" },
  { code: "ES", dial: "+34", name: "Spain" },
  { code: "LK", dial: "+94", name: "Sri Lanka" },
  { code: "SE", dial: "+46", name: "Sweden" },
  { code: "CH", dial: "+41", name: "Switzerland" },
  { code: "TW", dial: "+886", name: "Taiwan" },
  { code: "TH", dial: "+66", name: "Thailand" },
  { code: "TR", dial: "+90", name: "Turkey" },
  { code: "UA", dial: "+380", name: "Ukraine" },
  { code: "AE", dial: "+971", name: "United Arab Emirates" },
  { code: "GB", dial: "+44", name: "United Kingdom" },
  { code: "US", dial: "+1", name: "United States" },
  { code: "VN", dial: "+84", name: "Vietnam" },
];

export const COUNTRY_CODES = RAW_COUNTRIES.map((c) => ({ ...c, flag: isoToFlagEmoji(c.code) }));

export type CountryCode = (typeof COUNTRY_CODES)[number]["code"];

export interface CountryCodeSelectProps {
  value?: CountryCode;
  onValueChange?: (value: CountryCode) => void;
  className?: string;
}

export function CountryCodeSelect({
  value,
  onValueChange,
  className,
}: CountryCodeSelectProps) {
  const [open, setOpen] = React.useState(false);
  // Uncontrolled by default (no value/onValueChange passed) so the trigger
  // still updates on selection when the parent isn't tracking the country —
  // falls back to a controlled value if one is passed in.
  const [internalValue, setInternalValue] = React.useState<CountryCode>("IN");
  const currentValue = value ?? internalValue;
  const selected = COUNTRY_CODES.find((c) => c.code === currentValue) ?? COUNTRY_CODES[0];

  const handleSelect = (code: CountryCode) => {
    setInternalValue(code);
    onValueChange?.(code);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-full gap-1 rounded-none border-0 border-r border-input bg-muted px-3 text-sm text-muted-foreground hover:bg-muted/80 focus-visible:ring-0 focus-visible:ring-offset-0",
            className,
          )}
        >
          <span>{selected.flag}</span>
          <span>{selected.dial}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRY_CODES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.dial}`}
                  onSelect={() => handleSelect(c.code)}
                >
                  <Check className={cn("mr-2 h-4 w-4", c.code === currentValue ? "opacity-100" : "opacity-0")} />
                  <span className="mr-2">{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-muted-foreground">{c.dial}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
