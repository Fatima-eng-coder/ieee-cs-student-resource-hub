import { Fragment } from 'react';

/**
 * Admin-written prose, rendered with its shape intact.
 *
 * What an admin pastes into a description has structure: blank lines between paragraphs, lines
 * beginning "* " meant as bullets, and URLs meant to be clickable. All of it was arriving in a
 * bare <p>, where `white-space: normal` collapses every run of whitespace into a single space —
 * so six bullet points and three paragraphs came out as one wall of text.
 *
 * Deliberately NOT a markdown renderer. This project has no markdown dependency and no
 * sanitiser (checked: no remark, marked, react-markdown or dompurify, transitively either), and
 * `dangerouslySetInnerHTML` appears nowhere in the codebase — introducing the first instance of
 * it to render text typed by whoever holds an admin login would be the first XSS surface here.
 * Everything below is built from React elements, so the text can only ever become text; a
 * <script> in the input renders as the literal characters of a <script>.
 *
 * It handles exactly the three things people actually type, and treats anything else as prose:
 *   - a blank line starts a new paragraph
 *   - a run of lines starting "* ", "- " or "• " becomes a real list
 *   - http(s) URLs become links
 *
 * A single newline inside a paragraph is kept as a line break rather than merged, because
 * somebody who pressed Enter meant it.
 */

/** Only these become links. A bare "javascript:" or "data:" stays inert text. */
const URL_PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

const BULLET = /^\s*[*\-•]\s+/;

/** Splits one line into text and links. Returns React nodes, never HTML. */
function linkify(line: string, keyPrefix: string) {
  // split() with a capturing group keeps the delimiters, so odd indices are the matches.
  return line.split(URL_PATTERN).map((piece, index) => {
    if (index % 2 === 0) return piece;
    return (
      <a
        key={`${keyPrefix}-l${index}`}
        href={piece}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium break-all text-ieee-orange underline underline-offset-2 hover:text-ieee-orange-dark"
      >
        {piece}
      </a>
    );
  });
}

interface Block {
  kind: 'list' | 'para';
  lines: string[];
}

/** Groups the raw text into paragraphs and bullet runs. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];

  // \r\n first, or a Windows-pasted line ends up with a stray \r inside every line.
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;

    let current: Block | null = null;
    for (const line of lines) {
      const kind: Block['kind'] = BULLET.test(line) ? 'list' : 'para';
      const value = kind === 'list' ? line.replace(BULLET, '') : line;

      // A bullet run inside a paragraph block is still a list: people write a sentence, then
      // bullets, without a blank line between them.
      if (!current || current.kind !== kind) {
        current = { kind, lines: [] };
        blocks.push(current);
      }
      current.lines.push(value);
    }
  }

  return blocks;
}

export default function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = toBlocks(text ?? '');
  if (blocks.length === 0) return null;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {blocks.map((block, blockIndex) =>
        block.kind === 'list' ? (
          <ul key={blockIndex} className="ml-1 flex list-none flex-col gap-1.5">
            {block.lines.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-ieee-orange" />
                <span className="min-w-0">{linkify(line, `${blockIndex}-${i}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={blockIndex} className="break-words">
            {block.lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {linkify(line, `${blockIndex}-${i}`)}
              </Fragment>
            ))}
          </p>
        )
      )}
    </div>
  );
}
