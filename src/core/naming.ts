/**
 * Deterministic output filename formatting and collision handling.
 */

import {
  type Entry,
  type InstanceTarget,
  type ProjectType,
  type VersionRef,
  isPlatformAgnostic,
} from './model';

/**
 * Canonical display names for known Modrinth platforms.
 * Unknown platforms fall back to title-case.
 */
const PLATFORM_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  forge: 'Forge',
  fabric: 'Fabric',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
  paper: 'Paper',
  spigot: 'Spigot',
  bukkit: 'Bukkit',
  purpur: 'Purpur',
  folia: 'Folia',
  bungeecord: 'BungeeCord',
  velocity: 'Velocity',
  waterfall: 'Waterfall',
  sponge: 'Sponge',
  liteloader: 'LiteLoader',
  modloader: 'ModLoader',
  rift: 'Rift',
  ornithe: 'Ornithe',
  babric: 'Babric',
  'legacy-fabric': 'LegacyFabric',
  datapack: 'Datapack',
  iris: 'Iris',
  optifine: 'OptiFine',
  canvas: 'Canvas',
  minecraft: 'Minecraft',
};

/**
 * Formats a project title into PascalCase with only ASCII alphanumeric characters:
 * - Split on whitespace
 * - Each word capitalized (first character upper-cased, rest unchanged)
 * - All non `[A-Za-z0-9]` characters removed
 * - Words joined without separator
 *
 * Falls back to `fallback` (e.g. project slug or ID) if the sanitized title is empty.
 */
export function formatTitle(title: string, fallback?: string): string {
  const sanitizeTokens = (input: string): string =>
    input
      .trim()
      .split(/\s+/)
      .map((word) => {
        const cleaned = word.replace(/[^A-Za-z0-9]/g, '');
        if (cleaned.length === 0) {
          return '';
        }
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      })
      .join('');

  const result = sanitizeTokens(title);
  if (result.length > 0) {
    return result;
  }

  if (fallback) {
    const fallbackResult = sanitizeTokens(fallback);
    if (fallbackResult.length > 0) {
      return fallbackResult;
    }
  }

  return 'Project';
}

/**
 * Formats a platform identifier into its display name.
 * Known platforms use their canonical casing (`NeoForge`, `BungeeCord`, etc.);
 * unknown platforms fall back to title-case with non-alphanumeric separators removed.
 */
export function formatPlatformDisplayName(platform: string): string {
  const trimmed = platform.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  const known = PLATFORM_DISPLAY_NAMES[lower];
  if (known) {
    return known;
  }

  return trimmed
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const cleaned = part.replace(/[^A-Za-z0-9]/g, '');
      if (cleaned.length === 0) {
        return '';
      }
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Sanitizes a version number by replacing `\ / : * ? " < > |` and whitespace with `-`.
 */
export function sanitizeVersionNumber(versionNumber: string): string {
  return versionNumber.trim().replace(/[\\/:*?"<>|\s]/g, '-');
}

/**
 * Extracts the file extension (without leading dot) from an original filename.
 * Returns an empty string if no extension is present.
 */
export function extractExtension(filename: string): string {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return '';
  }
  return trimmed.slice(lastDot + 1);
}

/** Input parameters for formatting a deterministic output filename. */
export interface FormatFilenameInput {
  title: string;
  slug?: string;
  projectId?: string;
  projectType: ProjectType;
  platform: string;
  gameVersion: string;
  versionNumber: string;
  originalFilename: string;
}

/**
 * Formats a deterministic output filename:
 * - Platform-specific (`mod`, `plugin`): `{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}`
 * - Platform-agnostic (`resourcepack`, `shader`, `datapack`): `{Title}-{GameVersion}-{VersionNumber}.{ext}`
 */
export function formatFilename(input: FormatFilenameInput): string {
  const titlePart = formatTitle(input.title, input.slug ?? input.projectId);
  const gameVersionPart = sanitizeVersionNumber(input.gameVersion);
  const versionNumberPart = sanitizeVersionNumber(input.versionNumber);
  const ext = extractExtension(input.originalFilename);

  const parts: string[] = [titlePart];

  if (!isPlatformAgnostic(input.projectType)) {
    const platformPart = formatPlatformDisplayName(input.platform);
    if (platformPart.length > 0) {
      parts.push(platformPart);
    }
  }

  parts.push(gameVersionPart, versionNumberPart);

  const stem = parts.join('-');
  return ext.length > 0 ? `${stem}.${ext}` : stem;
}

/**
 * Convenience helper to format the output filename for an `Entry` and its chosen `VersionRef`.
 */
export function formatEntryFilename(
  entry: Pick<Entry, 'project'>,
  version: Pick<VersionRef, 'versionNumber' | 'file'>,
  target: Pick<InstanceTarget, 'gameVersion' | 'platform'>,
): string {
  return formatFilename({
    title: entry.project.title,
    slug: entry.project.slug,
    projectId: entry.project.id,
    projectType: entry.project.type,
    platform: target.platform,
    gameVersion: target.gameVersion,
    versionNumber: version.versionNumber,
    originalFilename: version.file.filename,
  });
}

/**
 * Resolves filename collisions within a single output folder.
 * If `baseFilename` is already in `usedFilenames`, appends `-2`, `-3`, ... before the extension.
 * Mutates `usedFilenames` by adding the returned unique filename.
 */
export function resolveUniqueFilename(baseFilename: string, usedFilenames: Set<string>): string {
  if (!usedFilenames.has(baseFilename)) {
    usedFilenames.add(baseFilename);
    return baseFilename;
  }

  const lastDot = baseFilename.lastIndexOf('.');
  const hasFileExtension = lastDot > 0 && /[A-Za-z]/.test(baseFilename.slice(lastDot + 1));
  const stem = hasFileExtension ? baseFilename.slice(0, lastDot) : baseFilename;
  const extWithDot = hasFileExtension ? baseFilename.slice(lastDot) : '';

  let counter = 2;
  while (true) {
    const candidate = `${stem}-${counter}${extWithDot}`;
    if (!usedFilenames.has(candidate)) {
      usedFilenames.add(candidate);
      return candidate;
    }
    counter += 1;
  }
}
