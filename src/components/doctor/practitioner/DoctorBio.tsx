import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { LONG_BIO_CHARS, bioParagraphs } from "@/lib/doctorSite/practitionerPage";
import { dsCn } from "../ui/dsCn";

/**
 * The doctor's own words, as PLAIN TEXT (a React text node: the bio is written by the doctor, never markup).
 * Paragraphs and line breaks are kept; a very long bio starts collapsed behind "Read more".
 */
const DoctorBio = ({ name, bio }: { name: string; bio: string | null | undefined }) => {
  const paragraphs = bioParagraphs(bio);
  const total = paragraphs.join("").length;
  const long = total > LONG_BIO_CHARS;
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <section aria-labelledby="about-doctor">
      <h2 id="about-doctor" className="font-ds-display text-ds-h3 font-medium">About {name}</h2>
      {paragraphs.length === 0 ? (
        <div className="mt-3 rounded-ds-md border border-dashed border-ds-line px-5 py-6">
          <p className="font-medium text-ds-ink">Profile coming soon</p>
          <p className="mt-1 text-[1.0625rem] text-ds-ink-2 sm:text-ds-body">
            {name} has not added an introduction yet. You can still see their hours and book a visit below.
          </p>
        </div>
      ) : (
        <>
          <div
            id={bodyId}
            className={dsCn("mt-3 max-w-[65ch] space-y-4", long && !open && "max-h-[22rem] overflow-hidden")}
          >
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line break-words text-[1.0625rem] leading-relaxed text-ds-ink-2 sm:text-ds-body">{p}</p>
            ))}
          </div>
          {long && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex min-h-11 items-center gap-1 text-[1.0625rem] font-medium text-ds-accent-ink underline-offset-4 hover:underline"
            >
              {open ? "Show less" : "Read more"}
              <ChevronDown aria-hidden="true" className={dsCn("h-4 w-4 transition-transform duration-ds-2", open && "rotate-180")} />
            </button>
          )}
        </>
      )}
    </section>
  );
};

export default DoctorBio;
