import { FlaskConical } from "lucide-react";

/** Shown whenever superadmin demo mode is on, so sample data is never mistaken for real data. */
const DemoBanner = () => (
  <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-foreground">
    <FlaskConical className="h-4 w-4 shrink-0" />
    <span>
      <strong>Demo data</strong> - sample figures for presentation only. Not connected to live records.
      Add <code>?demo=0</code> to the URL to switch back.
    </span>
  </div>
);

export default DemoBanner;
