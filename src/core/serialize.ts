/**
 * Deterministic serialization, deserialization, and JSON Schema validation for Instance.
 */

import {
  CORE_SCHEMA_VERSION,
  DEPENDENCY_TYPES,
  ENVIRONMENTS,
  PROJECT_TYPES,
  RELEASE_PREFERENCES,
  RESOLUTIONS,
  SUPPORTS,
  VERSION_TYPES,
  type Entry,
  type EnvironmentState,
  type FileRef,
  type Instance,
  type Selection,
  type SelectionSource,
  type VersionDependency,
  type VersionRef,
} from './model';

const SELECTION_SOURCES: readonly SelectionSource[] = ['none', 'user', 'auto'] as const;
const ENTRY_ORIGINS = ['collection', 'dependency'] as const;

/**
 * ISO-8601 date-time pattern matching `format: "date-time"` in JSON Schema Draft 2020-12.
 * Requires `YYYY-MM-DDTHH:mm:ss` (with optional fractional seconds) and timezone (`Z` or `±HH:MM`).
 */
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1;
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_TIME_RE.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function checkObjectKeys(
  obj: Record<string, unknown>,
  path: string,
  requiredKeys: readonly string[],
  allowedKeys: readonly string[],
  errors: string[],
): void {
  for (const reqKey of requiredKeys) {
    if (!(reqKey in obj) || obj[reqKey] === undefined) {
      errors.push(`${path}: missing required property "${reqKey}"`);
    }
  }

  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined && !requiredKeys.includes(key)) {
      continue;
    }
    if (!allowedKeys.includes(key)) {
      errors.push(`${path}: unexpected additional property "${key}"`);
    }
  }
}

function validateFileRef(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }

  const keys = ['filename', 'url', 'size', 'sha1', 'sha512'] as const;
  checkObjectKeys(value, path, keys, keys, errors);

  if (!isNonEmptyString(value.filename)) {
    errors.push(`${path}.filename: expected a non-empty string`);
  }
  if (!isNonEmptyString(value.url)) {
    errors.push(`${path}.url: expected a non-empty string`);
  }
  if (typeof value.size !== 'number' || !Number.isInteger(value.size) || value.size < 0) {
    errors.push(`${path}.size: expected a non-negative integer`);
  }
  if (typeof value.sha1 !== 'string') {
    errors.push(`${path}.sha1: expected a string`);
  }
  if (typeof value.sha512 !== 'string') {
    errors.push(`${path}.sha512: expected a string`);
  }
}

function validateDependencyRef(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }

  checkObjectKeys(value, path, ['projectId', 'type'], ['projectId', 'versionId', 'type'], errors);

  if (!isNonEmptyString(value.projectId)) {
    errors.push(`${path}.projectId: expected a non-empty string`);
  }
  if (value.versionId !== undefined && !isNonEmptyString(value.versionId)) {
    errors.push(`${path}.versionId: expected a non-empty string when present`);
  }
  if (
    typeof value.type !== 'string' ||
    !(DEPENDENCY_TYPES as readonly string[]).includes(value.type)
  ) {
    errors.push(
      `${path}.type: expected one of ${DEPENDENCY_TYPES.join(', ')} (got ${String(value.type)})`,
    );
  }
}

