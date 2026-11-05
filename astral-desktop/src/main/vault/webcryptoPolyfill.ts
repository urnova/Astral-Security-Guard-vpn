/**
 * Electron 28 embeds Node 18, where worker threads do not expose a global WebCrypto.
 * The ESM build of libsodium refuses to load without globalThis.crypto.getRandomValues.
 * This module must be imported before libsodium; it only fills the gap and never replaces an existing implementation.
 */
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
}
