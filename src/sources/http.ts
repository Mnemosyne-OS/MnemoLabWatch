/**
 * http — the two ways the cartridge reaches a source (same split as
 * MnemoScience's `sources/http.ts`).
 *
 *  - Direct `fetch` for OpenAlex, which answers with CORS `*`.
 *  - The host's `social.fetch` for the OpenAI feed, which has no CORS header.
 *    It answers `{ status, body, encoding, truncated }`, HTTPS only, 4 MB
 *    cap, 12 s timeout. `truncated: true` means the body is a PREFIX: it is
 *    refused, never parsed as if whole.
 */

/** Deadline of one direct request. */
export const DIRECT_TIMEOUT_MS = 30_000;

/** For an ungated host call (opening a link): the host answers at once. */
export const HOST_TIMEOUT_MS = 20_000;

export type HostInvoke = (action: string, payload?: unknown, timeoutMs?: number) => Promise<unknown>;

function withDeadline(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const deadline = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/** JSON from an HTTPS endpoint with CORS. A non-2xx is an error, never an empty answer. */
export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal: withDeadline(signal, DIRECT_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

interface HostFetchAnswer {
  status?: number;
  body?: string;
  encoding?: 'utf8' | 'base64';
  truncated?: boolean;
}

function base64Text(body: string): string {
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Refused: a truncated body, a non-2xx status, an answer without a text body. */
export function hostAnswerText(answer: unknown): string {
  const a = (answer && typeof answer === 'object' ? answer : {}) as HostFetchAnswer;
  if (a.truncated === true) throw new Error('HOST_FETCH_TRUNCATED');
  if (typeof a.status === 'number' && (a.status < 200 || a.status >= 300)) throw new Error(`HTTP_${a.status}`);
  if (typeof a.body !== 'string') throw new Error('HOST_FETCH_NO_BODY');
  return a.encoding === 'base64' ? base64Text(a.body) : a.body;
}

/**
 * Text through the host. The bridge call cannot be cancelled: a stop is
 * honoured when it answers. `social.fetch` is gated by `vault:read`, so its
 * first call can wait on the host's permission prompt: it takes the SDK's own
 * human-paced bound, never a short one (the host itself gives up the network
 * at 12 s).
 */
export async function hostFetchText(invoke: HostInvoke, url: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const answer = await invoke('social.fetch', { url });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return hostAnswerText(answer);
}
