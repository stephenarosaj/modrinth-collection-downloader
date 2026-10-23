import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createArchiveWriter, JsZipArchiveWriter } from '../../src/adapters/zip';

describe('JsZipArchiveWriter', () => {
  it('writes string and binary files in nested paths and generates a readable zip Blob', async () => {
    const writer = createArchiveWriter();
    expect(writer).toBeInstanceOf(JsZipArchiveWriter);

    const archive = writer.create();

    const indexJson = JSON.stringify(
      {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'Test Pack',
      },
      null,
      2,
    );
    const jarBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xde, 0xad, 0xbe, 0xef]);
    const resourcePackBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);

    archive.addFile('modrinth.index.json', indexJson);
    archive.addFile('mods/Sodium-Fabric-1.20.1-0.5.8.jar', jarBytes);
    // Leading slash should be normalized cleanly
    archive.addFile('/resourcepacks/FreshAnimations.zip', resourcePackBytes);

    const blob = await archive.generate();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);

    const loadedZip = await JSZip.loadAsync(await blob.arrayBuffer());

    const indexEntry = loadedZip.file('modrinth.index.json');
    expect(indexEntry).not.toBeNull();
    expect(await indexEntry!.async('string')).toBe(indexJson);

    const modEntry = loadedZip.file('mods/Sodium-Fabric-1.20.1-0.5.8.jar');
    expect(modEntry).not.toBeNull();
    const extractedModBytes = await modEntry!.async('uint8array');
    expect(Array.from(extractedModBytes)).toEqual(Array.from(jarBytes));

    const rpEntry = loadedZip.file('resourcepacks/FreshAnimations.zip');
    expect(rpEntry).not.toBeNull();
    const extractedRpBytes = await rpEntry!.async('uint8array');
    expect(Array.from(extractedRpBytes)).toEqual(Array.from(resourcePackBytes));
  });

  it('invokes onProgress callback during archive generation and finishes at 100%', async () => {
    const writer = createArchiveWriter();
    const archive = writer.create();

    archive.addFile('mods/ModA.jar', new Uint8Array(1024).fill(0x41));
    archive.addFile('mods/ModB.jar', new Uint8Array(2048).fill(0x42));

    const progressUpdates: number[] = [];
    const onProgress = vi.fn((pct: number) => {
      progressUpdates.push(pct);
    });

    await archive.generate({ onProgress });

    expect(onProgress).toHaveBeenCalled();
    expect(progressUpdates.length).toBeGreaterThan(0);
    for (const pct of progressUpdates) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
  });

  it('creates isolated archive instances and rejects empty file paths', async () => {
    const writer = createArchiveWriter();
    const archiveA = writer.create();
    const archiveB = writer.create();

    archiveA.addFile('mods/OnlyInA.jar', new Uint8Array([1, 2]));
    archiveB.addFile('mods/OnlyInB.jar', new Uint8Array([3, 4]));

    expect(() => archiveA.addFile('/', 'invalid')).toThrow(/must not be empty/i);

    const zipA = await JSZip.loadAsync(await (await archiveA.generate()).arrayBuffer());
    const zipB = await JSZip.loadAsync(await (await archiveB.generate()).arrayBuffer());

    expect(zipA.file('mods/OnlyInA.jar')).not.toBeNull();
    expect(zipA.file('mods/OnlyInB.jar')).toBeNull();
    expect(zipB.file('mods/OnlyInB.jar')).not.toBeNull();
    expect(zipB.file('mods/OnlyInA.jar')).toBeNull();
  });
});
