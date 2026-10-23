// Port interfaces for external boundaries: ModrinthClient, FileFetcher, ArchiveWriter (M1/M2).
export interface Archive {
  addFile(path: string, data: Uint8Array | string): void;
  generate(opts?: { onProgress?: (pct: number) => void }): Promise<Blob>;
}

export interface ArchiveWriter {
  create(): Archive;
}

export interface FileFetcher {
  fetchBinary(url: string, opts?: { signal?: AbortSignal }): Promise<Uint8Array>;
}
