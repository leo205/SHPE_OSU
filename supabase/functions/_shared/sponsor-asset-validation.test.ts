import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PhotonImage } from '@cf-wasm/photon/node';
import { imageSize } from 'image-size';
import { MAX_SPONSOR_ASSET_BYTES, validateSponsorAsset } from './sponsor-asset-validation.ts';
import { sponsorImageBytes, sponsorImageFile } from './sponsor-asset-test-fixtures.ts';

describe('bounded decoded sponsor logos', () => {
  it.each([
    ['sponsors/honda.webp', 'image/webp'], ['sponsors/burnsMcDonnell.webp', 'image/webp'],
    ['sponsors/lincolnElectric.webp', 'image/webp'], ['sponsors/greshamSmith.webp', 'image/webp'],
    ['sponsors/wtLogo.jpg', 'image/jpeg'], ['shpeLogo.png', 'image/png'],
  ])('accepts the existing real raster asset %s', async (path, type) => {
    const bytes = readFileSync(new URL(`../../../public/photos/${path}`, import.meta.url));
    expect(await validateSponsorAsset(new File([bytes], path, { type }))).not.toBeNull();
  });

  it.each(['png', 'jpeg', 'webp'] as const)('decodes a real %s and returns newly encoded PNG pixels', async (type) => {
    const asset = await validateSponsorAsset(sponsorImageFile(type));
    expect(asset).toMatchObject({ extension: 'png', contentType: 'image/png' });
    const bytes = new Uint8Array(await asset!.file.arrayBuffer());
    expect(imageSize(bytes)).toMatchObject({ type: 'png', width: 2, height: 1 });
    const decoded = PhotonImage.new_from_byteslice(bytes);
    expect(decoded.get_raw_pixels()).toHaveLength(8);
    decoded.free();
  });

  it('does not trust the supplied file name or extension', async () => {
    const file = new File([sponsorImageBytes()], '../../injected.svg', { type: 'image/png' });
    expect(await validateSponsorAsset(file)).toMatchObject({ extension: 'png' });
  });

  it.each(['image/svg+xml', 'text/html', 'application/pdf', 'application/octet-stream', ''])('rejects the unsupported claimed MIME %s', async (type) => {
    expect(await validateSponsorAsset(new File([sponsorImageBytes()], 'logo.png', { type }))).toBeNull();
  });

  it('rejects format/MIME mismatch, empty inputs, excessive size and header-only impostors', async () => {
    for (const file of [
      new File([sponsorImageBytes('jpeg')], 'logo.png', { type: 'image/png' }),
      new File([], 'logo.png', { type: 'image/png' }),
      new File([new Uint8Array(MAX_SPONSOR_ASSET_BYTES + 1)], 'logo.png', { type: 'image/png' }),
      new File([sponsorImageBytes().slice(0, 24)], 'logo.png', { type: 'image/png' }),
    ]) expect(await validateSponsorAsset(file)).toBeNull();
  });

  it('rejects a structurally corrupt image even with genuine magic, dimensions and final marker', async () => {
    const bytes = sponsorImageBytes();
    bytes[29] ^= 1; // Invalid IHDR CRC; header-only dimension readers still accept it.
    expect(imageSize(bytes)).toMatchObject({ width: 2, height: 1 });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try { expect(await validateSponsorAsset(new File([bytes], 'logo.png', { type: 'image/png' }))).toBeNull(); }
    finally { error.mockRestore(); }
    // A failed decode must not leave the decoder unusable for the next admin.
    expect(await validateSponsorAsset(sponsorImageFile())).not.toBeNull();
  });

  it.each([[4097, 1], [2001, 2000], [0, 2], [2, 0], [0xffffffff, 0xffffffff]])('rejects %s×%s header dimensions before allocating decoded pixels', async (width, height) => {
    const bytes = sponsorImageBytes();
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width); view.setUint32(20, height);
    const decode = vi.spyOn(PhotonImage, 'new_from_byteslice');
    try {
      expect(await validateSponsorAsset(new File([bytes], 'logo.png', { type: 'image/png' }))).toBeNull();
      expect(decode).not.toHaveBeenCalled();
    } finally { decode.mockRestore(); }
  });

  it('rejects appended/prepended active documents and embedded HTML/SVG polyglots', async () => {
    const bytes = sponsorImageBytes();
    const markup = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    for (const pieces of [[markup, bytes], [bytes, markup], [bytes.slice(0, -12), markup, bytes.slice(-12)]]) {
      expect(await validateSponsorAsset(new File(pieces, 'logo.png', { type: 'image/png' }))).toBeNull();
    }
    expect(await validateSponsorAsset(new File(['<html><script>alert(1)</script>'], 'logo.png', { type: 'image/png' }))).toBeNull();
  });

  it('rejects WebP with a false container size or animation flag', async () => {
    const wrongLength = sponsorImageBytes('webp');
    new DataView(wrongLength.buffer).setUint32(4, wrongLength.length, true);
    expect(await validateSponsorAsset(new File([wrongLength], 'logo.webp', { type: 'image/webp' }))).toBeNull();
    const animated = sponsorImageBytes('webp');
    animated.set(new TextEncoder().encode('VP8X'), 12); animated[20] |= 2;
    expect(await validateSponsorAsset(new File([animated], 'logo.webp', { type: 'image/webp' }))).toBeNull();
  });

  it('rejects a WebP whose canvas hides larger inner-frame dimensions before decoding', async () => {
    const original = sponsorImageBytes('webp');
    // Wrap the valid two-pixel VP8L frame in a one-pixel VP8X canvas.
    const basic = new Uint8Array(original.length + 18);
    basic.set(original.subarray(0, 12)); basic.set(original.subarray(12), 30);
    basic.set(new TextEncoder().encode('VP8X'), 12);
    const view = new DataView(basic.buffer);
    view.setUint32(4, basic.length - 8, true); view.setUint32(16, 10, true);
    const decode = vi.spyOn(PhotonImage, 'new_from_byteslice');
    try {
      expect(await validateSponsorAsset(new File([basic], 'logo.webp', { type: 'image/webp' }))).toBeNull();
      expect(decode).not.toHaveBeenCalled();
    } finally { decode.mockRestore(); }
  });

  it('drops compressed ancillary PNG metadata before decoding pixels', async () => {
    const basic = sponsorImageBytes();
    const metadata = new Uint8Array(24);
    new DataView(metadata.buffer).setUint32(0, 12);
    metadata.set(new TextEncoder().encode('iCCP'), 4);
    // Even this unusable compressed metadata is discarded rather than expanded.
    const file = new File([basic.subarray(0, 33), metadata, basic.subarray(33)], 'logo.png', { type: 'image/png' });
    expect(await validateSponsorAsset(file)).not.toBeNull();
  });

  it('rejects malformed JPEG marker chains before invoking the decoder', async () => {
    const bytes = new Uint8Array(64 * 1024);
    bytes.set([255, 216, 255, 224]); bytes.set([255, 217], bytes.length - 2);
    const decode = vi.spyOn(PhotonImage, 'new_from_byteslice');
    try {
      expect(await validateSponsorAsset(new File([bytes], 'logo.jpg', { type: 'image/jpeg' }))).toBeNull();
      expect(decode).not.toHaveBeenCalled();
    } finally { decode.mockRestore(); }
  });

  it('enforces the cap again after normalization', async () => {
    const encode = vi.spyOn(PhotonImage.prototype, 'get_bytes').mockReturnValue(new Uint8Array(MAX_SPONSOR_ASSET_BYTES + 1));
    try {
      // Generate the independent input before mocking PNG encode.
      expect(await validateSponsorAsset(sponsorImageFile('jpeg'))).toBeNull();
    } finally { encode.mockRestore(); }
  });
});
