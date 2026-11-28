import { useEffect } from "react";
import { DEFAULT_TITLE } from "@/lib/seo/doctorSeo";

type Meta = { title: string; description: string; canonical: string; image: string };

/** Sets a <meta> tag (created when missing) and returns the function that puts the page back as it was. */
function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !el;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.content;
  el.content = content;
  return () => {
    if (created) el?.remove();
    else if (el) el.content = prev;
  };
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  const prev = link.href;
  link.href = href;
  return () => {
    if (link) link.href = prev || `${window.location.origin}/`;
  };
}

/**
 * Client-side head of a doctor's own page, from the same builder the edge uses (buildPractitionerMeta).
 * `noindex` mirrors the edge rule (unlisted doctor or thin bio) for the rare crawler that runs scripts.
 */
export function usePractitionerHead(meta: Meta | null, noindex: boolean) {
  useEffect(() => {
    if (!meta?.title) return;
    const prevTitle = document.title;
    document.title = meta.title;
    const canonical = meta.canonical || window.location.href;
    const undo: Array<() => void> = [
      setCanonical(canonical),
      setMeta("name", "description", meta.description),
      setMeta("property", "og:title", meta.title),
      setMeta("property", "og:description", meta.description),
      setMeta("property", "og:url", canonical),
      setMeta("property", "og:type", "profile"),
      setMeta("name", "twitter:title", meta.title),
      setMeta("name", "twitter:description", meta.description),
    ];
    if (meta.image) undo.push(setMeta("property", "og:image", meta.image), setMeta("name", "twitter:image", meta.image));
    if (noindex) undo.push(setMeta("name", "robots", "noindex, follow"));
    return () => {
      document.title = prevTitle || DEFAULT_TITLE;
      undo.forEach((fn) => fn());
    };
  }, [meta, noindex]);
}
