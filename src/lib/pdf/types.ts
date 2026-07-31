/** Shared, browser-safe types for the PDF engine. */

export type Phase =
  | "reading"
  | "analyzing"
  | "detecting"
  | "replacing"
  | "generating"
  | "done";

export interface Progress {
  phase: Phase;
  /** Completion ratio between 0 and 1. */
  value: number;
  page?: number;
  pageCount?: number;
}
