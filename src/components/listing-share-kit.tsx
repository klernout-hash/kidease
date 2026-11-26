import { useEffect, useState } from "react";
import { Copy, Download, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText, listingShareUrl } from "@/lib/share";
import {
  shareKitFileName,
  shareKitPosts,
  socialImageLines,
  type ShareKitLocale,
} from "@/lib/share-kit";

const COPY = {
  en: {
    open: "Share kit",
    title: "Share kit",
    lead: "Your link, a QR code for the door or a flyer, a social image and ready-to-post text. Nothing is posted for you.",
    link: "Link",
    qr: "QR code",
    qrDownload: "Download QR (SVG)",
    image: "Social image",
    imageDownload: "Download image (PNG)",
    posts: "Ready-to-post text",
    copy: "Copy",
    copied: "Copied",
    failed: "Could not copy. Select the text and copy it.",
  },
  fr: {
    open: "Trousse de partage",
    title: "Trousse de partage",
    lead: "Votre lien, un code QR pour la porte ou une affiche, une image pour les réseaux sociaux et un texte prêt à publier. Rien n'est publié pour vous.",
    link: "Lien",
    qr: "Code QR",
    qrDownload: "Télécharger le code QR (SVG)",
    image: "Image pour les réseaux sociaux",
    imageDownload: "Télécharger l'image (PNG)",
    posts: "Texte prêt à publier",
    copy: "Copier",
    copied: "Copié",
    failed: "Impossible de copier. Sélectionnez le texte et copiez-le.",
  },
} as const;

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function drawSocialImage(input: {
  name: string;
  city?: string | null;
  url: string;
  locale: ShareKitLocale;
  qrSvg: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff8f1";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#e85d3f";
  ctx.fillRect(0, 0, 1200, 14);
  const lines = socialImageLines(input);
  ctx.fillStyle = "#1f2a44";
  ctx.font = "bold 64px system-ui, sans-serif";
  lines.title.forEach((line, i) => ctx.fillText(line, 72, 150 + i * 78));
  ctx.font = "34px system-ui, sans-serif";
  ctx.fillStyle = "#4a5568";
  ctx.fillText(lines.subtitle, 72, 170 + lines.title.length * 78);
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillStyle = "#e85d3f";
  ctx.fillText("KidEase", 72, 560);
  ctx.font = "26px system-ui, sans-serif";
  ctx.fillStyle = "#4a5568";
  ctx.fillText(lines.footer.slice(0, 48), 72, 596);
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("qr"));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(input.qrSvg)}`;
  await loaded.catch(() => undefined);
  if (img.complete && img.naturalWidth) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(820, 170, 320, 320);
    ctx.drawImage(img, 830, 180, 300, 300);
  }
  return canvas.toDataURL("image/png");
}

export function ListingShareKit({
  slug,
  name,
  city,
  locale,
}: {
  slug: string;
  name: string;
  city?: string | null;
  locale: string;
}) {
  const lang: ShareKitLocale = locale === "fr" ? "fr" : "en";
  const copy = COPY[lang];
  const [open, setOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const [image, setImage] = useState("");
  const url = listingShareUrl(slug);
  const posts = shareKitPosts({ name, city, url, locale: lang });

  useEffect(() => {
    if (!open) return;
    let live = true;
    void import("qrcode")
      .then((mod) =>
        mod.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 280 }),
      )
      .then(async (svg) => {
        if (!live) return;
        setQrSvg(svg);
        const png = await drawSocialImage({ name, city, url, locale: lang, qrSvg: svg });
        if (live && png) setImage(png);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, url, name, city, lang]);

  async function onCopy(text: string) {
    if (await copyText(text)) toast.success(copy.copied);
    else toast.error(copy.failed);
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="mt-3"
        onClick={() => setOpen(true)}
        data-ke="share-kit-open"
      >
        <QrCode className="size-4" />
        {copy.open}
      </Button>
    );
  }

  const qrHref = qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : "";
  return (
    <div
      className="mt-3 space-y-4 rounded-lg bg-surface p-3 ring-1 ring-border"
      data-ke="share-kit"
    >
      <div>
        <h3 className="font-display text-lg">{copy.title}</h3>
        <p className="text-sm text-muted">{copy.lead}</p>
      </div>
      <div>
        <p className="text-sm font-medium">{copy.link}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="break-all text-sm text-primary">{url}</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => void onCopy(url)}>
            <Copy className="size-4" />
            {copy.copy}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="text-sm font-medium">{copy.qr}</p>
          {qrHref ? (
            <img
              src={qrHref}
              alt={`${copy.qr} · ${name}`}
              className="mt-1 size-40 rounded bg-white p-1"
            />
          ) : (
            <div className="mt-1 size-40 animate-pulse rounded bg-bg" />
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={!qrHref}
            onClick={() => download(qrHref, shareKitFileName(slug, "qr"))}
          >
            <Download className="size-4" />
            {copy.qrDownload}
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{copy.image}</p>
          {image ? (
            <img
              src={image}
              alt={`${copy.image} · ${name}`}
              className="mt-1 w-full max-w-md rounded ring-1 ring-border"
            />
          ) : (
            <div className="mt-1 aspect-[1200/630] w-full max-w-md animate-pulse rounded bg-bg" />
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={!image}
            onClick={() => download(image, shareKitFileName(slug, "social"))}
          >
            <Download className="size-4" />
            {copy.imageDownload}
          </Button>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">{copy.posts}</p>
        <ul className="mt-1 space-y-2">
          {posts.map((post) => (
            <li key={post.id} className="rounded bg-bg p-2 ring-1 ring-border">
              <p className="text-xs font-medium text-muted">{post.label}</p>
              <p className="whitespace-pre-line text-sm">{post.text}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-1"
                onClick={() => void onCopy(post.text)}
              >
                <Copy className="size-4" />
                {copy.copy}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