function validateVersionRef(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }

  const keys = [
    'id',
    'versionNumber',
    'versionType',
    'publishedAt',
    'gameVersions',
    'platforms',
    'file',
    'dependencies',
  ] as const;
  checkObjectKeys(value, path, keys, keys, errors);

  if (!isNonEmptyString(value.id)) {
    errors.push(`${path}.id: expected a non-empty string`);
  }
  if (!isNonEmptyString(value.versionNumber)) {
    errors.push(`${path}.versionNumber: expected a non-empty string`);
  }
  if (
    typeof value.versionType !== 'string' ||
    !(VERSION_TYPES as readonly string[]).includes(value.versionType)
  ) {
    errors.push(
      `${path}.versionType: expected one of ${VERSION_TYPES.join(', ')} (got ${String(value.versionType)})`,
    );
  }
  if (typeof value.publishedAt !== 'string') {
    errors.push(`${path}.publishedAt: expected a string`);
  }

  if (!Array.isArray(value.gameVersions)) {
    errors.push(`${path}.gameVersions: expected an array of strings`);
  } else {
    value.gameVersions.forEach((gv, idx) => {
      if (typeof gv !== 'string') {
        errors.push(`${path}.gameVersions[${idx}]: expected a string`);
      }
    });
  }

  if (!Array.isArray(value.platforms)) {
    errors.push(`${path}.platforms: expected an array of strings`);
  } else {
    value.platforms.forEach((p, idx) => {
      if (typeof p !== 'string') {
        errors.push(`${path}.platforms[${idx}]: expected a string`);
      }
    });
  }

  validateFileRef(value.file, `${path}.file`, errors);

  if (!Array.isArray(value.dependencies)) {
    errors.push(`${path}.dependencies: expected an array`);
  } else {
    value.dependencies.forEach((dep, idx) => {
      validateDependencyRef(dep, `${path}.dependencies[${idx}]`, errors);
    });
  }
}

function validateSelection(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }

  const keys = ['on', 'source'] as const;
  checkObjectKeys(value, path, keys, keys, errors);

  if (typeof value.on !== 'boolean') {
    errors.push(`${path}.on: expected a boolean`);
  }
  if (
    typeof value.source !== 'string' ||
    !(SELECTION_SOURCES as readonly string[]).includes(value.source)
  ) {
    errors.push(
      `${path}.source: expected one of ${SELECTION_SOURCES.join(', ')} (got ${String(value.source)})`,
    );
  }
}

function validateEnvironmentState(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }

  const keys = [
    'support',
    'candidates',
    'version',
    'resolution',
    'dependencies',
    'requiredBy',
    'selection',
  ] as const;
  checkObjectKeys(value, path, keys, keys, errors);

  if (
    typeof value.support !== 'string' ||
    !(SUPPORTS as readonly string[]).includes(value.support)
  ) {
    errors.push(
      `${path}.support: expected one of ${SUPPORTS.join(', ')} (got ${String(value.support)})`,
    );
  }

  if (!Array.isArray(value.candidates)) {
    errors.push(`${path}.candidates: expected an array`);
  } else {
    value.candidates.forEach((cand, idx) => {
      validateVersionRef(cand, `${path}.candidates[${idx}]`, errors);
    });
  }

  if (value.version !== null) {
    validateVersionRef(value.version, `${path}.version`, errors);
  }

  if (
    typeof value.resolution !== 'string' ||
    !(RESOLUTIONS as readonly string[]).includes(value.resolution)
  ) {
    errors.push(
      `${path}.resolution: expected one of ${RESOLUTIONS.join(', ')} (got ${String(value.resolution)})`,
    );
  }

  if (!Array.isArray(value.dependencies)) {
    errors.push(`${path}.dependencies: expected an array of strings`);
  } else {
    value.dependencies.forEach((dep, idx) => {
      if (typeof dep !== 'string') {
        errors.push(`${path}.dependencies[${idx}]: expected a string`);
      }
    });
  }

  if (!Array.isArray(value.requiredBy)) {
    errors.push(`${path}.requiredBy: expected an array of strings`);
  } else {
    value.requiredBy.forEach((req, idx) => {
      if (typeof req !== 'string') {
        errors.push(`${path}.requiredBy[${idx}]: expected a string`);
      }
    });
  }

  validateSelection(value.selection, `${path}.selection`, errors);
}

