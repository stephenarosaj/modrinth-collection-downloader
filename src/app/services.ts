import type { ArchiveWriter, FileFetcher, ModrinthClient } from '../ports';
import {
  createArchiveWriter,
  createFileFetcher,
  createModrinthClient,
  type FileFetcherOptions,
  type HttpModrinthClientOptions,
} from '../adapters';

/** Service container providing access to external ports: Modrinth client, file fetcher, and archive writer. */
export interface AppServices {
  modrinthClient: ModrinthClient;
  fileFetcher: FileFetcher;
  archiveWriter: ArchiveWriter;
}

/** Options for customizing adapter instances within the service container. */
export interface CreateAppServicesOptions {
  modrinth?: HttpModrinthClientOptions;
  fetch?: FileFetcherOptions;
}

/** Factory function creating a new AppServices container initialized with production adapters. */
export function createAppServices(options: CreateAppServicesOptions = {}): AppServices {
  return {
    modrinthClient: createModrinthClient(options.modrinth),
    fileFetcher: createFileFetcher(options.fetch),
    archiveWriter: createArchiveWriter(),
  };
}

/** Default singleton AppServices instance for the application. */
export const services: AppServices = createAppServices();

