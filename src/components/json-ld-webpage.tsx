import { SITE_URL } from "@/lib/seo";

type Props = {
  name: string;
  description: string;
  path: string;
};

/**
 * Renders WebPage schema for the current page. Use once per page for richer snippets and LLM context.
 */
export function JsonLdWebPage({ name, description, path }: Props) {
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url,
    inLanguage: "de",
    isPartOf: { "@id": `${SITE_URL}/#website` },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
