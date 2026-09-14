import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFObjectStreamParser,
  PDFParser,
  PDFRawStream,
  PDFRef,
  PDFString,
} from 'pdf-lib';
import { Inflate } from 'pako';

// This accepts ordinary static resumes, not every feature of the PDF format.
// Keep pdf-lib pinned: these public low-level parsers let us impose budgets
// BEFORE its eager object/xref stream decoding. Nothing is rendered or executed.
const MAX_EXPANDED_BYTES = 8 * 1024 * 1024;
const MAX_OBJECTS = 3_000;
const MAX_NODES = 30_000;
const MAX_DEPTH = 64;
const MAX_PAGES = 10;
const MAX_STREAMS = 256;
const BLOCKED_KEYS = new Set([
  'JS', 'JavaScript', 'AA', 'EmbeddedFiles', 'EF', 'AF', 'Collection',
  'XFA', 'AcroForm', 'RichMediaContent', 'RichMediaSettings', 'Encrypt',
]);
const BLOCKED_NAMES = new Set([
  'JavaScript', 'Launch', 'EmbeddedFile', 'Filespec', 'FileAttachment',
  'RichMedia', 'Movie', 'Sound', '3D', 'GoToR', 'GoToE', 'SubmitForm',
  'ImportData', 'Rendition', 'ResetForm',
  'Thread', 'Hide', 'SetOCGState', 'Trans', 'GoTo3DView', 'Named',
]);

function reject(): never {
  // Do not log parser errors: they can contain attacker-supplied document text.
  throw new Error('Unsupported resume PDF');
}

function name(value: PDFObject | undefined): string | null {
  // pdf-lib 1.17.1 canonicalizes uppercase hex escapes in PDF names; PDF also
  // permits lowercase hex. Interpret those for policy checks as well.
  return value instanceof PDFName
    ? value.decodeText().replace(/#([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    : null;
}

function number(value: PDFObject | undefined, minimum: number, maximum: number): number {
  const result = value instanceof PDFNumber ? value.asNumber() : NaN;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) reject();
  return result;
}

function rawValue(dict: PDFDict, key: string): PDFObject | undefined {
  for (const [candidate, value] of dict.entries()) if (name(candidate) === key) return value;
  return undefined;
}

function lookup(dict: PDFDict, key: string): PDFObject | undefined {
  return dict.context.lookup(rawValue(dict, key));
}

