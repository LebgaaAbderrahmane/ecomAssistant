/**
 * Unit-test stub for @whiskeysockets/baileys (ESM-only package).
 * ts-jest runs in CommonJS mode; this stub prevents "Cannot use import statement outside a module"
 * when any source file importing baileys is pulled into the unit test graph.
 * The e2e boot gate uses jest.mock() inline instead (test/baileys-engine.e2e-spec.ts).
 *
 * Note: the jest moduleNameMapper also redirects the `@whiskeysockets/baileys/(.*)` subpath
 * (including `/package.json`) to this stub, so BaileysPlugin.getEngineLibrary() returns an
 * undefined version in unit tests by design. Production reads the real package.json via the
 * unmapped require.
 */
export default jest.fn();
export const useMultiFileAuthState = jest.fn();
export const fetchLatestBaileysVersion = jest.fn();
export const getContentType = jest.fn();
export const DisconnectReason = { loggedOut: 401 };

// Inline implementation mirrored from @whiskeysockets/baileys/lib/Utils/generics.js
// (the package is pure ESM; ts-jest runs CJS, so the mock owns the serialisation helpers)

type BufferLike = { type: 'Buffer'; data: string | number[] };
type BufferJsonObject = { buffer?: boolean; type?: string; data?: string | number[]; value?: string | number[] };

export const BufferJSON = {
  replacer: (_k: string, value: unknown): unknown => {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      return { type: 'Buffer', data: Buffer.from(value).toString('base64') };
    }
    if (typeof value === 'object' && value !== null && (value as BufferLike).type === 'Buffer') {
      return { type: 'Buffer', data: Buffer.from((value as BufferLike).data).toString('base64') };
    }
    return value;
  },
  reviver: (_: string, value: unknown): unknown => {
    if (typeof value === 'object' && value !== null) {
      const obj = value as BufferJsonObject;
      if (obj.buffer === true || obj.type === 'Buffer') {
        const val = obj.data ?? obj.value;
        return typeof val === 'string' ? Buffer.from(val, 'base64') : Buffer.from(val ?? []);
      }
    }
    return value;
  },
};
