import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const EXPLAINER_VIDEO_SRC = "/videos/doctylia-product-explainer.mp4";

type Props = {
  /** Classes for the trigger button. */
  className?: string;
  children: ReactNode;
};

/**
 * Opens the Doctylia product explainer (4 min, 1080p) in a modal player. The video is an animated
 * overview (the doctor's workload, a professional online presence, then appointments, records,
 * prescriptions, billing and reports in one place), not a live or interactive product demo.
 * Radix unmounts the dialog content on close, so the video stops and releases
 * its buffer; nothing is downloaded until the dialog is opened (preload="metadata").
 */
const DemoVideoDialog = ({ className, children }: Props) => (
  <Dialog>
    <DialogTrigger asChild>
      <button type="button" className={className}>
        {children}
      </button>
    </DialogTrigger>
    <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl gap-0 overflow-hidden border-0 bg-black p-0 sm:rounded-2xl sm:p-0 [&>button]:text-white [&>button]:opacity-90 [&>button:hover]:opacity-100">
      <div className="bg-navy px-5 py-4 pr-14 text-white">
        <DialogTitle className="font-heading text-lg font-bold leading-tight sm:text-xl">Doctylia in 4 minutes</DialogTitle>
        <DialogDescription className="mt-1 text-sm leading-snug text-white/75">
          An animated overview of how Doctylia gives a doctor a professional online presence, easier appointments for
          patients, and one organised place for records, prescriptions and billing.
        </DialogDescription>
      </div>
      <video
        src={EXPLAINER_VIDEO_SRC}
        controls
        autoPlay
        playsInline
        preload="metadata"
        controlsList="nodownload"
        className="block aspect-video w-full bg-black"
      >
        Your browser does not support embedded video.
      </video>
    </DialogContent>
  </Dialog>
);

export default DemoVideoDialog;
