// Tests for Unbound's format layer.
//
// Unbound WRITES exactly one format: Word (.docx). It READS three: .docx,
// Markdown (.md/.markdown) and plain text (.txt).
//
// The asymmetry is the whole design, so most of these tests are about it:
// .md and .txt have no page model (safe to read) and no way to hold formatting
// (unsafe to write back), so an opened .md/.txt saves as .docx and the source
// file is never touched.
//
// Documented module interface (src/main/formats/*.js):
//   name: string
//   extensions: string[]              (lowercase, no dot)
//   async deserialize(data): Promise<string>
//   async serialize(html)?            (only on writable formats)
//   readOnly?: true                   (on formats with no serialize)
//
// index.js exports: formats, writable, defaultExtension, byExtension,
// isWritable, saveFilters, openFilters.
//
// There is no PDF module and never will be: PDF is a paginated format, and
// Unbound never paginates.

import { describe, it, expect } from 'vitest';

import * as registry from '../src/main/formats/index.js';
import * as docx from '../src/main/formats/docx.js';
import * as markdown from '../src/main/formats/markdown.js';
import * as text from '../src/main/formats/text.js';

// --------------------------------------------------------------------------
// Word: round-trip preserves structural formatting
// --------------------------------------------------------------------------
describe('docx format', () => {
  const sourceHtml =
    '<h1>Title</h1>' +
    '<p>Some <strong>bold</strong> and <em>italic</em> text.</p>' +
    '<ul><li>one</li><li>two</li></ul>';

  it('round-trips headings, emphasis and lists', async () => {
    const buf = await docx.serialize(sourceHtml);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);

    // A .docx is a zip container — check the magic bytes.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');

    const html = await docx.deserialize(buf);
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/i);
    expect(html).toMatch(/<strong>bold<\/strong>/i);
    expect(html).toMatch(/<em>italic<\/em>/i);
    expect(html).toMatch(/<li[^>]*>one<\/li>/i);
  });

  it('exposes the documented module interface', () => {
    expect(docx.name).toBe('Word Document');
    expect(docx.extensions).toEqual(['docx']);
    expect(typeof docx.serialize).toBe('function');
    expect(typeof docx.deserialize).toBe('function');
  });

  it('serializes an empty document without throwing', async () => {
    const buf = await docx.serialize('');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------------------
// Markdown: reads to HTML, never writes
// --------------------------------------------------------------------------
describe('markdown format', () => {
  it('converts headings, emphasis and lists', async () => {
    const html = await markdown.deserialize(
      Buffer.from('# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n')
    );
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/i);
    expect(html).toMatch(/<strong>bold<\/strong>/i);
    expect(html).toMatch(/<em>italic<\/em>/i);
    expect(html).toMatch(/<li[^>]*>one<\/li>/i);
  });

  it('renders GFM tables as real tables, not a paragraph of pipes', async () => {
    const html = await markdown.deserialize(
      Buffer.from('| a | b |\n| - | - |\n| 1 | 2 |\n')
    );
    expect(html).toMatch(/<table/i);
    expect(html).toMatch(/<td[^>]*>1<\/td>/i);
  });

  it('strips a UTF-8 BOM instead of rendering it', async () => {
    const html = await markdown.deserialize(Buffer.from('\uFEFF# Title\n'));
    expect(html).not.toContain('\uFEFF');
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/i);
  });

  it('has no serialize — Markdown cannot hold what the editor adds', () => {
    expect(markdown.readOnly).toBe(true);
    expect(markdown.serialize).toBeUndefined();
  });

  it('handles .markdown as well as .md', () => {
    expect(markdown.extensions).toEqual(['md', 'markdown']);
  });
});