function validateEntry(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }

  const entryKeys = ['project', 'origin', 'environments'] as const;
  checkObjectKeys(value, path, entryKeys, entryKeys, errors);

  if (!isPlainObject(value.project)) {
    errors.push(`${path}.project: expected an object`);
  } else {
    const projectKeys = ['id', 'slug', 'title', 'type', 'modrinthUrl'] as const;
    checkObjectKeys(value.project, `${path}.project`, projectKeys, projectKeys, errors);

    if (!isNonEmptyString(value.project.id)) {
      errors.push(`${path}.project.id: expected a non-empty string`);
    }
    if (!isNonEmptyString(value.project.slug)) {
      errors.push(`${path}.project.slug: expected a non-empty string`);
    }
    if (!isNonEmptyString(value.project.title)) {
      errors.push(`${path}.project.title: expected a non-empty string`);
    }
    if (
      typeof value.project.type !== 'string' ||
      !(PROJECT_TYPES as readonly string[]).includes(value.project.type)
    ) {
      errors.push(
        `${path}.project.type: expected one of ${PROJECT_TYPES.join(', ')} (got ${String(value.project.type)})`,
      );
    }
    if (!isNonEmptyString(value.project.modrinthUrl)) {
      errors.push(`${path}.project.modrinthUrl: expected a non-empty string`);
    }
  }

  if (
    typeof value.origin !== 'string' ||
    !(ENTRY_ORIGINS as readonly string[]).includes(value.origin)
  ) {
    errors.push(
      `${path}.origin: expected one of ${ENTRY_ORIGINS.join(', ')} (got ${String(value.origin)})`,
    );
  }

  if (!isPlainObject(value.environments)) {
    errors.push(`${path}.environments: expected an object`);
  } else {
    checkObjectKeys(value.environments, `${path}.environments`, ENVIRONMENTS, ENVIRONMENTS, errors);
    validateEnvironmentState(value.environments.client, `${path}.environments.client`, errors);
    validateEnvironmentState(value.environments.server, `${path}.environments.server`, errors);
  }
}

/**
 * Validates an unknown value against `schema/instance.schema.json`.
 * Returns `{ valid: true, errors: [] }` when valid, or `{ valid: false, errors }` with detailed paths.
 */
