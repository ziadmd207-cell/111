import React from "react";
import ReactMarkdown from "react-markdown";

export default function ReadingView({ content }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="font-heading font-bold text-xl mt-4 mb-2 text-zeus-brightgold">{children}</h1>,
          h2: ({ children }) => <h2 className="font-heading font-bold text-lg mt-3 mb-2 text-zeus-brightgold">{children}</h2>,
          h3: ({ children }) => <h3 className="font-heading font-semibold text-base mt-2 mb-1 text-zeus-brightgold">{children}</h3>,
          p: ({ children }) => <p className="text-foreground/85 leading-relaxed mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 text-foreground/85 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 text-foreground/85 mb-2">{children}</ol>,
          code: ({ className, children }) => {
            const isBlock = className?.startsWith("language-");
            return isBlock
              ? <pre className="p-3 rounded-xl bg-secondary/30 border border-border/40 overflow-x-auto my-2"><code className="text-xs font-mono text-foreground/90">{children}</code></pre>
              : <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-zeus-brightgold text-xs font-mono">{children}</code>;
          },
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="border-s-4 border-zeus-gold/40 ps-3 text-muted-foreground italic my-2">{children}</blockquote>
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}