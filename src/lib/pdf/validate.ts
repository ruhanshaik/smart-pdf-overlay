/**
 * Validation for uploaded files: extension, MIME type and magic bytes.
 * Everything runs locally in the browser; nothing is uploaded anywhere.
 */

/** Hard upload ceiling to protect browser memory (100 MB). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export class PdfValidationError extends Error {}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "document.pdf";
  const cleaned = base
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "document";
}

export async function validatePdf(file: File): Promise<Uint8Array> {
  if (file.size === 0) throw new PdfValidationError("That file is empty. Please choose a valid PDF.");
  if (file.size > MAX_FILE_BYTES)
    throw new PdfValidationError("That file is larger than 100 MB. Please upload a smaller PDF.");
  if (!/\.pdf$/i.test(file.name))
    throw new PdfValidationError("Only PDF files are supported. Please choose a .pdf file.");
  if (file.type && file.type !== "application/pdf")
    throw new PdfValidationError("This file isn't a PDF. Please choose a valid PDF file.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if (magic !== "%PDF-")
    throw new PdfValidationError("This file isn't a real PDF. Please upload a valid PDF document.");

  return bytes;
}
