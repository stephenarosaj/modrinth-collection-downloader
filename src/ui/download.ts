import {
  getMrpackWarnings,
  serialize,
  toFileTree,
  toMrpack,
  type EnvironmentId,
  type Instance,
  type MrpackIndex,
} from '../core';
import type { ArchiveWriter, FileFetcher } from '../ports';
import { isAbortError } from './utils';

export interface ZipExportProgress {
  phase: 'downloading' | 'archiving' | 'complete';
  completed: number;
  total: number;
  archivePercent: number;
  currentFile?: string;
}

export interface FailedDownload {
  path: string;
  filename: string;
  projectId: string;
  url: string;
  error: string;
}

export interface ExportEnvironmentZipOptions {
  instance: Instance;
  env: EnvironmentId;
  fileFetcher: FileFetcher;
  archiveWriter: ArchiveWriter;
  signal?: AbortSignal;
  concurrency?: number;
  onProgress?: (progress: ZipExportProgress) => void;
  onExportBlob?: (filename: string, blob: Blob) => void;
}

export interface ExportEnvironmentZipResult {
  filename: string;
  succeededCount: number;
  totalCount: number;
  failedFiles: FailedDownload[];
  blob: Blob | null;
}

export interface ExportMrpackArchiveOptions {
  instance: Instance;
  archiveWriter: ArchiveWriter;
  platformVersion?: string;
  signal?: AbortSignal;
  onExportBlob?: (filename: string, blob: Blob) => void;
}

export type ExportMrpackOptions = ExportMrpackArchiveOptions;

export interface ExportMrpackArchiveResult {
  filename: string;
  index: MrpackIndex;
  warnings: string[];
  blob: Blob;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

/**
 * Triggers a browser download of a `Blob` payload using a temporary object URL.
 * Always cleans up the temporary anchor and revokes the object URL in `finally`.
 */
export function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    if (anchor.parentNode === document.body) {
      document.body.removeChild(anchor);
    }
    URL.revokeObjectURL(url);
  }
}

/**
 * Triggers a browser download of a UTF-8 text payload using a temporary object URL.
 */
export function triggerTextDownload(
  filename: string,
  content: string,
  mimeType = 'application/json;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(filename, blob);
}

/**
 * Serializes an `Instance` (validating against the instance schema) and triggers a download
 * of `<collectionId>-instance.json` (§8.2, §13 M3.1).
 */
export function exportInstanceJson(
  instance: Instance,
  onExportJson: (filename: string, jsonContent: string) => void = triggerTextDownload,
): { filename: string; json: string } {
  const json = serialize(instance);
  const filename = `${instance.meta.source.collectionId}-instance.json`;
  onExportJson(filename, json);
  return { filename, json };
}

/**
 * Downloads all selected files for an environment (`client` or `server`) with bounded concurrency,
 * packages successful downloads into per-type folders matching `toFileTree(instance)[env]`,
 * reports partial failures, and triggers a download of `<collectionId>-<env>.zip` (§8.1, §13 M4).
 */
