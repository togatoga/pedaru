"use client";

// Custom components for ReactMarkdown to render ***text*** with yellow highlight
export const markdownComponents = {
  // ***text*** renders as <strong><em>text</em></strong>
  // We style strong > em with yellow highlight
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <mark className="bg-yellow-500/30 text-yellow-200 font-bold px-0.5 rounded not-italic">
      {children}
    </mark>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
};
