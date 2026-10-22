// Tests for Unbound's format layer.
//
// Unbound ships exactly ONE document format: Word (.docx).
//
// These tests target only the documented format-module interface
// (src/main/formats/docx.js + index.js):
//
//   Each format module exports:
//     name: string
//     extensions: string[]              (lowercase, no dot)
//     async serialize(html, ctx): Promise<Buffer|string>
//     async deserialize(data: Buffer): Promise<string>
//
//   index.js exports:
//     formats            // array of all modules
//     byExtension(ext)   // -> module | undefined  (ext lowercase, no dot)
//     saveFilters()      // -> [{name, extensions}]
//     openFilters()      // -> [{name, extensions}]
//
// There is no PDF module: PDF is a paginated format, and Unbound never
// paginates. There is no Markdown/HTML/TXT module either — docx is the only
// format the app reads or writes.

import { describe, it, expect } from 'vitest';

import * as registry from '../src/main/formats/index.js';
import * as docx from '../src/main/formats/docx.js';

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
// Registry: byExtension / saveFilters / openFilters
// --------------------------------------------------------------------------
describe('format registry', () => {
  it('contains exactly one format: Word', () => {
    expect(Array.isArray(registry.formats)).toBe(true);
    expect(registry.formats.length).toBe(1);
    expect(registry.formats.map((m) => m.name)).toEqual(['Word Document']);
  });

  it('byExtension("docx") resolves to the Word Document module', () => {
    const m = registry.byExtension('docx');
    expect(m).toBeDefined();
    expect(m.name).toBe('Word Document');
    expect(m.extensions).toContain('docx');
  });

  it('byExtension tolerates a leading dot and uppercase input', () => {
    expect(registry.byExtension('.docx')?.name).toBe('Word Document');
    expect(registry.byExtension('DOCX')?.name).toBe('Word Document');
  });

  it('byExtension returns undefined for anything that is not docx', () => {
    for (const ext of ['xyz', 'pdf', 'md', 'markdown', 'html', 'htm', 'txt', '']) {
      expect(registry.byExtension(ext)).toBeUndefined();
    }
    expect(registry.byExtension(undefined)).toBeUndefined();
    expect(registry.byExtension(null)).toBeUndefined();
  });

  it('saveFilters() offers docx and nothing else', () => {
    const filters = registry.saveFilters();
    expect(filters).toHaveLength(1);
    expect(filters[0].name).toBe('Word Document');
    expect(filters[0].extensions).toEqual(['docx']);
  });

  it('openFilters() offers docx and nothing else', () => {
    const filters = registry.openFilters();
    expect(filters).toHaveLength(1);
    expect(filters[0].name).toBe('Word Document');
    expect(filters[0].extensions).toEqual(['docx']);
  });

  it('no filter anywhere offers a paginated or plain-text extension', () => {
    const everyExt = [...registry.saveFilters(), ...registry.openFilters()]
      .flatMap((f) => f.extensions);
    for (const ext of ['pdf', 'md', 'html', 'txt']) {
      expect(everyExt).not.toContain(ext);
    }
  });
});
