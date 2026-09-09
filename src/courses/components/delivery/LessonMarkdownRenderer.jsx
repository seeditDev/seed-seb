import React, { useState } from 'react';
import { FaCopy, FaCheck } from 'react-icons/fa';

/**
 * LessonMarkdownRenderer:
 * Renders technical lesson markdown content with high visual polish, supporting:
 * - * item / - item: Bulleted list items (including indentation)
 * - 1. item: Numbered list items
 * - **text**: Bold text
 * - *text*: Italic text
 * - `text`: Inline code
 * - ```lang ... ```: Fenced code block with language badge & copy button
 * - --- / ***: Horizontal divider
 * - # / ## / ###: Section headings
 */
const LessonMarkdownRenderer = ({ content }) => {
  if (!content || typeof content !== 'string') return null;

  // Render inline spans (bold, italic, inline code, links)
  const renderInline = (text) => {
    if (!text) return null;

    const elements = [];
    let remaining = text;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // 1. Inline code: `code`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        elements.push(
          <code key={`code-${keyIdx++}`} className="lesson-inline-code">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.substring(codeMatch[0].length);
        continue;
      }

      // 2. Bold text: **text**
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        elements.push(
          <strong key={`bold-${keyIdx++}`} className="lesson-strong-text">
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.substring(boldMatch[0].length);
        continue;
      }

      // 3. Italic text: *text* (single asterisk, not followed by asterisk)
      const italicMatch = remaining.match(/^\*([^*]+)\*/);
      if (italicMatch) {
        elements.push(
          <em key={`italic-${keyIdx++}`} className="lesson-italic-text">
            {italicMatch[1]}
          </em>
        );
        remaining = remaining.substring(italicMatch[0].length);
        continue;
      }

      // 4. Markdown links: [text](url)
      const linkMatch = remaining.match(/^\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        elements.push(
          <a
            key={`link-${keyIdx++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="lesson-text-link"
          >
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.substring(linkMatch[0].length);
        continue;
      }

      // 5. Plain text segment up to next markdown symbol
      const nextSpecial = remaining.search(/[`*\[\\]/);
      if (nextSpecial === -1) {
        elements.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        // Single backslash at line end
        if (remaining.startsWith('\\')) {
          elements.push(<br key={`br-${keyIdx++}`} />);
          remaining = remaining.substring(1);
        } else {
          elements.push(remaining[0]);
          remaining = remaining.substring(1);
        }
      } else {
        elements.push(remaining.substring(0, nextSpecial));
        remaining = remaining.substring(nextSpecial);
      }
    }

    return elements;
  };

  // Block-level parsing
  // Split content by fenced code blocks (``` ... ```)
  const rawParts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="lesson-markdown-body">
      {rawParts.map((part, partIdx) => {
        if (!part) return null;

        // Fenced code block
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline !== -1 ? inner.slice(0, firstNewline).trim() : '';
          const codeText = firstNewline !== -1 ? inner.slice(firstNewline + 1) : inner;

          return (
            <CodeBlockItem
              key={`code-block-${partIdx}`}
              language={lang || 'code'}
              code={codeText.trim()}
            />
          );
        }

        // Non-code blocks: split by lines and group into headings, lists, hr, and paragraphs
        const lines = part.split(/\r?\n/);
        const renderedBlocks = [];
        let currentListItems = [];
        let listType = null; // 'ul' | 'ol'
        let currentParagraph = [];

        const flushList = () => {
          if (currentListItems.length > 0) {
            const listKey = `list-${partIdx}-${renderedBlocks.length}`;
            if (listType === 'ol') {
              renderedBlocks.push(
                <ol key={listKey} className="lesson-ordered-list">
                  {currentListItems.map((item, idx) => (
                    <li key={idx}>{renderInline(item)}</li>
                  ))}
                </ol>
              );
            } else {
              renderedBlocks.push(
                <ul key={listKey} className="lesson-bullet-list">
                  {currentListItems.map((item, idx) => (
                    <li key={idx} className={item.isNested ? 'nested-item' : ''}>
                      {renderInline(item.text)}
                    </li>
                  ))}
                </ul>
              );
            }
            currentListItems = [];
            listType = null;
          }
        };

        const flushParagraph = () => {
          if (currentParagraph.length > 0) {
            const paraText = currentParagraph.join(' ').trim();
            if (paraText) {
              renderedBlocks.push(
                <p key={`p-${partIdx}-${renderedBlocks.length}`} className="lesson-paragraph">
                  {renderInline(paraText)}
                </p>
              );
            }
            currentParagraph = [];
          }
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          // Empty line: flush active paragraph / list
          if (!trimmed) {
            flushList();
            flushParagraph();
            continue;
          }

          // Horizontal divider: --- or ***
          if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushList();
            flushParagraph();
            renderedBlocks.push(
              <hr key={`hr-${partIdx}-${renderedBlocks.length}`} className="lesson-divider" />
            );
            continue;
          }

          // Headings: #, ##, ###, ####
          const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
          if (headingMatch) {
            flushList();
            flushParagraph();
            const level = headingMatch[1].length;
            const headingText = headingMatch[2];
            const hKey = `h-${partIdx}-${renderedBlocks.length}`;
            if (level === 1) {
              renderedBlocks.push(<h2 key={hKey} className="lesson-h1">{renderInline(headingText)}</h2>);
            } else if (level === 2) {
              renderedBlocks.push(<h3 key={hKey} className="lesson-h2">{renderInline(headingText)}</h3>);
            } else if (level === 3) {
              renderedBlocks.push(<h4 key={hKey} className="lesson-h3">{renderInline(headingText)}</h4>);
            } else {
              renderedBlocks.push(<h5 key={hKey} className="lesson-h4">{renderInline(headingText)}</h5>);
            }
            continue;
          }

          // Bullet list items: * item, - item (check indentation for nested)
          const bulletMatch = line.match(/^(\s*)([*•\-])\s+(.+)$/);
          if (bulletMatch) {
            flushParagraph();
            if (listType !== 'ul') {
              flushList();
              listType = 'ul';
            }
            const indentLevel = bulletMatch[1].length >= 2;
            currentListItems.push({ text: bulletMatch[3], isNested: indentLevel });
            continue;
          }

          // Numbered list items: 1. item
          const numMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
          if (numMatch) {
            flushParagraph();
            if (listType !== 'ol') {
              flushList();
              listType = 'ol';
            }
            currentListItems.push(numMatch[3]);
            continue;
          }

          // Regular paragraph line
          flushList();
          currentParagraph.push(trimmed);
        }

        flushList();
        flushParagraph();

        return (
          <div key={`frag-${partIdx}`} className="lesson-text-fragment">
            {renderedBlocks}
          </div>
        );
      })}
    </div>
  );
};

/**
 * CodeBlockItem:
 * Self-contained fenced code block with syntax container, language pill, and copy button.
 */
const CodeBlockItem = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = (language || 'code').toUpperCase();

  return (
    <div className="lesson-fenced-code-card">
      <div className="fenced-code-header">
        <span className="fenced-lang-tag">{displayLang}</span>
        <button
          className={`fenced-copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? <FaCheck /> : <FaCopy />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre className="fenced-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export default LessonMarkdownRenderer;
