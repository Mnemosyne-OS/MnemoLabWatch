/**
 * readFile — the researcher's text, from a file they pick (doc 187 §5.1).
 *
 *  - Text and Markdown go through `dialog.readFile` (`dialog:open`).
 *  - PDF and Word go through the host's extractor, `reader.extractDocument`
 *    (`vault:read`), the one MnemoReader uses: the whole text, OCR when the
 *    PDF has no text layer.
 *  - Both are permission-gated: no short bound, the first call can wait on
 *    the host's prompt.
 *  - The file picker is `dialog.selectFile`, human-paced (no bound at all).
 */
import type { HostInvoke } from '../sources/http';

export const TEXT_EXTENSIONS = ['txt', 'md', 'markdown'];
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx'];

export interface ReadText {
  name: string;
  text: string;
  /** True when the host cut the document. */
  truncated: boolean;
}

const extOf = (path: string) => path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
const nameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Reads a picked path. Null when the person closed the picker. */
export async function readPickedFile(invoke: HostInvoke, path: string | null): Promise<ReadText | null> {
  if (!path) return null;
  const ext = extOf(path);
  if (TEXT_EXTENSIONS.includes(ext)) {
    const r = (await invoke('dialog.readFile', { filePath: path })) as { success?: boolean; content?: unknown; isBinary?: boolean; error?: string } | null;
    if (!r?.success || typeof r.content !== 'string' || r.isBinary) throw new Error(r?.error ?? 'FILE_NOT_READ');
    return { name: nameOf(path), text: r.content, truncated: false };
  }
  if (DOCUMENT_EXTENSIONS.includes(ext)) {
    const r = (await invoke('reader.extractDocument', { filePath: path })) as { success?: boolean; data?: { text?: unknown; truncated?: unknown }; error?: string } | null;
    const text = r?.data?.text;
    if (r?.success === false || typeof text !== 'string') throw new Error(r?.error ?? 'DOCUMENT_NOT_READ');
    return { name: nameOf(path), text, truncated: r?.data?.truncated === true };
  }
  throw new Error(`EXTENSION_NOT_READ: .${ext}`);
}

/** `filterName` is shown by the OS picker: the caller passes it translated. */
export async function pickFile(invoke: HostInvoke, filterName: string): Promise<string | null> {
  const picked = await invoke('dialog.selectFile', { filters: [{ name: filterName, extensions: [...TEXT_EXTENSIONS, ...DOCUMENT_EXTENSIONS] }] }, 0);
  return typeof picked === 'string' && picked ? picked : null;
}
