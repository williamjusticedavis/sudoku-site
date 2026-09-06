import { describe, expect, it } from 'vitest';
import { looksLikeImage } from './imageType.js';

const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(32)]);

describe('looksLikeImage', () => {
  it('accepts the formats sharp is asked to decode', () => {
    expect(looksLikeImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      true,
    ); // png
    expect(looksLikeImage(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe(true); // jpeg
    expect(looksLikeImage(pad([...Buffer.from('GIF89a')]))).toBe(true);
    expect(
      looksLikeImage(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBP'),
          Buffer.alloc(16),
        ]),
      ),
    ).toBe(true);
  });

  it('rejects a non-image however it is labelled', () => {
    // The multipart Content-Type is chosen by the caller and proves nothing, so
    // this is the only check standing between an arbitrary upload and libvips.
    expect(looksLikeImage(pad([0x50, 0x4b, 0x03, 0x04]))).toBe(false); // zip
    expect(looksLikeImage(pad([0x7f, 0x45, 0x4c, 0x46]))).toBe(false); // elf
    expect(looksLikeImage(pad([...Buffer.from('#!/bin/sh\n')]))).toBe(false);
    expect(looksLikeImage(pad([...Buffer.from('<?php phpinfo();')]))).toBe(false);
    expect(looksLikeImage(pad([...Buffer.from('<svg xmlns=')]))).toBe(false);
  });

  it('rejects a buffer too short to carry a signature', () => {
    expect(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
    expect(looksLikeImage(Buffer.alloc(0))).toBe(false);
  });
});
