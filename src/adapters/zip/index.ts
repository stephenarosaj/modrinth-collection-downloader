import JSZip from 'jszip';
import type { Archive, ArchiveWriter } from '../../ports';

function normalizeArchivePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) {
    throw new Error('Archive file path must not be empty.');
  }
  return normalized;
}

export class JsZipArchive implements Archive {
  private readonly zip: JSZip;

  constructor(zip: JSZip = new JSZip()) {
    this.zip = zip;
  }

  addFile(path: string, data: Uint8Array | string): void {
    const normalizedPath = normalizeArchivePath(path);
    this.zip.file(normalizedPath, data);
  }

  async generate(opts?: { onProgress?: (pct: number) => void }): Promise<Blob> {
    let lastReportedPct = -1;
    const reportProgress = (pct: number) => {
      lastReportedPct = pct;
      opts?.onProgress?.(pct);
    };

    const compressionOptions = {
      compression: 'DEFLATE' as const,
      compressionOptions: { level: 6 },
    };

    const hasNativeBlobArrayBuffer =
      JSZip.support.blob &&
      typeof Blob !== 'undefined' &&
      typeof Blob.prototype.arrayBuffer === 'function';

    let blob: Blob;
    if (hasNativeBlobArrayBuffer) {
      blob = await this.zip.generateAsync(
        {
          type: 'blob',
          ...compressionOptions,
        },
        (metadata) => {
          reportProgress(metadata.percent);
        },
      );
    } else {
      const bytes = await this.zip.generateAsync(
        {
          type: 'uint8array',
          ...compressionOptions,
        },
        (metadata) => {
          reportProgress(metadata.percent);
        },
      );
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      blob = new Blob([copy], { type: 'application/zip' });
      if (typeof blob.arrayBuffer !== 'function') {
        Object.defineProperty(blob, 'arrayBuffer', {
          value: async (): Promise<ArrayBuffer> => copy.slice().buffer,
          configurable: true,
        });
      }
    }

    if (lastReportedPct < 100) {
      reportProgress(100);
    }

    return blob;
  }
}

export class JsZipArchiveWriter implements ArchiveWriter {
  create(): Archive {
    return new JsZipArchive();
  }
}

export function createArchiveWriter(): ArchiveWriter {
  return new JsZipArchiveWriter();
}
