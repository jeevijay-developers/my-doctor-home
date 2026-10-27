import { useEffect } from "react";

interface HeadOptions {
  title: string;
  description: string;
  canonical: string;
  robots: string;
}

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.content;
  el.content = content;
  return () => {
    el!.content = prev;
  };
}

/** Sets title/description/canonical/robots/OG for a client-rendered page and restores them on unmount. */
export function useDocumentHead({ title, description, canonical, robots }: HeadOptions) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    const prevHref = link.href;
    link.href = canonical;

    const restores = [
      setMeta('meta[name="description"]', "name", "description", description),
      setMeta('meta[name="robots"]', "name", "robots", robots),
      setMeta('meta[property="og:title"]', "property", "og:title", title),
      setMeta('meta[property="og:description"]', "property", "og:description", description),
      setMeta('meta[property="og:url"]', "property", "og:url", canonical),
      setMeta('meta[name="twitter:title"]', "name", "twitter:title", title),
      setMeta('meta[name="twitter:description"]', "name", "twitter:description", description),
    ];

    return () => {
      document.title = prevTitle;
      if (link) link.href = prevHref;
      restores.forEach((r) => r());
    };
  }, [title, description, canonical, robots]);
}
