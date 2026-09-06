/**
 * Magic-byte sniffing for uploads.
 *
 * The multipart `Content-Type` a client declares is just a string it chose, so
 * it is not evidence that the bytes are an image. This checks the actual
 * signature before the buffer reaches `sharp`, which keeps obviously-wrong
 * payloads away from the image decoder — the largest piece of native attack
 * surface the service has.
 *
 * Only the formats `sharp` is built to handle here are accepted. Anything else
 * is refused rather than handed over on the chance libvips copes.
 */

/** Signatures at offset 0, unless a check function is given. */
const SIGNATURES: { name: string; test: (b: Buffer) => boolean }[] = [
  {
    name: 'png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  { name: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    name: 'gif',
    test: (b) =>
      b
        .subarray(0, 6)
        .toString('ascii')
        .match(/^GIF8[79]a$/) !== null,
  },
  {
    name: 'webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    name: 'avif/heic',
    test: (b) =>
      b.subarray(4, 8).toString('ascii') === 'ftyp' &&
      /^(avif|avis|heic|heix|mif1|msf1)$/.test(b.subarray(8, 12).toString('ascii')),
  },
  { name: 'tiff-le', test: (b) => b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a },
  { name: 'tiff-be', test: (b) => b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 },
];

/** Whether the buffer starts with the signature of an image format sharp reads. */
export function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  return SIGNATURES.some((s) => s.test(buffer));
}
