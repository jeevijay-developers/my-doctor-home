import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const EXPLAINER_VIDEO_SRC = "/videos/doctylia-product-explainer.mp4";

type Props = {
  /** Classes for the trigger button. */
  className?: string;
  children: ReactNode;
};

/**
 * Opens the Doctylia product explainer (4 min, 1080p) in a modal player.
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
    <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl gap-0 overflow-hidden border-0 bg-black p-0 sm:rounded-2xl">
      <DialogTitle className="sr-only">Doctylia product explainer video</DialogTitle>
      <DialogDescription className="sr-only">
        A 4-minute walkthrough of the Doctylia practice management platform.
      </DialogDescription>
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
