import type { ReactNode } from "react";

import { LEGAL } from "@/lib/legal";

/**
 * The frame for the Privacy Policy and the Terms: a plain title band, the date the
 * page took effect, a short summary, then numbered sections at a readable measure.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="band pb-10 sm:pb-12">
        <div className="page-container pt-8 sm:pt-16">
          <h1 className="title-display text-large-title">{title}</h1>
          <p className="mt-2 text-footnote text-muted-foreground">Effective {LEGAL.effective}</p>
        </div>
      </div>
      <div className="page-container pt-8 pb-16 sm:pt-12">
        <div className="max-w-[34rem]">
          <div className="surface-card p-6 text-body">{summary}</div>
          <article className="legal mt-10">{children}</article>
        </div>
      </div>
    </div>
  );
}

/** A numbered section: its title and its paragraphs or lists. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="title-display text-title-2">{title}</h2>
      <div className="mt-4 space-y-4 text-body text-foreground/90">{children}</div>
    </section>
  );
}

/** The contact address as a mail link. */
export function ContactEmail() {
  return (
    <a
      href={`mailto:${LEGAL.contactEmail}`}
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {LEGAL.contactEmail}
    </a>
  );
}
