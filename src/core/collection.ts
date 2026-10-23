// Collection input parsing and game version filtering utilities (§7.6, §11).

import type { GameVersionInfo } from '../ports';

export interface ParsedCollectionInput {
  collectionId: string;
  url: string;
}

const BARE_COLLECTION_ID_RE = /^[A-Za-z0-9_-]+$/;
const COLLECTION_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?modrinth\.com\/collection\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i;

/**
 * Parses a Modrinth collection URL or bare collection ID into a normalized
 * `{ collectionId, url }` pair (§7.6, §11).
 *
 * Throws an Error if the input is empty or not a valid Modrinth collection URL/ID.
 */
export function parseCollectionInput(input: string): ParsedCollectionInput {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Collection ID or URL cannot be empty.');
  }

  const urlMatch = COLLECTION_URL_RE.exec(trimmed);
  if (urlMatch?.[1]) {
    const collectionId = urlMatch[1];
    return {
      collectionId,
      url: `https://modrinth.com/collection/${collectionId}`,
    };
  }

  if (BARE_COLLECTION_ID_RE.test(trimmed)) {
    return {
      collectionId: trimmed,
      url: `https://modrinth.com/collection/${trimmed}`,
    };
  }

  throw new Error(`Invalid Modrinth collection URL or ID: "${trimmed}"`);
}

/**
 * Convenience helper returning just the normalized collection ID from a URL or bare ID.
 */
export function extractCollectionId(input: string): string {
  return parseCollectionInput(input).collectionId;
}

/**
 * Filters a list of Modrinth game versions to release versions only (§7.6, §11).
 */
export function filterReleaseGameVersions(versions: readonly GameVersionInfo[]): GameVersionInfo[] {
  return versions.filter(
    (v) => v.versionType === 'release' && typeof v.version === 'string' && v.version.trim() !== '',
  );
}
