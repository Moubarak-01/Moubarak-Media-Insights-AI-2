import React, { useMemo, useRef, useEffect } from 'react';
import { marked, Marked } from 'marked';

// Augment the Window interface to include KaTeX, and highlight.js
declare global {
  interface Window {
    renderMathInElement?: (element: HTMLElement, options?: any) => void;
    katex?: any;
    hljs?: any; // highlight.js object
  }
}

// --- Create a new Marked instance with a custom renderer ---
const renderer = new marked.Renderer();

// Override the 'link' renderer to make links open in a new tab.
renderer.link = (href, title, text) => {
  if (href === null) {
    return text;
  }
  let out = `<a href="${href}"`;
  if (title) {
    out += ` title="${title}"`;
  }
  // Add target and rel attributes for security and new-tab functionality
  out += ' target="_blank" rel="noopener noreferrer">';
  out += text;
  out += '</a>';
  return out;
};


// Override the 'code' renderer to add syntax highlighting and a copy button.
// The signature is `(code, languageString, isEscaped)`.
renderer.code = (code, lang) => {
  const language = (lang || 'plaintext').toLowerCase();
  
  // Guard against null/undefined code, which can happen with empty code blocks.
  const codeString = code || '';

  // Use highlight.js to highlight the code, or just escape it if hljs is not available/fails
  const highlightedCode = window.hljs?.getLanguage(language)
    ? window.hljs.highlight(codeString, { language: language, ignoreIllegals: true }).value
    : codeString.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const uniqueId = `code-${Math.random().toString(36).substring(2, 9)}`;
  
  // Call the global handleCopyCode function defined in index.html
  const copyButton = `<button class="copy-code-btn" onclick="handleCopyCode(this, '${uniqueId}')">Copy Code</button>`;
  const langDisplay = `<div class="code-lang">${language}</div>`;
  const header = `<div class="code-header">${langDisplay}${copyButton}</div>`;
  
  // Wrap in a div, with the header and the <pre><code> block
  return `
    <div class="code-block-wrapper">
      ${header}
      <pre><code id="${uniqueId}" class="hljs language-${language}">${highlightedCode}</code></pre>
    </div>
  `;
};

const customMarked = new Marked({
  breaks: true,
  gfm: true,
  renderer: renderer,
});

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Using useMemo to avoid re-parsing on every render unless the content changes.
  const parsedHtml = useMemo(() => {
    if (!content) return '';
    return customMarked.parse(content) as string;
  }, [content]);

  // Use an effect to apply KaTeX rendering after the component has updated.
  useEffect(() => {
    if (containerRef.current && window.renderMathInElement && window.katex) {
      try {
        window.renderMathInElement(containerRef.current, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
          ],
          throwOnError: false, // Don't crash if there's a minor syntax error
        });
      } catch (error) {
        console.error("KaTeX rendering failed:", error);
      }
    }
  }, [content]); // Rerun this effect whenever the content changes.

  return (
    <div
      ref={containerRef}
      className={`markdown-content ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: parsedHtml }}
    />
  );
};
