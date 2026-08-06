import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Default placeholder shown for blog/article cards and detail pages when the
 * doctor hasn't uploaded a featured image yet.
 */
const BlogImagePlaceholder = ({ className }: { className?: string }) => (
  <div className={cn("w-full h-full flex items-center justify-center bg-royal/5", className)}>
    <ImageIcon className="text-royal/25" size={36} strokeWidth={1.5} />
  </div>
);

export default BlogImagePlaceholder;