export async function exportEnvironmentZip({
  instance,
  env,
  fileFetcher,
  archiveWriter,
  signal,
  concurrency = 5,
  onProgress,
  onExportBlob = triggerBlobDownload,
}: ExportEnvironmentZipOptions): Promise<ExportEnvironmentZipResult> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const tree = toFileTree(instance)[env];
  const filename = `${instance.meta.source.collectionId}-${env}.zip`;
  const totalCount = tree.files.length;

  if (totalCount === 0) {
    return {
      filename,
      succeededCount: 0,
      totalCount: 0,
      failedFiles: [],
      blob: null,
    };
  }

  const maxConcurrency = Math.max(1, Math.min(concurrency, totalCount));
  const downloaded: Array<Uint8Array | null> = new Array<Uint8Array | null>(totalCount).fill(null);
  const failedByIndex: Array<FailedDownload | null> = new Array<FailedDownload | null>(
    totalCount,
  ).fill(null);

  let nextIndex = 0;
  let completedCount = 0;

  onProgress?.({
    phase: 'downloading',
    completed: 0,
    total: totalCount,
    archivePercent: 0,
    currentFile: tree.files[0]?.filename,
  });

  const runWorker = async (): Promise<void> => {
    while (nextIndex < totalCount) {
      if (signal?.aborted) {
        throw createAbortError();
      }
      const currentIndex = nextIndex++;
      const entry = tree.files[currentIndex];
      if (!entry) {
        continue;
      }

      try {
        const bytes = await fileFetcher.fetchBinary(entry.file.url, { signal });
        if (signal?.aborted) {
          throw createAbortError();
        }
        downloaded[currentIndex] = bytes;
        completedCount += 1;
        onProgress?.({
          phase: 'downloading',
          completed: completedCount,
          total: totalCount,
          archivePercent: 0,
          currentFile: entry.filename,
        });
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) {
          throw isAbortError(err) ? err : createAbortError();
        }
        const message = err instanceof Error ? err.message : String(err);
        failedByIndex[currentIndex] = {
          path: entry.path,
          filename: entry.filename,
          projectId: entry.projectId,
          url: entry.file.url,
          error: message || 'Download failed',
        };
        completedCount += 1;
        onProgress?.({
          phase: 'downloading',
          completed: completedCount,
          total: totalCount,
          archivePercent: 0,
          currentFile: entry.filename,
        });
      }
    }
  };

  const workers = Array.from({ length: maxConcurrency }, () => runWorker());
  await Promise.all(workers);

  if (signal?.aborted) {
    throw createAbortError();
  }

  const failedFiles = failedByIndex.filter((item): item is FailedDownload => item !== null);
  let succeededCount = 0;
  for (let i = 0; i < totalCount; i += 1) {
    if (downloaded[i] !== null) {
      succeededCount += 1;
    }
  }

  if (succeededCount === 0) {
    onProgress?.({
      phase: 'complete',
      completed: totalCount,
      total: totalCount,
      archivePercent: 0,
    });
    return {
      filename,
      succeededCount: 0,
      totalCount,
      failedFiles,
      blob: null,
    };
  }

  const archive = archiveWriter.create();
  for (let i = 0; i < totalCount; i += 1) {
    const entry = tree.files[i];
    const data = downloaded[i];
    if (entry && data !== null && data !== undefined) {
      archive.addFile(entry.path, data);
    }
  }

  onProgress?.({
    phase: 'archiving',
    completed: totalCount,
    total: totalCount,
    archivePercent: 0,
  });

  const blob = await archive.generate({
    onProgress: (pct) => {
      if (!signal?.aborted) {
        onProgress?.({
          phase: 'archiving',
          completed: totalCount,
          total: totalCount,
          archivePercent: pct,
        });
      }
    },
  });

  if (signal?.aborted) {
    throw createAbortError();
  }

  onProgress?.({
    phase: 'complete',
    completed: totalCount,
    total: totalCount,
    archivePercent: 100,
  });

  onExportBlob(filename, blob);

  return {
    filename,
    succeededCount,
    totalCount,
    failedFiles,
    blob,
  };
}

/**
 * Generates and downloads a Modrinth `.mrpack` archive containing `modrinth.index.json`
 * without downloading any project binaries (§8.3, §13 M4).
 */
export async function exportMrpackArchive({
  instance,
  archiveWriter,
  platformVersion,
  signal,
  onExportBlob = triggerBlobDownload,
}: ExportMrpackArchiveOptions): Promise<ExportMrpackArchiveResult> {
  if (signal?.aborted) {
    throw createAbortError();
  }
  const index = toMrpack(instance, { platformVersion });
  const warnings = getMrpackWarnings(instance);
  const archive = archiveWriter.create();
  archive.addFile('modrinth.index.json', `${JSON.stringify(index, null, 2)}\n`);
  const blob = await archive.generate();
  if (signal?.aborted) {
    throw createAbortError();
  }
  const filename = `${instance.meta.source.collectionId}.mrpack`;
  onExportBlob(filename, blob);
  return {
    filename,
    index,
    warnings,
    blob,
  };
}
