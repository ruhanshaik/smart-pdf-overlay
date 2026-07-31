/**
 * PDF processing engine.
 *
 * pdf.js rasterises each page for layout analysis; pdf-lib performs the actual
 * edit so that all original content streams (text, vectors, images, tables,
 * signatures) are preserved untouched outside the header/footer bands.
 */

import { PDFDocument, rgb, degrees } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import headerAsset from "@/assets/header.jpg.asset.json";
import footerAsset from "@/assets/footer.jpg.asset.json";
import { bandsFromProfile, inkProfile } from "./analyze";
import type { Progress } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Width of the analysis raster in pixels; small on purpose for speed. */
const RASTER_WIDTH = 240;

export class PdfProcessingError extends Error {
  override name = "PdfProcessingError";
}

interface BrandImages {
  header: Uint8Array;
  footer: Uint8Array;
}

let brandCache: Promise<BrandImages> | null = null;

async function loadBrandImages(): Promise<BrandImages> {
  brandCache ??= (async () => {
    const [header, footer] = await Promise.all([
      fetch(headerAsset.url),
      fetch(footerAsset.url),
    ]);
    if (!header.ok) throw new PdfProcessingError("The header image could not be loaded.");
    if (!footer.ok) throw new PdfProcessingError("The footer image could not be loaded.");
    return {
      header: new Uint8Array(await header.arrayBuffer()),
      footer: new Uint8Array(await footer.arrayBuffer()),
    };
  })();
  return brandCache;
}

async function analyzePages(
  bytes: Uint8Array,
  onProgress: (p: Progress) => void,
): Promise<Array<{ headerBand: number; footerBand: number }>> {
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice()}).promise;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "PasswordException")
      throw new PdfProcessingError(
        "This PDF is password protected. Please remove the password and try again.",
      );
    throw new PdfProcessingError("This PDF appears to be corrupted and could not be read.");
  }

  const bands: Array<{ headerBand: number; footerBand: number }> = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PdfProcessingError("Your browser could not render this PDF for analysis.");

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = RASTER_WIDTH / base.width;
    const viewport = page.getViewport({ scale });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rows = inkProfile(image.data, canvas.width, canvas.height);
    // base.height is the rotated, on-screen page height in points.
    bands.push(bandsFromProfile(rows, canvas.height, base.height));
    page.cleanup();

    onProgress({
      phase: i === 1 ? "analyzing" : "detecting",
      value: 0.1 + 0.5 * (i / doc.numPages),
      page: i,
      pageCount: doc.numPages,
    });
  }

  await doc.cleanup();
  return bands;
}

/**
 * Replaces the detected header and footer of every page with the fixed brand
 * images, preserving all other page content.
 */
export async function processPdf(
  bytes: Uint8Array,
  onProgress: (p: Progress) => void,
): Promise<Uint8Array> {
  onProgress({ phase: "reading", value: 0.05 });

  const [brand, bands] = await Promise.all([
    loadBrandImages(),
    analyzePages(bytes, onProgress),
  ]);

  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes.slice(), { ignoreEncryption: false });
  } catch {
    throw new PdfProcessingError(
      "This PDF could not be opened. It may be encrypted or damaged.",
    );
  }

  const headerImage = await pdf.embedJpg(brand.header);
  const footerImage = await pdf.embedJpg(brand.footer);
  const pages = pdf.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const { width: mediaW, height: mediaH } = page.getSize();
    const swapped = rotation === 90 || rotation === 270;
    // Visible page box as the reader sees it.
    const width = swapped ? mediaH : mediaW;
    const height = swapped ? mediaW : mediaH;

    const band = bands[i] ?? { headerBand: 0, footerBand: 0 };
    const headerH = (headerImage.height / headerImage.width) * width;
    const footerH = (footerImage.height / footerImage.width) * width;

    const coverTop = Math.max(band.headerBand, headerH);
    const coverBottom = Math.max(band.footerBand, footerH);

    // Coordinates below are expressed in the visible (rotated) page space and
    // mapped back onto the media box, so rotated pages stay correct.
    const draw = (
      kind: "rect" | "header" | "footer",
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      let px = x;
      let py = y;
      if (rotation === 90) {
        px = mediaW - (y + h);
        py = x;
      } else if (rotation === 180) {
        px = mediaW - (x + w);
        py = mediaH - (y + h);
      } else if (rotation === 270) {
        px = y;
        py = mediaH - (x + w);
      }
      const size = swapped ? { width: h, height: w } : { width: w, height: h };
      const rotate = degrees(rotation);
      if (kind === "rect") {
        page.drawRectangle({ x: px, y: py, ...size, color: rgb(1, 1, 1) });
      } else {
        // pdf-lib rotates images around their origin, so shift accordingly.
        const anchor =
          rotation === 90
            ? { x: px + size.width, y: py }
            : rotation === 180
              ? { x: px + size.width, y: py + size.height }
              : rotation === 270
                ? { x: px, y: py + size.height }
                : { x: px, y: py };
        page.drawImage(kind === "header" ? headerImage : footerImage, {
          ...anchor,
          width: w,
          height: h,
          rotate,
        });
      }
    };

    if (coverTop > 0) draw("rect", 0, height - coverTop, width, coverTop);
    if (coverBottom > 0) draw("rect", 0, 0, width, coverBottom);
    draw("header", 0, height - headerH, width, headerH);
    draw("footer", 0, 0, width, footerH);

    onProgress({
      phase: "replacing",
      value: 0.6 + 0.3 * ((i + 1) / pages.length),
      page: i + 1,
      pageCount: pages.length,
    });
  }

  onProgress({ phase: "generating", value: 0.95 });
  const out = await pdf.save({ useObjectStreams: true });
  onProgress({ phase: "done", value: 1 });
  return out;
}
