# PDF Header & Footer Replacer

Upload any PDF and every page gets the fixed Winzou Health header and footer applied
automatically — no settings, no cropping, no manual margins.

## How it works

1. The file is validated (extension, MIME type, `%PDF-` magic bytes, 100 MB ceiling).
2. Each page is rasterised at low resolution with pdf.js and reduced to a per-row ink
   profile (`src/lib/pdf/analyze.ts`).
3. The first content block at the top and at the bottom — up to 20% of page height and
   only when a clean vertical gap separates it from the body — is treated as the existing
   header/footer.
4. pdf-lib covers those bands with white and draws the fixed brand images, scaled to page
   width with their aspect ratio preserved, honouring page rotation.
5. The result downloads as `<original>_processed.pdf`.

All processing happens in the browser. No server upload, no storage, no database, no
accounts, no cookies, no tracking. Nothing to delete afterwards because nothing is stored.

## Brand assets

`src/assets/header.jpg.asset.json` and `src/assets/footer.jpg.asset.json` point at the
fixed header and footer images. Replace those pointers to change the branding.

## Local development

```bash
bun install
bun run dev
```

Open http://localhost:8080.

## Build

```bash
bun run build
```

The app is a TanStack Start (React + TypeScript + Vite) project and deploys through the
Lovable publish flow; the PDF engine is entirely client-side, so any static-capable host
works.
