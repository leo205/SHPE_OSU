import { PhotonImage } from '@cf-wasm/photon/node';
import { imageSize } from 'image-size';

export const MAX_SPONSOR_ASSET_BYTES = 2 * 1024 * 1024;
export const MAX_SPONSOR_IMAGE_DIMENSION = 4096;
export const MAX_SPONSOR_IMAGE_PIXELS = 4_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_END = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
const ACTIVE_MARKUP = /<\s*(?:!doctype|html|svg|script|iframe|object|embed|body)\b/i;
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_CONTAINER_PARTS = 512;

export type SponsorAsset = { file: Blob; extension: 'png'; contentType: 'image/png' };

function matches(bytes: Uint8Array, expected: number[], offset = 0): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function format(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (bytes.length >= 45 && matches(bytes, PNG_SIGNATURE)
    && matches(bytes, PNG_END, bytes.length - PNG_END.length)) return 'png';
  if (bytes.length >= 12 && matches(bytes, [255, 216, 255])
    && matches(bytes, [255, 217], bytes.length - 2)) return 'jpg';
  if (bytes.length >= 30 && matches(bytes, [82, 73, 70, 70])
    && matches(bytes, [87, 69, 66, 80], 8)
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) === bytes.length - 8) {
    // Animation is outside the static-logo contract. Canvas dimensions alone
    // do not bound the work needed to decode an arbitrary animation.
    if (matches(bytes, [86, 80, 56, 88], 12) && (bytes[20] & 2) !== 0) return null;
    return 'webp';
  }
  return null;
}

function boundedDimensions(width: number, height: number): boolean {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width >= 1 && height >= 1
    && width <= MAX_SPONSOR_IMAGE_DIMENSION && height <= MAX_SPONSOR_IMAGE_DIMENSION
    && width * height <= MAX_SPONSOR_IMAGE_PIXELS;
}

// These are resource/framing gates, not image decoders. The mature codec below
// still validates checksums, compression streams, color data and pixel content.
function boundedPng(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const retained = [bytes.subarray(0, 8)];
  let offset = 8;
  let hasPixels = false;
  for (let parts = 0; parts < MAX_CONTAINER_PARTS && offset + 12 <= bytes.length; parts += 1) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (size > bytes.length - offset - 12) return null;
    if (parts === 0 && (type !== 'IHDR' || size !== 13)) return null;
    if ((parts > 0 && type === 'IHDR') || type === 'acTL') return null;
    // Compressed text and ICC metadata are unnecessary for a public logo and
    // have an independent decompression budget from the image's pixel count.
    // Drop it before decoding, so ordinary logos with color/text metadata work
    // without inflating attacker-controlled metadata alongside the pixels.
    if (!['zTXt', 'iTXt', 'iCCP'].includes(type)) retained.push(bytes.subarray(offset, offset + size + 12));
    if (type === 'IDAT') hasPixels = true;
    offset += size + 12;
    if (type === 'IEND') {
      if (size !== 0 || !hasPixels || offset !== bytes.length) return null;
      const sanitized = new Uint8Array(retained.reduce((sum, part) => sum + part.length, 0));
      let position = 0;
      for (const part of retained) { sanitized.set(part, position); position += part.length; }
      return sanitized;
    }
  }
  return null;
}

function boundedJpeg(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  for (let parts = 0; parts < MAX_CONTAINER_PARTS && offset + 2 <= bytes.length; parts += 1) {
    if (bytes[offset] !== 255) return false;
    const marker = bytes[offset + 1];
    if (marker === 217) return hasFrame && hasScan && offset + 2 === bytes.length;
    if (marker === 0 || marker === 255 || marker === 216 || marker === 1
      || (marker >= 208 && marker <= 215) || offset + 4 > bytes.length) return false;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) return false;
    const isFrame = marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker);
    if (isFrame) {
      if (hasFrame || ![192, 193, 194].includes(marker) || length < 8
        || !boundedDimensions(view.getUint16(offset + 7), view.getUint16(offset + 5))) return false;
      hasFrame = true;
    }
    offset += length + 2;
    if (!hasScan && offset > MAX_HEADER_BYTES) return false;
    if (marker === 218) {
      if (!hasFrame) return false;
      hasScan = true;
      // Skip entropy bytes, stuffed FF bytes and restart markers in linear
      // time. Segment scanning resumes at the next actual JPEG marker.
      while (offset + 1 < bytes.length) {
        if (bytes[offset] !== 255) { offset += 1; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || (next >= 208 && next <= 215)) { offset += 2; continue; }
        break;
      }
    }
  }
  return false;
}

function boundedWebp(bytes: Uint8Array, width: number, height: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let hasPixels = false;
  for (let parts = 0; parts < MAX_CONTAINER_PARTS && offset + 8 <= bytes.length; parts += 1) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (size > bytes.length - offset - 8) return false;
    if (type === 'VP8 ' || type === 'VP8L') {
      if (hasPixels || size < (type === 'VP8 ' ? 10 : 5)) return false;
      hasPixels = true;
      // Query the codec header independently of a potentially lying VP8X
      // canvas. Both must match before any full-frame allocation occurs.
      const frameHeader = new Uint8Array(30);
      frameHeader.set(bytes.subarray(0, 12));
      frameHeader.set(bytes.subarray(offset, Math.min(offset + 18, bytes.length)), 12);
      const inner = imageSize(frameHeader);
      if (inner.width !== width || inner.height !== height) return false;
    } else if (type === 'VP8X') {
      if (parts !== 0 || size !== 10 || (bytes[offset + 8] & 2) !== 0) return false;
    } else if (!['ALPH', 'ICCP', 'EXIF', 'XMP '].includes(type)) return false;
    offset += size + 8 + (size % 2);
  }
  return hasPixels && offset === bytes.length;
}

/**
 * A byte/dimension gate followed by a real Rust/WASM decoder, not MIME trust
 * or a handwritten substitute for an image codec. Accepted pixels are encoded
 * anew as PNG; uploaded metadata and trailing payloads never reach Storage.
 * This bounded static-raster policy is not antivirus.
 */
export async function validateSponsorAsset(file: File): Promise<SponsorAsset | null> {
  if (file.size < 12 || file.size > MAX_SPONSOR_ASSET_BYTES) return null;
  const expectedTypes = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const expected = expectedTypes[file.type.toLowerCase() as keyof typeof expectedTypes];
  if (!expected) return null;
  let decoded: PhotonImage | undefined;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (format(bytes) !== expected || ACTIVE_MARKUP.test(new TextDecoder('latin1').decode(bytes))) return null;
    const decoderBytes = expected === 'png' ? boundedPng(bytes) : bytes;
    if (!decoderBytes || (expected === 'jpg' && !boundedJpeg(bytes))) return null;
    const dimensions = imageSize(bytes.subarray(0, MAX_HEADER_BYTES));
    if (dimensions.type !== expected || !boundedDimensions(dimensions.width, dimensions.height)
      || (expected === 'webp' && !boundedWebp(bytes, dimensions.width, dimensions.height))) return null;

    decoded = PhotonImage.new_from_byteslice(decoderBytes);
    if (decoded.get_width() !== dimensions.width || decoded.get_height() !== dimensions.height) return null;
    const normalized = decoded.get_bytes();
    if (normalized.byteLength > MAX_SPONSOR_ASSET_BYTES || !matches(normalized, PNG_SIGNATURE)) return null;
    return { file: new Blob([normalized], { type: 'image/png' }), extension: 'png', contentType: 'image/png' };
  } catch {
    return null;
  } finally {
    decoded?.free();
  }
}
