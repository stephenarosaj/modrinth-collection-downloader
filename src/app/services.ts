import type { ArchiveWriter, FileFetcher, ModrinthClient } from '../ports';
import {
  createArchiveWriter,
  createFileFetcher,
  createModrinthClient,
  type FileFetcherOptions,
  type HttpModrinthClientOptions,
} from '../adapters';

export interface AppServices {
  modrinthClient: ModrinthClient;
  fileFetcher: FileFetcher;
  archiveWriter: ArchiveWriter;
}

export interface CreateAppServicesOptions {
  modrinth?: HttpModrinthClientOptions;
  fetch?: FileFetcherOptions;
}

export function createAppServices(options: CreateAppServicesOptions = {}): AppServices {
  return {
    modrinthClient: createModrinthClient(options.modrinth),
    fileFetcher: createFileFetcher(options.fetch),
    archiveWriter: createArchiveWriter(),
  };
}

export const services: AppServices = createAppServices();
