/** Small, unobtrusive marker shown whenever superadmin demo mode is on. */
const DemoBanner = () => (
  <div className="flex justify-end">
    <span
      title="Sample figures for presentation only. Add ?demo=0 to the URL to switch back."
      className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-[11px] font-medium text-foreground"
    >
      Demo data
    </span>
  </div>
);

export default DemoBanner;
