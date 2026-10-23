import { describe, expect, it } from 'vitest';
import {
  extractExtension,
  formatEntryFilename,
  formatFilename,
  formatPlatformDisplayName,
  formatTitle,
  resolveUniqueFilename,
  sanitizeVersionNumber,
} from '../../src/core/naming';
import type { ProjectType } from '../../src/core/model';

describe('naming (§8.1)', () => {
  describe('formatTitle', () => {
    it.each([
      { title: 'Better Third Person', fallback: undefined, expected: 'BetterThirdPerson' },
      { title: 'Sodium', fallback: undefined, expected: 'Sodium' },
      { title: 'fabric api', fallback: undefined, expected: 'FabricApi' },
      { title: 'Fabric API', fallback: undefined, expected: 'FabricAPI' },
      { title: '3d Skin Layers', fallback: undefined, expected: '3dSkinLayers' },
      { title: "Mod's Name: [Reborn] (v2)!", fallback: undefined, expected: 'ModsNameRebornV2' },
      {
        title: '   Multiple   Spaces   Here  ',
        fallback: undefined,
        expected: 'MultipleSpacesHere',
      },
      { title: 'McJtyLib', fallback: undefined, expected: 'McJtyLib' },
      { title: '!!! ???', fallback: 'my-mod-slug', expected: 'Mymodslug' },
      { title: '', fallback: '', expected: 'Project' },
    ])(
      'formats title "$title" (fallback: $fallback) -> "$expected"',
      ({ title, fallback, expected }) => {
        expect(formatTitle(title, fallback)).toBe(expected);
      },
    );
  });

  describe('formatPlatformDisplayName', () => {
    it.each([
      { platform: 'forge', expected: 'Forge' },
      { platform: 'FORGE', expected: 'Forge' },
      { platform: 'fabric', expected: 'Fabric' },
      { platform: 'neoforge', expected: 'NeoForge' },
      { platform: 'quilt', expected: 'Quilt' },
      { platform: 'paper', expected: 'Paper' },
      { platform: 'spigot', expected: 'Spigot' },
      { platform: 'bukkit', expected: 'Bukkit' },
      { platform: 'purpur', expected: 'Purpur' },
      { platform: 'folia', expected: 'Folia' },
      { platform: 'bungeecord', expected: 'BungeeCord' },
      { platform: 'velocity', expected: 'Velocity' },
      { platform: 'waterfall', expected: 'Waterfall' },
      { platform: 'sponge', expected: 'Sponge' },
      { platform: 'liteloader', expected: 'LiteLoader' },
      { platform: 'modloader', expected: 'ModLoader' },
      { platform: 'custom-loader', expected: 'CustomLoader' },
      { platform: 'unknown_platform', expected: 'UnknownPlatform' },
      { platform: '', expected: '' },
    ])('formats platform "$platform" -> "$expected"', ({ platform, expected }) => {
      expect(formatPlatformDisplayName(platform)).toBe(expected);
    });
  });

  describe('sanitizeVersionNumber', () => {
    it.each([
      { input: '1.9.0', expected: '1.9.0' },
      { input: '0.5.8+mc1.20.1', expected: '0.5.8+mc1.20.1' },
      { input: '1.0.0/beta:1*2?3"4<5>6|7\\8', expected: '1.0.0-beta-1-2-3-4-5-6-7-8' },
      { input: '1.0.0 (Release 2)', expected: '1.0.0-(Release-2)' },
      { input: '  2.1.0\tbeta  ', expected: '2.1.0-beta' },
    ])('sanitizes versionNumber "$input" -> "$expected"', ({ input, expected }) => {
      expect(sanitizeVersionNumber(input)).toBe(expected);
    });
  });

  describe('extractExtension', () => {
    it.each([
      { filename: 'BetterThirdPerson-Forge-1.20-1.9.0.jar', expected: 'jar' },
      { filename: 'FreshAnimations_v1.9.zip', expected: 'zip' },
      { filename: 'archive.tar.gz', expected: 'gz' },
      { filename: 'noextension', expected: '' },
      { filename: '.gitignore', expected: '' },
      { filename: 'trailingdot.', expected: '' },
    ])('extracts extension from "$filename" -> "$expected"', ({ filename, expected }) => {
      expect(extractExtension(filename)).toBe(expected);
    });
  });

  describe('formatFilename & formatEntryFilename', () => {
    it.each<{
      description: string;
      title: string;
      projectType: ProjectType;
      platform: string;
      gameVersion: string;
      versionNumber: string;
      originalFilename: string;
      expected: string;
    }>([
      {
        description: 'canonical §8.1 mod example',
        title: 'Better Third Person',
        projectType: 'mod',
        platform: 'forge',
        gameVersion: '1.20',
        versionNumber: '1.9.0',
        originalFilename: 'BetterThirdPerson-Forge-1.20-1.9.0.jar',
        expected: 'BetterThirdPerson-Forge-1.20-1.9.0.jar',
      },
      {
        description: 'NeoForge mod with plus metadata in version number',
        title: 'Sodium',
        projectType: 'mod',
        platform: 'neoforge',
        gameVersion: '1.21.1',
        versionNumber: '0.6.0+mc1.21.1',
        originalFilename: 'sodium-neoforge-0.6.0+mc1.21.1.jar',
        expected: 'Sodium-NeoForge-1.21.1-0.6.0+mc1.21.1.jar',
      },
      {
        description: 'Paper plugin includes platform',
        title: 'WorldEdit',
        projectType: 'plugin',
        platform: 'paper',
        gameVersion: '1.20.4',
        versionNumber: '7.3.0',
        originalFilename: 'worldedit-bukkit-7.3.0.jar',
        expected: 'WorldEdit-Paper-1.20.4-7.3.0.jar',
      },
      {
        description: 'resourcepack omits platform (§8.1)',
        title: 'Fresh Animations',
        projectType: 'resourcepack',
        platform: 'fabric',
        gameVersion: '1.20.1',
        versionNumber: '1.9.2',
        originalFilename: 'FreshAnimations_v1.9.2.zip',
        expected: 'FreshAnimations-1.20.1-1.9.2.zip',
      },
      {
        description: 'shader omits platform (§8.1)',
        title: 'Complementary Reimagined',
        projectType: 'shader',
        platform: 'iris',
        gameVersion: '1.20.1',
        versionNumber: 'r5.2.1',
        originalFilename: 'ComplementaryReimagined_r5.2.1.zip',
        expected: 'ComplementaryReimagined-1.20.1-r5.2.1.zip',
      },
      {
        description: 'datapack omits platform and sanitizes forbidden characters in versionNumber',
        title: 'Terralith',
        projectType: 'datapack',
        platform: 'fabric',
        gameVersion: '1.20.1',
        versionNumber: '2.5.4 / build:1',
        originalFilename: 'Terralith_1.20_v2.5.4.zip',
        expected: 'Terralith-1.20.1-2.5.4---build-1.zip',
      },
    ])('$description', (testCase) => {
      expect(formatFilename(testCase)).toBe(testCase.expected);

      const entryResult = formatEntryFilename(
        {
          project: {
            id: 'proj-1',
            slug: 'proj-slug',
            title: testCase.title,
            type: testCase.projectType,
            modrinthUrl: 'https://modrinth.com/project/proj-slug',
          },
        },
        {
          versionNumber: testCase.versionNumber,
          file: {
            filename: testCase.originalFilename,
            url: 'https://cdn.modrinth.com/file',
            size: 1024,
            sha1: 'abc',
            sha512: 'def',
          },
        },
        {
          gameVersion: testCase.gameVersion,
          platform: testCase.platform,
        },
      );
      expect(entryResult).toBe(testCase.expected);
    });
  });

  describe('resolveUniqueFilename', () => {
    it('appends -2, -3, ... before the extension on collision within a folder', () => {
      const used = new Set<string>();
      const base = 'Sodium-Fabric-1.20.1-0.5.8.jar';

      expect(resolveUniqueFilename(base, used)).toBe('Sodium-Fabric-1.20.1-0.5.8.jar');
      expect(resolveUniqueFilename(base, used)).toBe('Sodium-Fabric-1.20.1-0.5.8-2.jar');
      expect(resolveUniqueFilename(base, used)).toBe('Sodium-Fabric-1.20.1-0.5.8-3.jar');
    });

    it('handles files without an extension when deduplicating', () => {
      const used = new Set<string>();
      const base = 'CustomFile-1.20.1-1.0';

      expect(resolveUniqueFilename(base, used)).toBe('CustomFile-1.20.1-1.0');
      expect(resolveUniqueFilename(base, used)).toBe('CustomFile-1.20.1-1.0-2');
    });

    it('skips already-taken suffixed names', () => {
      const used = new Set<string>(['Mod-Fabric-1.20.1-1.0.jar', 'Mod-Fabric-1.20.1-1.0-2.jar']);
      expect(resolveUniqueFilename('Mod-Fabric-1.20.1-1.0.jar', used)).toBe(
        'Mod-Fabric-1.20.1-1.0-3.jar',
      );
    });
  });
});
