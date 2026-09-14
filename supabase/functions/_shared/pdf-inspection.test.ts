import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFString } from 'pdf-lib';
import { deflate } from 'pako';
import { inspectStaticResumePdf } from './pdf-inspection.ts';
import { validResumePdfBytes } from './pdf-test-fixtures.ts';
import { MIN_RESUME_BYTES, validateResumePdf } from './resume-validation.ts';

async function document(configure?: (doc: PDFDocument) => void, useObjectStreams = true) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawText('Synthetic resume: education, experience and skills.');
  // Valid unreferenced stream padding keeps generated fixtures above 10 KB.
  doc.context.register(doc.context.stream(' '.repeat(MIN_RESUME_BYTES)));
  configure?.(doc);
  return doc.save({ useObjectStreams });
}

describe('bounded static resume PDF inspection', () => {
  it('accepts a real classic xref document through the complete file validator', async () => {
    expect(await validateResumePdf(new File([validResumePdfBytes()], 'resume.pdf', { type: 'application/pdf' }))).toBe(true);
  });

  it.each([true, false])('accepts a generated resume with compressed object streams = %s', async (compressed) => {
    expect(await inspectStaticResumePdf(await document(undefined, compressed))).toBe(true);
  });

  it.each(['https://example.com/portfolio', 'mailto:student@osu.edu'])('allows a passive link to %s', async (uri) => {
    const bytes = await document((doc) => {
      const annotation = doc.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 50, 50],
        A: { S: 'URI', URI: PDFString.of(uri) },
      });
      doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annotation)]));
    });
    expect(await inspectStaticResumePdf(bytes)).toBe(true);
  });

  it('rejects a header-only fake and a truncated real PDF', async () => {
    const fake = new Uint8Array(MIN_RESUME_BYTES);
    fake.set(new TextEncoder().encode('%PDF-1.7\n'));
    expect(await inspectStaticResumePdf(fake)).toBe(false);
    expect(await inspectStaticResumePdf(validResumePdfBytes().slice(0, -20))).toBe(false);
  });

  it.each([
    '/OpenAction << /S /JavaScript /JS (alert\(1\)) >>',
    '/J#53 (encoded script key)',
    '/#4aS (lowercase encoded script key)',
    '/OpenAction << /S /#4aavaScript /#4aS (script) >>',
    '/OpenAction << /S /Launch /F (file.exe) >>',
    '/Names << /EmbeddedFiles << /Names [(payload) 6 0 R] >> >>',
    '/AcroForm << /Fields [] >>',
  ])('rejects active document content: %s', async (catalog) => {
    expect(await inspectStaticResumePdf(validResumePdfBytes(catalog))).toBe(false);
  });

  it('rejects JavaScript hidden inside compressed object streams', async () => {
    const bytes = await document((doc) => {
      const script = doc.context.register(doc.context.obj({ S: 'JavaScript', JS: PDFString.of('alert(1)') }));
      doc.catalog.set(PDFName.of('OpenAction'), script);
    });
    expect(await inspectStaticResumePdf(bytes)).toBe(false);
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,payload'])('rejects unsafe link %s', async (uri) => {
    const bytes = await document((doc) => {
      doc.context.register(doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(uri) }));
    });
    expect(await inspectStaticResumePdf(bytes)).toBe(false);
  });

  it('rejects encrypted files even when their page tree is readable', async () => {
    const bytes = await document((doc) => {
      doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 1 }));
    });
    expect(await inspectStaticResumePdf(bytes)).toBe(false);
  });

  it('rejects an invalid page tree and a cycle without recursing forever', async () => {
    expect(await inspectStaticResumePdf(validResumePdfBytes('/Pages 6 0 R', ['<< /Type /Pages /Kids [6 0 R] /Count 1 >>']))).toBe(false);
    expect(await inspectStaticResumePdf(validResumePdfBytes('/Pages 99 0 R'))).toBe(false);
  });

  it('rejects deeply nested direct data before stack exhaustion', async () => {
    const nested = '/MetadataValue ' + '['.repeat(100) + '0' + ']'.repeat(100);
    expect(await inspectStaticResumePdf(validResumePdfBytes(nested))).toBe(false);
  });

  it('allows tagged-PDF layout attributes used by office exporters', async () => {
    expect(await inspectStaticResumePdf(validResumePdfBytes('/A << /O /Layout /Placement /Block >>'))).toBe(true);
  });

  it('rejects indirect stream filter/subtype budget bypasses', async () => {
    expect(await inspectStaticResumePdf(validResumePdfBytes('', [
      '<< /Length 3 /Filter 7 0 R >>\nstream\nabc\nendstream',
      '/FlateDecode',
    ]))).toBe(false);
    expect(await inspectStaticResumePdf(validResumePdfBytes('', [
      '<< /Length 3 /Subtype 7 0 R /Width 100000 /Height 100000 >>\nstream\nabc\nendstream',
      '/Image',
    ]))).toBe(false);
  });

  it('rejects external-file stream references', async () => {
    expect(await inspectStaticResumePdf(validResumePdfBytes('', [
      '<< /Length 0 /F (https://attacker.example/content) >>\nstream\n\nendstream',
    ]))).toBe(false);
  });

  it('rejects oversized numeric tokens without logging document data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(await inspectStaticResumePdf(validResumePdfBytes('/Value 123456789012345678901234567890123456789'))).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects deeply nested data inside a compressed object stream', async () => {
    const bytes = await document((doc) => {
      let value = doc.context.obj([0]);
      for (let i = 0; i < 100; i += 1) value = doc.context.obj([value]);
      doc.context.register(value);
    });
    expect(await inspectStaticResumePdf(bytes)).toBe(false);
  });

  it('bounds strings inside compressed object streams before building large text objects', async () => {
    const bytes = await document((doc) => {
      doc.context.register(PDFString.of('A'.repeat(128 * 1024)));
    });
    expect(await inspectStaticResumePdf(bytes)).toBe(false);
  });

  it.each(['ObjStm', 'XRef', 'Metadata'])('bounds Flate expansion before parsing a %s stream', async (type) => {
    const compressed = deflate(new Uint8Array(9 * 1024 * 1024));
    const bytes = await document((doc) => {
      const dict = doc.context.obj({ Type: type, Filter: 'FlateDecode', N: 1, First: 0, Size: 1, W: [1, 1, 1] });
      doc.context.register(PDFRawStream.of(dict, compressed));
    }, false);
    expect(bytes.length).toBeLessThan(250 * 1024);
    expect(await inspectStaticResumePdf(bytes)).toBe(false);
  });

  it.each(['ObjStm', 'XRef'])('rejects unreasonable %s entry counts before expansion loops', async (type) => {
    const bytes = await document((doc) => {
      const dict = doc.context.obj({ Type: type, N: 2_000_000_000, First: 0, Size: 2_000_000_000, W: [1, 1, 1] });
      doc.context.register(PDFRawStream.of(dict, new Uint8Array(10)));
    }, false);
    expect(await inspectStaticResumePdf(bytes)).toBe(false);
  });

  it('rejects oversized decoded image dimensions and too many pages', async () => {
    const image = await document((doc) => {
      doc.context.register(doc.context.stream('image', { Type: 'XObject', Subtype: 'Image', Width: 100_000, Height: 100_000 }));
    });
    expect(await inspectStaticResumePdf(image)).toBe(false);
    const pages = await document((doc) => {
      for (let i = 0; i < 10; i += 1) doc.addPage();
      doc.catalog.set(PDFName.of('UnusedCount'), PDFNumber.of(11));
    });
    expect(await inspectStaticResumePdf(pages)).toBe(false);
  });
});
