import { serialize, type Instance } from '../core';

/**
 * Triggers a browser download of a UTF-8 text payload using a temporary object URL.
 */
export function triggerTextDownload(
  filename: string,
  content: string,
  mimeType = 'application/json;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
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