// --------------------------------------------------------------------------
// Plain text: reads to paragraphs, never writes
// --------------------------------------------------------------------------
describe('text format', () => {
  it('turns a blank line into a paragraph break', async () => {
    const html = await text.deserialize(Buffer.from('first para\n\nsecond para\n'));
    expect(html).toBe('<p>first para</p>\n<p>second para</p>');
  });

  it('keeps single newlines as <br>, not as paragraph breaks', async () => {
    const html = await text.deserialize(Buffer.from('line one\nline two\n'));
    expect(html).toBe('<p>line one<br>line two</p>');
  });

  it('handles CRLF (Windows) and lone CR (classic Mac)', async () => {
    expect(await text.deserialize(Buffer.from('a\r\n\r\nb'))).toBe('<p>a</p>\n<p>b</p>');
    expect(await text.deserialize(Buffer.from('a\r\rb'))).toBe('<p>a</p>\n<p>b</p>');
  });

  it('escapes angle brackets instead of letting them become markup', async () => {
    const html = await text.deserialize(Buffer.from('if (a < b && c > d) { }'));
    expect(html).not.toMatch(/<b/);
    expect(html).toContain('&lt;');
    expect(html).toContain('&amp;');
  });

  it('preserves leading indentation', async () => {
    const html = await text.deserialize(Buffer.from('    indented code\n'));
    expect(html).toContain('<p>    indented code</p>');
  });

  it('returns an empty paragraph for an empty or whitespace-only file', async () => {
    expect(await text.deserialize(Buffer.from(''))).toBe('<p></p>');
    expect(await text.deserialize(Buffer.from('   \n\n  '))).toBe('<p></p>');
  });

  it('has no serialize — plain text cannot hold formatting', () => {
    expect(text.readOnly).toBe(true);
    expect(text.serialize).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// Registry: one writable format, three readable ones
// --------------------------------------------------------------------------
describe('format registry', () => {
  it('reads exactly docx, markdown and text', () => {
    expect(registry.formats.map((m) => m.name)).toEqual([
      'Word Document',
      'Markdown',
      'Text File'
    ]);
  });

  it('writes only Word', () => {
    expect(registry.writable).toHaveLength(1);
    expect(registry.writable[0].name).toBe('Word Document');
    expect(registry.defaultExtension).toBe('docx');
  });

  it('byExtension resolves every readable format, case and dot insensitive', () => {
    expect(registry.byExtension('docx')?.name).toBe('Word Document');
    expect(registry.byExtension('.DOCX')?.name).toBe('Word Document');
    expect(registry.byExtension('md')?.name).toBe('Markdown');
    expect(registry.byExtension('.Markdown')?.name).toBe('Markdown');
    expect(registry.byExtension('txt')?.name).toBe('Text File');
    expect(registry.byExtension('TXT')?.name).toBe('Text File');
  });

  it('byExtension rejects PDF, HTML and nonsense', () => {
    for (const ext of ['pdf', 'html', 'htm', 'rtf', 'odt', 'xyz', '']) {
      expect(registry.byExtension(ext)).toBeUndefined();
    }
    expect(registry.byExtension(undefined)).toBeUndefined();
    expect(registry.byExtension(null)).toBeUndefined();
  });

  it('isWritable is true only for Word', () => {
    expect(registry.isWritable(registry.byExtension('docx'))).toBe(true);
    expect(registry.isWritable(registry.byExtension('md'))).toBe(false);
    expect(registry.isWritable(registry.byExtension('txt'))).toBe(false);
    expect(registry.isWritable(undefined)).toBe(false);
  });

  it('saveFilters() offers docx and nothing else', () => {
    const filters = registry.saveFilters();
    expect(filters).toHaveLength(1);
    expect(filters[0].extensions).toEqual(['docx']);
  });

  it('openFilters() offers docx, markdown, text and a combined entry', () => {
    const filters = registry.openFilters();
    const names = filters.map((f) => f.name);
    expect(names).toContain('Word Document');
    expect(names).toContain('Markdown');
    expect(names).toContain('Text File');
    const all = filters[filters.length - 1];
    expect(all.extensions).toEqual(['docx', 'md', 'markdown', 'txt']);
  });

  it('no filter anywhere offers a paginated extension', () => {
    const everyExt = [...registry.saveFilters(), ...registry.openFilters()].flatMap(
      (f) => f.extensions
    );
    expect(everyExt).not.toContain('pdf');
  });

  it('no save filter offers a format that cannot hold formatting', () => {
    const saveExts = registry.saveFilters().flatMap((f) => f.extensions);
    expect(saveExts).not.toContain('md');
    expect(saveExts).not.toContain('markdown');
    expect(saveExts).not.toContain('txt');
  });
});
