import { PhotonImage } from '@cf-wasm/photon/node';

/** Actual encoded synthetic pixels, never uploaded production branding. */
export function sponsorImageBytes(type: 'png' | 'jpeg' | 'webp' = 'png'): Uint8Array {
  const image = new PhotonImage(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
  try {
    return type === 'jpeg' ? image.get_bytes_jpeg(85) : type === 'webp' ? image.get_bytes_webp() : image.get_bytes();
  } finally { image.free(); }
}

export function sponsorImageFile(type: 'png' | 'jpeg' | 'webp' = 'png'): File {
  return new File([sponsorImageBytes(type)], `untrusted-name.${type}`, { type: `image/${type}` });
}
