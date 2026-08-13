/**
 * Environment-agnostic digests for hash-chained logs and trails.
 * Uses a deterministic expanded FNV-1a style hex so the same code path
 * runs in Node (tests) and the browser (dashboard) without native crypto.
 */

export function sha256Hex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const parts: string[] = [];
  let x = h >>> 0;
  for (let i = 0; i < 8; i++) {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
    parts.push(x.toString(16).padStart(8, '0'));
  }
  return parts.join('').slice(0, 64);
}
