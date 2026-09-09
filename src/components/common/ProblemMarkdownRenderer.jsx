import React, { useState, useEffect } from 'react';
import { FaImage, FaExternalLinkAlt, FaTimes, FaCopy, FaCheck } from 'react-icons/fa';
import '../../styles/ProblemMarkdownRenderer.css';

/**
 * ProblemImage:
 * Renders problem illustrations, geometry figures, graphs, and diagrams with
 * lazy loading, hover styling, click-to-enlarge lightbox modal, and error fallback.
 */
export const ProblemImage = ({ src, alt }) => {
  const [hasError, setHasError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsZoomed(false);
    };
    if (isZoomed) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  if (!src) return null;

  if (hasError) {
    return (
      <div className="pmr-image-fallback">
        <FaImage style={{ fontSize: '16px', color: '#94a3b8' }} />
        <span>Illustration: {alt || 'Problem Figure'}</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="pmr-fallback-link">
          Open Image <FaExternalLinkAlt style={{ fontSize: '10px' }} />
        </a>
      </div>
    );
  }

  return (
    <>
      <figure className="pmr-image-wrapper">
        <img
          src={src}
          alt={alt || 'Problem Diagram'}
          className="pmr-image"
          loading="lazy"
          onClick={() => setIsZoomed(true)}
          onError={() => setHasError(true)}
          title="Click to zoom illustration"
        />
        {alt && alt.trim() && (
          <figcaption className="pmr-image-caption">{alt.trim()}</figcaption>
        )}
      </figure>

      {isZoomed && (
        <div className="pmr-lightbox-overlay" onClick={() => setIsZoomed(false)}>
          <div className="pmr-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt={alt || 'Zoomed illustration'} className="pmr-lightbox-img" />
            <button
              className="pmr-lightbox-close-btn"
              onClick={() => setIsZoomed(false)}
              title="Close (Esc)"
            >
              <FaTimes />
            </button>
            {alt && alt.trim() && (
              <div className="pmr-image-caption" style={{ color: '#e2e8f0', marginTop: '10px' }}>
                {alt}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

/**
 * ProblemCodeBlock:
 * Renders a syntax-styled code block with language indicator and copy button.
 */
const ProblemCodeBlock = ({ lang = '', code = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const cleanLang = lang.trim() || 'code';

  return (
    <div className="pmr-code-block-wrapper">
      <div className="pmr-code-block-header">
        <span className="pmr-lang-pill">{cleanLang}</span>
        <button className="pmr-code-copy-btn" onClick={handleCopy} title="Copy code">
          {copied ? <><FaCheck style={{ color: '#10b981' }} /> Copied</> : <><FaCopy /> Copy</>}
        </button>
      </div>
      <pre className="pmr-code-block">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
};

/**
 * renderInlineTokens:
 * Parses inline formatting within a text snippet:
 * - Markdown image: ![alt](url) -> ProblemImage
 * - Markdown link: [alt](url) -> ProblemImage per instruction ("if any link is there it will image. display the image")
 * - Raw URL: http(s)://... -> ProblemImage
 * - Inline code: `text`
 * - Bold: **text**
 * - Italic: *text* or _text_
 * - Math: $text$
 */
export const renderInlineTokens = (text, parentKeyPrefix = 'tok') => {
  if (typeof text !== 'string' || !text) return text;

  const tokens = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // 1. Markdown image: ![alt](url)
    const imgMatch = remaining.match(/^!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/);
    if (imgMatch) {
      tokens.push(
        <ProblemImage
          key={`${parentKeyPrefix}-img-${keyIdx++}`}
          src={imgMatch[2]}
          alt={imgMatch[1]}
        />
      );
      remaining = remaining.substring(imgMatch[0].length);
      continue;
    }

    // 2. Markdown link: [alt](url) -> display as image per user instruction
    const linkMatch = remaining.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+)\)/);
    if (linkMatch) {
      tokens.push(
        <ProblemImage
          key={`${parentKeyPrefix}-linkimg-${keyIdx++}`}
          src={linkMatch[2]}
          alt={linkMatch[1]}
        />
      );
      remaining = remaining.substring(linkMatch[0].length);
      continue;
    }

    // 3. Raw standalone URL: https://...
    const rawUrlMatch = remaining.match(/^(https?:\/\/[^\s<>()"]+)/);
    if (rawUrlMatch) {
      tokens.push(
        <ProblemImage
          key={`${parentKeyPrefix}-rawurl-${keyIdx++}`}
          src={rawUrlMatch[1]}
          alt="Illustration"
        />
      );
      remaining = remaining.substring(rawUrlMatch[0].length);
      continue;
    }

    // 4. Inline code: `code`
    const codeMatch = remaining.match(/^`([^`\n]+)`/);
    if (codeMatch) {
      tokens.push(
        <code key={`${parentKeyPrefix}-code-${keyIdx++}`} className="pmr-inline-code">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.substring(codeMatch[0].length);
      continue;
    }

    // 5. Bold: **text**
    const boldMatch = remaining.match(/^\*\*([^*\n]+)\*\*/);
    if (boldMatch) {
      tokens.push(
        <strong key={`${parentKeyPrefix}-bold-${keyIdx++}`} className="pmr-bold">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.substring(boldMatch[0].length);
      continue;
    }

    // 6. Italic: *text* (ensure it's not a bullet point or leading asterisk)
    const italicMatch = remaining.match(/^\*([^*\s\n][^*\n]*?)\*/);
    if (italicMatch) {
      tokens.push(
        <em key={`${parentKeyPrefix}-ital-${keyIdx++}`} className="pmr-italic">
          {italicMatch[1]}
        </em>
      );
      remaining = remaining.substring(italicMatch[0].length);
      continue;
    }

    // 7. Math notation: $formula$
    const mathMatch = remaining.match(/^\$([^$\n]+)\$/);
    if (mathMatch) {
      tokens.push(
        <span key={`${parentKeyPrefix}-math-${keyIdx++}`} className="pmr-math">
          {mathMatch[1]}
        </span>
      );
      remaining = remaining.substring(mathMatch[0].length);
      continue;
    }

    // 8. Plain text segment up to the next markdown trigger character (!, [, `, *, $, h for http)
    const nextTrigger = remaining.search(/[!\[`*$]|https?:\/\//);
    if (nextTrigger === -1) {
      tokens.push(remaining);
      break;
    } else if (nextTrigger === 0) {
      tokens.push(remaining[0]);
      remaining = remaining.substring(1);
    } else {
      tokens.push(remaining.substring(0, nextTrigger));
      remaining = remaining.substring(nextTrigger);
    }
  }

  return tokens;
};

/**
 * ProblemMarkdownRenderer:
 * Comprehensive renderer for problem descriptions, input/output formats, constraints, and editorials.
 * Handles:
 * - * item / - item (Bullet points)
 * - 1. item (Numbered lists)
 * - **text** (Bold text)
 * - *text* (Italic text)
 * - `text` (Inline code)
 * - ```c ... ``` (Code blocks)
 * - --- (Horizontal dividers)
 * - Any link/URL displayed as image
 */
const ProblemMarkdownRenderer = ({ content, className = '' }) => {
  if (!content) return null;

  // If content is an array (e.g. constraints: ["1 <= N <= 10^5", "..."]), format as list
  if (Array.isArray(content)) {
    return (
      <ul className={`pmr-list ${className}`}>
        {content.map((item, idx) => (
          <li key={`arr-item-${idx}`} className="pmr-bullet-item">
            {renderInlineTokens(String(item), `arr-${idx}`)}
          </li>
        ))}
      </ul>
    );
  }

  const rawText = String(content).replace(/\r\n/g, '\n');

  // 1. Split text into code blocks and normal markdown segments
  const segments = rawText.split(/(```[\s\S]*?```)/g);

  return (
    <div className={`pmr-container ${className}`}>
      {segments.map((segment, segIdx) => {
        if (!segment) return null;

        // Check if this segment is a code block: ```lang\ncode\n```
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          let lang = '';
          let codeText = inner;
          if (firstNewline !== -1) {
            lang = inner.slice(0, firstNewline).trim();
            codeText = inner.slice(firstNewline + 1);
          }

          // Check if markdown image tags were accidentally placed inside code blocks
          if (/!\[.*?\]\(https?:\/\/.*?\)|\[.*?\]\(https?:\/\/.*?\)/.test(codeText)) {
            const subParts = codeText.split(/(!\[.*?\]\(https?:\/\/.*?\)|\(?https?:\/\/[^\s)]+\)?)/g);
            return (
              <div key={`cb-wrap-${segIdx}`}>
                {subParts.map((sub, sIdx) => {
                  const imgMatch = sub.match(/!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/) || sub.match(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/);
                  if (imgMatch) {
                    return <ProblemImage key={`cb-img-${sIdx}`} src={imgMatch[2]} alt={imgMatch[1]} />;
                  }
                  if (!sub.trim()) return null;
                  return <ProblemCodeBlock key={`cb-code-${sIdx}`} lang={lang} code={sub} />;
                })}
              </div>
            );
          }

          return <ProblemCodeBlock key={`code-block-${segIdx}`} lang={lang} code={codeText} />;
        }

        // 2. Parse lines for dividers, bullet points (* item, - item), numbered items (1. item), and paragraphs
        const lines = segment.split('\n');
        const elements = [];
        let currentBulletItems = [];
        let currentNumItems = [];
        let currentParagraphLines = [];

        const flushBullets = (keyBase) => {
          if (currentBulletItems.length > 0) {
            elements.push(
              <ul key={`${keyBase}-ul`} className="pmr-list">
                {currentBulletItems.map((item, bIdx) => (
                  <li key={`${keyBase}-b-${bIdx}`} className="pmr-bullet-item">
                    {renderInlineTokens(item, `${keyBase}-b-${bIdx}`)}
                  </li>
                ))}
              </ul>
            );
            currentBulletItems = [];
          }
        };

        const flushNumbered = (keyBase) => {
          if (currentNumItems.length > 0) {
            elements.push(
              <ol key={`${keyBase}-ol`} className="pmr-num-list">
                {currentNumItems.map((item, nIdx) => (
                  <li key={`${keyBase}-n-${nIdx}`} className="pmr-num-item">
                    {renderInlineTokens(item, `${keyBase}-n-${nIdx}`)}
                  </li>
                ))}
              </ol>
            );
            currentNumItems = [];
          }
        };

        const flushParagraph = (keyBase) => {
          if (currentParagraphLines.length > 0) {
            const paraText = currentParagraphLines.join('\n').trim();
            if (paraText) {
              // Check if the entire paragraph is a standalone image/link
              const standaloneImg = paraText.match(/^!\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/) ||
                                    paraText.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/) ||
                                    paraText.match(/^(https?:\/\/[^\s]+)$/);
              if (standaloneImg) {
                elements.push(
                  <ProblemImage
                    key={`${keyBase}-solo-img`}
                    src={standaloneImg[2] || standaloneImg[1]}
                    alt={standaloneImg[1] || 'Illustration'}
                  />
                );
              } else {
                elements.push(
                  <p key={`${keyBase}-p`} className="pmr-paragraph">
                    {renderInlineTokens(paraText, `${keyBase}-p`)}
                  </p>
                );
              }
            }
            currentParagraphLines = [];
          }
        };

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();
          const lineKey = `seg-${segIdx}-l-${lineIdx}`;

          // Horizontal divider: --- or *** or ___
          if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushBullets(lineKey);
            flushNumbered(lineKey);
            flushParagraph(lineKey);
            elements.push(<hr key={lineKey} className="pmr-divider" />);
            return;
          }

          // Bullet item: starts with `* ` or `- ` (with optional indentation)
          const bulletMatch = line.match(/^\s*[*\-]\s+(.*)$/);
          if (bulletMatch) {
            flushNumbered(lineKey);
            flushParagraph(lineKey);
            currentBulletItems.push(bulletMatch[1]);
            return;
          }

          // Numbered item: starts with `1. `, `2. `, etc.
          const numMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
          if (numMatch) {
            flushBullets(lineKey);
            flushParagraph(lineKey);
            currentNumItems.push(numMatch[2]);
            return;
          }

          // Blank line -> Paragraph separator
          if (!trimmed) {
            flushBullets(lineKey);
            flushNumbered(lineKey);
            flushParagraph(lineKey);
            return;
          }

          // Otherwise, it's regular text line
          flushBullets(lineKey);
          flushNumbered(lineKey);
          currentParagraphLines.push(line);
        });

        // Flush remaining at the end of the segment
        flushBullets(`seg-${segIdx}-end`);
        flushNumbered(`seg-${segIdx}-end`);
        flushParagraph(`seg-${segIdx}-end`);

        return <React.Fragment key={`seg-frag-${segIdx}`}>{elements}</React.Fragment>;
      })}
    </div>
  );
};

export default ProblemMarkdownRenderer;
