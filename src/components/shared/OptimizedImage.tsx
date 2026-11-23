import { useState, type ImgHTMLAttributes } from "react";
import { optimizedImageUrl } from "@/lib/seo/imageUrl";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width"> & {
  src: string;
  /** Target display width in CSS px x ~2 (high-DPI); also used as the intrinsic width hint. */
  width: number;
  /** Intrinsic height hint (reserves space, avoids layout shift). */
  height?: number;
  alt: string;
};

/**
 * <img> that requests a right-sized rendition of Supabase-hosted photos and quietly
 * falls back to the original file if the resize endpoint ever fails.
 */
const OptimizedImage = ({ src, width, height, alt, ...rest }: Props) => {
  const [failed, setFailed] = useState(false);
  const resolved = failed ? src : optimizedImageUrl(src, width);
  return (
    <img
      {...rest}
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      onError={(event) => {
        if (!failed && resolved !== src) setFailed(true);
        rest.onError?.(event);
      }}
    />
  );
};

export default OptimizedImage;
