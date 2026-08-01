import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { Progress } from "@/lib/pdf/types";
import { PdfValidationError, sanitizeFilename, validatePdf } from "@/lib/pdf/validate";
import headerUrl from "@/assets/header.jpg";
import footerUrl from "@/assets/footer.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Winzou-Health" },
      {
        name: "description",
        content:
          "Upload any PDF and automatically replace its header and footer with the official Winzou Health branding. Runs entirely in your browser.",
      },
      { property: "og:title", content: "Winzou-Health" },
      {
        property: "og:description",
        content:
          "Upload any PDF and automatically replace its header and footer with the official Winzou Health branding. Runs entirely in your browser.",
      },
    ],
  }),
  component: Index,
});

const PHASE_LABEL: Record<Progress["phase"], string> = {
  reading: "Reading PDF…",
  analyzing: "Analyzing pages…",
  detecting: "Detecting header & footer…",
  replacing: "Replacing header & footer…",
  generating: "Generating PDF…",
  done: "Completed.",
};

type State =
  | { status: "idle" }
  | { status: "working"; progress: Progress; name: string }
  | { status: "done"; url: string; filename: string; name: string; pages: number }
  | { status: "error"; message: string };

function Index() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  const run = useCallback(async (file: File) => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setState({ status: "working", progress: { phase: "reading", value: 0.02 }, name: file.name });
    try {
      const bytes = await validatePdf(file);
      const { processPdf } = await import("@/lib/pdf/process");
      let pages = 0;
      const out = await processPdf(bytes, (progress) => {
        pages = progress.pageCount ?? pages;
        setState({ status: "working", progress, name: file.name });
      });
      const blob = new Blob([out.slice().buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setState({
        status: "done",
        url,
        filename: `${sanitizeFilename(file.name)}_processed.pdf`,
        name: file.name,
        pages,
      });
    } catch (error) {
      const message =
        error instanceof PdfValidationError || (error as Error)?.name === "PdfProcessingError"
          ? (error as Error).message
          : "Something went wrong while processing this PDF. Please try again.";
      setState({ status: "error", message });
    }
  }, []);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void run(file);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-10 sm:px-8 sm:py-16">
      <header className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Winzou Health · Document Branding
        </span>
        <h1 className="mt-5 text-3xl leading-tight font-bold text-balance sm:text-5xl">
          Replace any PDF&apos;s <span className="text-brand-gradient">header &amp; footer</span>{" "}
          automatically
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
          Upload a PDF. Each page is analyzed, the existing header and footer areas are detected and
          covered, and the official branding is applied. Everything runs in your browser — no file
          ever leaves your device.
        </p>
      </header>

      <section className="surface-card mt-10 rounded-3xl p-5 sm:p-8" aria-live="polite">
        {state.status === "idle" || state.status === "error" ? (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onFiles(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors sm:py-14 ${
                dragging ? "border-primary bg-accent" : "border-border bg-secondary/60"
              }`}
            >
              <p className="text-base font-semibold">Drop your PDF here</p>
              <p className="mt-1 text-sm text-muted-foreground">or choose a file · up to 100 MB</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-6 w-full max-w-xs rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-[var(--shadow-lift)] transition-transform active:scale-[0.98] hover:bg-primary/90"
              >
                Select PDF
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {state.status === "error" ? (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              >
                {state.message}
              </p>
            ) : null}
          </>
        ) : null}

        {state.status === "working" ? (
          <div className="py-6">
            <p className="truncate text-sm text-muted-foreground">{state.name}</p>
            <p className="mt-2 text-lg font-semibold">{PHASE_LABEL[state.progress.phase]}</p>
            {state.progress.pageCount ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Page {state.progress.page} of {state.progress.pageCount}
              </p>
            ) : null}
            <div
              className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-valuenow={Math.round(state.progress.value * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[image:var(--gradient-brand)] transition-[width] duration-200"
                style={{ width: `${Math.max(4, state.progress.value * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {state.status === "done" ? (
          <div className="py-4 text-center">
            <p className="text-lg font-semibold">Your PDF is ready</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.pages} page{state.pages === 1 ? "" : "s"} rebranded · {state.name}
            </p>
            <a
              href={state.url}
              download={state.filename}
              className="mt-6 inline-flex w-full max-w-xs items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-[var(--shadow-lift)] transition-transform active:scale-[0.98] hover:bg-primary/90"
            >
              Download PDF
            </a>
            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="mt-3 block w-full text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Process another PDF
            </button>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Branding applied to every page
        </h2>
        <div className="surface-card mt-4 space-y-4 rounded-2xl p-4">
          <figure>
            <figcaption className="mb-2 text-xs font-medium text-muted-foreground">Header</figcaption>
            <img
              src={headerUrl}
              alt="Winzou Health header with logo and contact details"
              className="w-full rounded-lg border border-border bg-card"
              loading="lazy"
            />
          </figure>
          <figure>
            <figcaption className="mb-2 text-xs font-medium text-muted-foreground">Footer</figcaption>
            <img
              src={footerUrl}
              alt="Winzou Health footer with clinic address"
              className="w-full rounded-lg border border-border bg-card"
              loading="lazy"
            />
          </figure>
        </div>
      </section>

      <footer className="mt-10 text-center text-xs text-muted-foreground">
        Processed locally in your browser · no uploads, no storage, no tracking.
      </footer>
    </main>
  );
} 