export function validateInstanceSchema(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isPlainObject(data)) {
    return { valid: false, errors: ['$: expected root value to be an object'] };
  }

  const rootKeys = ['schemaVersion', 'meta', 'entries'] as const;
  checkObjectKeys(data, '$', rootKeys, rootKeys, errors);

  if ('schemaVersion' in data && data.schemaVersion !== undefined) {
    if (data.schemaVersion !== CORE_SCHEMA_VERSION) {
      errors.push(
        `$.schemaVersion: unsupported schemaVersion "${String(data.schemaVersion)}" (expected ${CORE_SCHEMA_VERSION})`,
      );
    }
  }

  if (!isPlainObject(data.meta)) {
    errors.push('$.meta: expected an object');
  } else {
    const metaKeys = ['name', 'source', 'target', 'createdAt'] as const;
    checkObjectKeys(data.meta, '$.meta', metaKeys, metaKeys, errors);

    if (!isNonEmptyString(data.meta.name)) {
      errors.push('$.meta.name: expected a non-empty string');
    }

    if (!isPlainObject(data.meta.source)) {
      errors.push('$.meta.source: expected an object');
    } else {
      const sourceKeys = ['collectionId', 'url'] as const;
      checkObjectKeys(data.meta.source, '$.meta.source', sourceKeys, sourceKeys, errors);
      if (!isNonEmptyString(data.meta.source.collectionId)) {
        errors.push('$.meta.source.collectionId: expected a non-empty string');
      }
      if (!isNonEmptyString(data.meta.source.url)) {
        errors.push('$.meta.source.url: expected a non-empty string');
      }
    }

    if (!isPlainObject(data.meta.target)) {
      errors.push('$.meta.target: expected an object');
    } else {
      const targetKeys = ['gameVersion', 'platform', 'releasePreference'] as const;
      checkObjectKeys(data.meta.target, '$.meta.target', targetKeys, targetKeys, errors);
      if (!isNonEmptyString(data.meta.target.gameVersion)) {
        errors.push('$.meta.target.gameVersion: expected a non-empty string');
      }
      if (!isNonEmptyString(data.meta.target.platform)) {
        errors.push('$.meta.target.platform: expected a non-empty string');
      }
      if (
        typeof data.meta.target.releasePreference !== 'string' ||
        !(RELEASE_PREFERENCES as readonly string[]).includes(data.meta.target.releasePreference)
      ) {
        errors.push(
          `$.meta.target.releasePreference: expected one of ${RELEASE_PREFERENCES.join(', ')} (got ${String(data.meta.target.releasePreference)})`,
        );
      }
    }

    if (!isIsoDateTime(data.meta.createdAt)) {
      errors.push('$.meta.createdAt: expected an ISO-8601 date-time string');
    }
  }

  if (!Array.isArray(data.entries)) {
    errors.push('$.entries: expected an array');
  } else {
    data.entries.forEach((entry, idx) => {
      validateEntry(entry, `$.entries[${idx}]`, errors);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function canonicalizeFileRef(file: FileRef): FileRef {
  return {
    filename: file.filename,
    url: file.url,
    size: file.size,
    sha1: file.sha1,
    sha512: file.sha512,
  };
}

function canonicalizeDependencyRef(dep: VersionDependency): VersionDependency {
  const result: VersionDependency = {
    projectId: dep.projectId,
    ...(dep.versionId !== undefined ? { versionId: dep.versionId } : {}),
    type: dep.type,
  };
  return result;
}

function canonicalizeVersionRef(version: VersionRef): VersionRef {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    versionType: version.versionType,
    publishedAt: version.publishedAt,
    gameVersions: [...version.gameVersions],
    platforms: [...version.platforms],
    file: canonicalizeFileRef(version.file),
    dependencies: version.dependencies.map(canonicalizeDependencyRef),
  };
}

function canonicalizeSelection(selection: Selection): Selection {
  return {
    on: selection.on,
    source: selection.source,
  };
}

function canonicalizeEnvironmentState(state: EnvironmentState): EnvironmentState {
  return {
    support: state.support,
    candidates: state.candidates.map(canonicalizeVersionRef),
    version: state.version ? canonicalizeVersionRef(state.version) : null,
    resolution: state.resolution,
    dependencies: [...state.dependencies],
    requiredBy: [...state.requiredBy],
    selection: canonicalizeSelection(state.selection),
  };
}

function canonicalizeEntry(entry: Entry): Entry {
  return {
    project: {
      id: entry.project.id,
      slug: entry.project.slug,
      title: entry.project.title,
      type: entry.project.type,
      modrinthUrl: entry.project.modrinthUrl,
    },
    origin: entry.origin,
    environments: {
      client: canonicalizeEnvironmentState(entry.environments.client),
      server: canonicalizeEnvironmentState(entry.environments.server),
    },
  };
}

function canonicalizeInstance(instance: Instance): Instance {
  return {
    schemaVersion: CORE_SCHEMA_VERSION,
    meta: {
      name: instance.meta.name,
      source: {
        collectionId: instance.meta.source.collectionId,
        url: instance.meta.source.url,
      },
      target: {
        gameVersion: instance.meta.target.gameVersion,
        platform: instance.meta.target.platform,
        releasePreference: instance.meta.target.releasePreference,
      },
      createdAt: instance.meta.createdAt,
    },
    entries: instance.entries.map(canonicalizeEntry),
  };
}

/**
 * Serializes an `Instance` to pretty-printed JSON with a stable, deterministic key order.
 * Validates against `schema/instance.schema.json` before serializing.
 */
export function serialize(instance: Instance): string {
  const validation = validateInstanceSchema(instance);
  if (!validation.valid) {
    throw new Error(`Invalid Instance cannot be serialized:\n${validation.errors.join('\n')}`);
  }

  const canonical = canonicalizeInstance(instance);
  return JSON.stringify(canonical, null, 2);
}

/**
 * Deserializes a JSON string into a validated `Instance`.
 * Throws a descriptive `Error` on malformed JSON, unknown `schemaVersion`, or schema violations.
 */
export function deserialize(json: string): Instance {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in instance payload: ${message}`);
  }

  if (
    isPlainObject(parsed) &&
    'schemaVersion' in parsed &&
    parsed.schemaVersion !== undefined &&
    parsed.schemaVersion !== CORE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported schemaVersion "${String(parsed.schemaVersion)}": only schemaVersion ${CORE_SCHEMA_VERSION} is supported.`,
    );
  }

  const validation = validateInstanceSchema(parsed);
  if (!validation.valid) {
    throw new Error(`Instance schema validation failed:\n${validation.errors.join('\n')}`);
  }

  return canonicalizeInstance(parsed as unknown as Instance);
}
