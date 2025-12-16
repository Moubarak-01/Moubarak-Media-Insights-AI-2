import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';

// Note: highlight.js CSS is still loaded from your index.html, so colors will work automatically.

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Custom component to render code blocks with a "Copy" button
const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  if (!inline && match) {
    return (
      <div className="code-block-wrapper my-4 rounded-lg overflow-hidden border border-slate-700 bg-[#282c34]">
        <div className="code-header flex justify-between items-center px-3 py-2 bg-slate-800 border-b border-slate-700 text-xs text-slate-400 font-mono uppercase">
          <span className="font-bold">{language}</span>
          <button 
            className="copy-code-btn bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded transition-all active:scale-95"
            onClick={() => {
              navigator.clipboard.writeText(codeString);
            }}
          >
            Copy Code
          </button>
        </div>
        <div className="p-4 overflow-x-auto">
          <code className={className} {...props}>
            {children}
          </code>
        </div>
      </div>
    );
  }

  return (
    <code className={`${className} bg-slate-800 text-slate-200 px-1 py-0.5 rounded text-sm`} {...props}>
      {children}
    </code>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({ content, className }) => {
  return (
    <div className={`markdown-content ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          // Override the code component to support highlighting and copy button
          code: CodeBlock,
          // Custom mapping for bold text to match the "key variables" styling requirement
          strong: ({ node, ...props }) => (
            <strong {...props} className="text-yellow-400 font-bold" />
          ),
          // Override links to open in new tab
          a: ({ node, ...props }) => (
            <a 
              {...props} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-yellow-400 hover:text-yellow-300 underline"
            />
          ),
          // Style tables if needed
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table {...props} className="min-w-full divide-y divide-slate-700 border border-slate-700" />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th {...props} className="px-3 py-2 bg-slate-800 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700" />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="px-3 py-2 whitespace-nowrap text-sm text-slate-300 border-b border-slate-700" />
          ),
          // Ensure paragraphs have proper spacing
          p: ({ node, ...props }) => <p {...props} className="mb-4 last:mb-0 leading-relaxed" />,
          // Headings
          h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-bold text-slate-100 mt-6 mb-4 border-b border-slate-700 pb-2" />,
          h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-bold text-slate-100 mt-5 mb-3 border-b border-slate-700 pb-1" />,
          h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-bold text-slate-200 mt-4 mb-2" />,
          // Lists
          ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-4 space-y-1" />,
          ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-4 space-y-1" />,
          li: ({ node, ...props }) => <li {...props} className="pl-1" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});