function safeUri(value: PDFObject | undefined): boolean {
  if (!(value instanceof PDFString) && !(value instanceof PDFHexString)) return false;
  const text = value.decodeText();
  if (text.length > 2048 || /[\u0000-\u0020\u007f]/.test(text)) return false;
  try {
    const url = new URL(text);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function boundNumberToken(bytes: { peekAhead: (offset: number) => number }): void {
  let token = '';
  for (let i = 0; i <= 32; i += 1) {
    const byte = bytes.peekAhead(i);
    if (!(byte >= 48 && byte <= 57) && ![43, 45, 46].includes(byte)) break;
    token += String.fromCharCode(byte);
  }
  // Avoid pdf-lib's warning path, which prints oversized attacker-owned tokens.
  if (token.length > 32 || !Number.isFinite(Number(token)) || Math.abs(Number(token)) > 1e12) reject();
}

function boundTextToken(bytes: { peekAhead: (offset: number) => number }, kind: 'string' | 'hex' | 'name'): void {
  const limit = kind === 'name' ? 1024 : 64 * 1024;
  let depth = 0;
  let escaped = false;
  for (let i = 0; i <= limit; i += 1) {
    const byte = bytes.peekAhead(i);
    if (byte === undefined) reject();
    if (kind === 'hex' && i > 0 && byte === 62) return;
    if (kind === 'name' && i > 0 && [0, 9, 10, 12, 13, 32, 40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(byte)) return;
    if (kind === 'string') {
      if (!escaped && byte === 40) depth += 1;
      if (!escaped && byte === 41 && --depth === 0) return;
      escaped = byte === 92 ? !escaped : false;
    }
  }
  reject();
}

class InspectionBudget {
  expanded = 0;
  parsedBytes = 0;
  nodes = 0;
  depth = 0;
  streams = 0;
  objectCount = 0;
  failed = false;
  pending: Promise<void>[] = [];
  dictionaries = new Set<PDFDict>();

  parse(operation: () => PDFObject, position: () => number): PDFObject {
    this.nodes += 1;
    this.depth += 1;
    if (this.failed || this.nodes > MAX_NODES || this.depth > MAX_DEPTH) reject();
    try {
      const start = position();
      const object = operation();
      // Malicious ObjStm offsets may repeatedly parse the same large object.
      // Count work performed as well as distinct expanded bytes/objects.
      this.parsedBytes += Math.max(0, position() - start);
      if (this.parsedBytes > 32 * 1024 * 1024) reject();
      if (object instanceof PDFName && BLOCKED_NAMES.has(name(object)!)) reject();
      if (object instanceof PDFDict) this.inspectDictionary(object);
      return object;
    } finally {
      this.depth -= 1;
    }
  }

  inspectDictionary(dict: PDFDict): void {
    if (dict.keys().length > 1024) reject();
    this.dictionaries.add(dict);
    for (const [key, value] of dict.entries()) {
      const keyName = name(key)!;
      if (BLOCKED_KEYS.has(keyName)) reject();
      if (value instanceof PDFName && BLOCKED_NAMES.has(name(value)!)) reject();
      // Immediate checks catch dangerous overwritten/unreferenced objects too.
      if (keyName === 'URI' && !(value instanceof PDFRef) && !safeUri(value)) reject();
    }
  }

  inflate(bytes: Uint8Array): Uint8Array {
    const chunks: Uint8Array[] = [];
    let length = 0;
    const inflater = new Inflate({ chunkSize: 32 * 1024 });
    inflater.onData = (chunk: Uint8Array) => {
      this.expanded += chunk.byteLength;
      if (this.expanded > MAX_EXPANDED_BYTES) reject();
      length += chunk.byteLength;
      chunks.push(chunk);
    };
    inflater.push(bytes, true);
    if (inflater.err || !inflater.ended) reject();
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  prepareStream(raw: PDFRawStream): PDFRawStream {
    if (++this.streams > MAX_STREAMS) reject();
    this.inspectDictionary(raw.dict);
    for (const key of ['F', 'FFilter', 'FDecodeParms', 'Ref']) {
      if (rawValue(raw.dict, key)) reject();
    }
    const type = name(lookup(raw.dict, 'Type'));
    // An indirect/unresolved stream type could bypass structural interception.
    if (rawValue(raw.dict, 'Type') instanceof PDFRef
      || rawValue(raw.dict, 'Filter') instanceof PDFRef
      || rawValue(raw.dict, 'Subtype') instanceof PDFRef) reject();
    const structural = type === 'ObjStm' || type === 'XRef';
    const filterValue = lookup(raw.dict, 'Filter');
    let filter = filterValue;
    if (filterValue instanceof PDFArray) {
      if (filterValue.size() !== 1) reject();
      if (filterValue.get(0) instanceof PDFRef) reject();
      filter = filterValue.lookup(0);
    }
    let contents = raw.contents;
    if (name(filter) === 'FlateDecode') {
      contents = this.inflate(contents);
    } else if (filter && !(name(filter) === 'DCTDecode' && !structural)) {
      reject();
    } else {
      this.expanded += contents.length;
      if (this.expanded > MAX_EXPANDED_BYTES) reject();
    }
    if (name(lookup(raw.dict, 'Subtype')) === 'Image') {
      const width = number(lookup(raw.dict, 'Width'), 1, 10_000);
      const height = number(lookup(raw.dict, 'Height'), 1, 10_000);
      if (width * height > 20_000_000) reject();
    }
    if (!structural) return raw;

    const dict = raw.dict.clone();
    for (const key of dict.keys()) {
      if (['Filter', 'DecodeParms', 'Type', 'Length'].includes(name(key)!)) dict.delete(key);
    }
    dict.set(PDFName.of('Type'), PDFName.of(type!));
    dict.set(PDFName.of('Length'), PDFNumber.of(contents.length));
    const bounded = PDFRawStream.of(dict, contents);
    if (type === 'ObjStm') {
      this.objectCount += number(lookup(dict, 'N'), 1, MAX_OBJECTS);
      if (this.objectCount > MAX_OBJECTS) reject();
      number(lookup(dict, 'First'), 0, contents.length);
      // Use pdf-lib's object-stream parser with our depth/node/feature budget.
      // With no yield callback, parsing executes synchronously; the Promise
      // captures errors. This instance is private to one incoming request.
      const parser = new BoundedObjectStreamParser(bounded, this);
      this.pending.push(parser.parseIntoContext().catch(() => { this.failed = true; }));
      // Prevent PDFParser from parsing this same stream a second, unbounded time.
      dict.set(PDFName.of('Type'), PDFName.of('InspectedObjectStream'));
    } else {
      number(lookup(dict, 'Size'), 1, MAX_OBJECTS);
      const widths = lookup(dict, 'W');
      if (!(widths instanceof PDFArray) || widths.size() !== 3) reject();
      for (let i = 0; i < 3; i += 1) number(widths.lookup(i), 0, 8);
      const index = lookup(dict, 'Index');
      if (index) {
        if (!(index instanceof PDFArray) || index.size() % 2 !== 0 || index.size() > MAX_OBJECTS) reject();
        let entries = 0;
        for (let i = 0; i < index.size(); i += 2) {
          number(index.lookup(i), 0, MAX_OBJECTS);
          entries += number(index.lookup(i + 1), 0, MAX_OBJECTS);
        }
        if (entries > MAX_OBJECTS) reject();
      }
    }
    return bounded;
  }

  inspectResolvedDictionaries(): void {
    for (const dict of this.dictionaries) {
      for (const [key, value] of dict.entries()) {
        const resolved = dict.context.lookup(value);
        if (resolved instanceof PDFName && BLOCKED_NAMES.has(name(resolved)!)) reject();
        if (name(key) === 'URI' && !safeUri(resolved)) reject();
        // An OpenAction may be a passive page destination, never an action.
        if (name(key) === 'OpenAction' && !(resolved instanceof PDFArray)) reject();
        if (name(key) === 'A' && resolved instanceof PDFDict
          && rawValue(resolved, 'S')
          && !['URI', 'GoTo'].includes(name(lookup(resolved, 'S')) ?? '')) reject();
      }
      const action = name(lookup(dict, 'S'));
      if (name(lookup(dict, 'Type')) === 'Action' || dict.has(PDFName.of('S')) && dict.has(PDFName.of('URI'))) {
        if (action !== 'URI' && action !== 'GoTo') reject();
      }
    }
  }
}

class BoundedObjectStreamParser extends PDFObjectStreamParser {
  constructor(stream: PDFRawStream, private budget: InspectionBudget) {
    super(stream);
  }
  override parseObject(): PDFObject {
    return this.budget.parse(() => {
      const object = super.parseObject();
      // The PDF specification forbids streams within object streams.
      if (object instanceof PDFRawStream) reject();
      return object;
    }, () => this.bytes.offset());
  }
  protected override parseRawNumber(): number {
    boundNumberToken(this.bytes);
    return super.parseRawNumber();
  }
  protected override parseRawInt(): number {
    boundNumberToken(this.bytes);
    return super.parseRawInt();
  }
  protected override parseString(): PDFString {
    boundTextToken(this.bytes, 'string');
    return super.parseString();
  }
  protected override parseHexString(): PDFHexString {
    boundTextToken(this.bytes, 'hex');
    return super.parseHexString();
  }
  protected override parseName(): PDFName {
    boundTextToken(this.bytes, 'name');
    return super.parseName();
  }
}

class BoundedPdfParser extends PDFParser {
  constructor(bytes: Uint8Array, private budget: InspectionBudget) {
    super(bytes, 100, true, true);
  }
  override parseObject(): PDFObject {
    return this.budget.parse(() => {
      const object = super.parseObject();
      return object instanceof PDFRawStream ? this.budget.prepareStream(object) : object;
    }, () => this.bytes.offset());
  }
  protected override parseDict(): PDFDict {
    const dict = super.parseDict();
    // Includes trailer dictionaries, which bypass parseObject in PDFParser.
    this.budget.inspectDictionary(dict);
    return dict;
  }
  protected override parseRawNumber(): number {
    boundNumberToken(this.bytes);
    return super.parseRawNumber();
  }
  protected override parseRawInt(): number {
    boundNumberToken(this.bytes);
    return super.parseRawInt();
  }
  protected override parseString(): PDFString {
    boundTextToken(this.bytes, 'string');
    return super.parseString();
  }
  protected override parseHexString(): PDFHexString {
    boundTextToken(this.bytes, 'hex');
    return super.parseHexString();
  }
  protected override parseName(): PDFName {
    boundTextToken(this.bytes, 'name');
    return super.parseName();
  }
}

function inspectPageTree(context: PDFContext): void {
  const catalog = context.lookup(context.trailerInfo.Root);
  if (!(catalog instanceof PDFDict) || name(lookup(catalog, 'Type')) !== 'Catalog') reject();
  const root = lookup(catalog, 'Pages');
  const seen = new Set<PDFDict>();
  let pages = 0;
  const visit = (node: PDFObject | undefined, depth: number, inheritedBox?: PDFObject): number => {
    if (!(node instanceof PDFDict) || seen.has(node) || depth > MAX_DEPTH) reject();
    seen.add(node);
    const box = lookup(node, 'MediaBox') ?? inheritedBox;
    if (name(lookup(node, 'Type')) === 'Page') {
      if (++pages > MAX_PAGES || !(box instanceof PDFArray) || box.size() !== 4) reject();
      const dimensions = box.asArray().map((value) => {
        const resolved = context.lookup(value);
        const coordinate = resolved instanceof PDFNumber ? resolved.asNumber() : NaN;
        if (!Number.isFinite(coordinate) || Math.abs(coordinate) > 14_400) reject();
        return coordinate;
      });
      if (dimensions[2] <= dimensions[0] || dimensions[3] <= dimensions[1]) reject();
      const content = lookup(node, 'Contents');
      if (content && !(content instanceof PDFRawStream) && !(content instanceof PDFArray)) reject();
      if (content instanceof PDFArray) {
        for (const item of content.asArray()) if (!(context.lookup(item) instanceof PDFRawStream)) reject();
      }
      return 1;
    }
    if (name(lookup(node, 'Type')) !== 'Pages') reject();
    const kids = lookup(node, 'Kids');
    if (!(kids instanceof PDFArray) || kids.size() > MAX_OBJECTS) reject();
    let count = 0;
    for (const child of kids.asArray()) count += visit(context.lookup(child), depth + 1, box);
    if (number(lookup(node, 'Count'), 1, MAX_PAGES) !== count) reject();
    return count;
  };
  visit(root, 0);
  if (pages === 0) reject();
}

/** Structural/active-content screening, not antivirus or a safety guarantee. */
export async function inspectStaticResumePdf(bytes: Uint8Array): Promise<boolean> {
  try {
    const decoder = new TextDecoder('latin1');
    if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(decoder.decode(bytes.slice(0, 12)))) return false;
    // pdf-lib intentionally repairs missing trailers. Require a complete file
    // envelope ourselves, without trying to replace its object grammar parser.
    const trailer = /startxref\s+(\d+)\s+%%EOF[\s\0]*$/.exec(decoder.decode(bytes.slice(-1024)));
    if (!trailer) return false;
    const offset = Number(trailer[1]);
    if (!Number.isSafeInteger(offset) || offset < 8 || offset >= bytes.length) return false;
    const crossRefStart = decoder.decode(bytes.slice(offset, offset + 48));
    if (!/^(?:xref\s|\d+\s+\d+\s+obj\b)/.test(crossRefStart)) return false;
    const budget = new InspectionBudget();
    const context = await new BoundedPdfParser(bytes, budget).parseDocument();
    await Promise.all(budget.pending);
    if (budget.failed || context.trailerInfo.Encrypt || context.enumerateIndirectObjects().length > MAX_OBJECTS) return false;
    budget.inspectResolvedDictionaries();
    inspectPageTree(context);
    return true;
  } catch {
    return false;
  }
}
