/** SSR-safe JSON-LD script. Empty payload renders nothing. */
export function JsonLd({ json }: { json: string | null | undefined }) {
  if (!json) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
