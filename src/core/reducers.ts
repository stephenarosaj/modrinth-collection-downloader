/**
 * Pure selection reducers and helpers.
 */

import {
  ENVIRONMENTS,
  isSelectable,
  type Action,
  type Change,
  type Entry,
  type EnvironmentId,
  type EnvironmentState,
  type Instance,
  type ProjectType,
  type ReducerResult,
  type Selection,
} from './model';
import { applyInitialSelection, recomputeDependencyClosure } from './resolver';

/** Checkbox tri-state for table header controls. */
export type HeaderTriState = 'checked' | 'indeterminate' | 'unchecked';

function cloneSelection(selection: Selection): Selection {
  return { on: selection.on, source: selection.source };
}

function cloneEnvironmentState(state: EnvironmentState): EnvironmentState {
  return {
    support: state.support,
    candidates: [...state.candidates],
    version: state.version,
    resolution: state.resolution,
    dependencies: [...state.dependencies],
    requiredBy: [...state.requiredBy],
    selection: cloneSelection(state.selection),
  };
}

function cloneEntries(entries: readonly Entry[]): Entry[] {
  return entries.map((entry) => ({
    project: { ...entry.project },
    origin: entry.origin,
    environments: {
      client: cloneEnvironmentState(entry.environments.client),
      server: cloneEnvironmentState(entry.environments.server),
    },
  }));
}

function cloneInstanceWithEntries(instance: Instance, entries: Entry[]): Instance {
  return {
    ...instance,
    entries,
  };
}

function isExplicitlyUserOff(selection: Selection): boolean {
  return !selection.on && selection.source === 'user';
}

/**
 * Traverses transitive required dependencies in `env` starting from `seedProjectIds`,
 * auto-selecting selectable dependencies that are not explicitly turned off by the user (`off/user`).
 */
function autoSelectDependenciesFromSeeds(
  entries: Entry[],
  env: EnvironmentId,
  seedProjectIds: readonly string[],
  changes: Change[],
): void {
  const entryById = new Map<string, Entry>();
  for (const entry of entries) {
    entryById.set(entry.project.id, entry);
  }

  const visited = new Set<string>();
  const changedIds = new Set<string>(changes.map((c) => c.projectId));
  const queue: string[] = [];

  for (const seedId of seedProjectIds) {
    if (!visited.has(seedId)) {
      visited.add(seedId);
      queue.push(seedId);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) {
      break;
    }
    const currentEntry = entryById.get(currentId);
    if (!currentEntry) {
      continue;
    }

    const currentState = currentEntry.environments[env];
    for (const depId of currentState.dependencies) {
      const depEntry = entryById.get(depId);
      if (!depEntry) {
        continue;
      }
      const depState = depEntry.environments[env];

      if (isSelectable(depState) && !isExplicitlyUserOff(depState.selection)) {
        if (!depState.selection.on) {
          depState.selection = { on: true, source: 'auto' };
          if (!changedIds.has(depId)) {
            changedIds.add(depId);
            changes.push({
              projectId: depId,
              env,
              on: true,
              reason: 'auto-selected',
            });
          }
        }
      }

      if (depState.selection.on && !visited.has(depId)) {
        visited.add(depId);
        queue.push(depId);
      }
    }
  }
}

/**
 * Finds all entries in `env` that are transitively required by at least one
 * non-auto selected entry (`selection.on === true && selection.source !== 'auto'`),
 * traversing only through currently selected (`selection.on === true`) entries.
 * Any entry with `selection.on === true && selection.source === 'auto'` not in this set
 * is transitioned to `{ on: false, source: 'auto' }` and added to `changes`.
 */
function autoDeselectOrphanedDependencies(
  entries: Entry[],
  env: EnvironmentId,
  changes: Change[],
): void {
  const entryById = new Map<string, Entry>();
  for (const entry of entries) {
    entryById.set(entry.project.id, entry);
  }

  const requiredBySelected = new Set<string>();
  const visitedSelected = new Set<string>();
  const queue: string[] = [];

  for (const entry of entries) {
    const state = entry.environments[env];
    if (state.selection.on && state.selection.source !== 'auto') {
      visitedSelected.add(entry.project.id);
      queue.push(entry.project.id);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) {
      break;
    }
    const currentEntry = entryById.get(currentId);
    if (!currentEntry) {
      continue;
    }

    const currentState = currentEntry.environments[env];
    for (const depId of currentState.dependencies) {
      requiredBySelected.add(depId);
      const depEntry = entryById.get(depId);
      if (!depEntry) {
        continue;
      }
      if (depEntry.environments[env].selection.on && !visitedSelected.has(depId)) {
        visitedSelected.add(depId);
        queue.push(depId);
      }
    }
  }

  for (const entry of entries) {
    const state = entry.environments[env];
    if (
      state.selection.on &&
      state.selection.source === 'auto' &&
      !requiredBySelected.has(entry.project.id)
    ) {
      state.selection = { on: false, source: 'auto' };
      changes.push({
        projectId: entry.project.id,
        env,
        on: false,
        reason: 'auto-deselected',
      });
    }
  }
}

/**
 * Computes the default initial selection state:
 * - Every collection entry is `{ on: true, source: 'user' }` in every environment where it is selectable,
 *   or `{ on: false, source: 'none' }` where not selectable.
 * - Every dependency entry is `{ on: true, source: 'auto' }` in an environment iff it is selectable there
 *   and transitively required by a selected entry's chosen version in that environment; otherwise `{ on: false, source: 'none' }`.
 */
export function computeInitialSelection(instance: Instance): Instance;
export function computeInitialSelection(entries: readonly Entry[]): Entry[];
export function computeInitialSelection(input: Instance | readonly Entry[]): Instance | Entry[] {
  if (Array.isArray(input)) {
    return applyInitialSelection(input);
  }
  const inst = input as Instance;
  return cloneInstanceWithEntries(inst, applyInitialSelection(inst.entries));
}

/**
 * Pure reducer applying selection and version override actions to an Instance.
 */
export function reduceInstance(instance: Instance, action: Action): ReducerResult {
  switch (action.type) {
    case 'select': {
      const targetIndex = instance.entries.findIndex((e) => e.project.id === action.projectId);
      if (targetIndex === -1) {
        return { instance, changes: [] };
      }
      const targetOrig = instance.entries[targetIndex];
      if (!targetOrig || !isSelectable(targetOrig.environments[action.env])) {
        return { instance, changes: [] };
      }

      const entries = cloneEntries(instance.entries);
      const target = entries[targetIndex];
      if (!target) {
        return { instance, changes: [] };
      }

      target.environments[action.env].selection = { on: true, source: 'user' };
      const changes: Change[] = [];
      autoSelectDependenciesFromSeeds(entries, action.env, [action.projectId], changes);

      return {
        instance: cloneInstanceWithEntries(instance, entries),
        changes,
      };
    }

    case 'deselect': {
      const targetIndex = instance.entries.findIndex((e) => e.project.id === action.projectId);
      if (targetIndex === -1) {
        return { instance, changes: [] };
      }
      const targetOrig = instance.entries[targetIndex];
      if (!targetOrig) {
        return { instance, changes: [] };
      }
      const origState = targetOrig.environments[action.env];
      if (!isSelectable(origState) && !origState.selection.on) {
        return { instance, changes: [] };
      }

      const entries = cloneEntries(instance.entries);
      const target = entries[targetIndex];
      if (!target) {
        return { instance, changes: [] };
      }

      target.environments[action.env].selection = { on: false, source: 'user' };
      const changes: Change[] = [];
      autoDeselectOrphanedDependencies(entries, action.env, changes);

      return {
        instance: cloneInstanceWithEntries(instance, entries),
        changes,
      };
    }

    case 'select-all': {
      const entries = cloneEntries(instance.entries);
      const seedIds: string[] = [];

      for (const entry of entries) {
        if (entry.origin === 'collection' && entry.project.type === action.projectType) {
          const state = entry.environments[action.env];
          if (isSelectable(state)) {
            state.selection = { on: true, source: 'user' };
            seedIds.push(entry.project.id);
          }
        }
      }

      if (seedIds.length === 0) {
        return { instance, changes: [] };
      }

      const changes: Change[] = [];
      autoSelectDependenciesFromSeeds(entries, action.env, seedIds, changes);

      return {
        instance: cloneInstanceWithEntries(instance, entries),
        changes,
      };
    }

    case 'deselect-all': {
      const entries = cloneEntries(instance.entries);
      let anyMatched = false;

      for (const entry of entries) {
        if (entry.origin === 'collection' && entry.project.type === action.projectType) {
          const state = entry.environments[action.env];
          if (isSelectable(state)) {
            state.selection = { on: false, source: 'user' };
            anyMatched = true;
          }
        }
      }

      if (!anyMatched) {
        return { instance, changes: [] };
      }

      const changes: Change[] = [];
      autoDeselectOrphanedDependencies(entries, action.env, changes);

      return {
        instance: cloneInstanceWithEntries(instance, entries),
        changes,
      };
    }

    case 'set-version': {
      return recomputeDependencyClosure(instance, {
        projectId: action.projectId,
        env: action.env,
        versionId: action.versionId,
      });
    }

    case 'reset-selection': {
      return {
        instance: computeInitialSelection(instance),
        changes: [],
      };
    }
  }
}

/** Selects an entry in an environment as a user action, auto-selecting required dependencies. */
export function selectEntry(
  instance: Instance,
  projectId: string,
  env: EnvironmentId,
): ReducerResult {
  return reduceInstance(instance, { type: 'select', projectId, env });
}

/** Deselects an entry in an environment as a user action, auto-deselecting orphaned dependencies. */
export function deselectEntry(
  instance: Instance,
  projectId: string,
  env: EnvironmentId,
): ReducerResult {
  return reduceInstance(instance, { type: 'deselect', projectId, env });
}

/** Selects all selectable collection entries in a project type table for an environment. */
export function selectAllInTable(
  instance: Instance,
  projectType: ProjectType,
  env: EnvironmentId,
): ReducerResult {
  return reduceInstance(instance, { type: 'select-all', projectType, env });
}

/** Deselects all selectable collection entries in a project type table for an environment. */
export function deselectAllInTable(
  instance: Instance,
  projectType: ProjectType,
  env: EnvironmentId,
): ReducerResult {
  return reduceInstance(instance, { type: 'deselect-all', projectType, env });
}

/** Overrides an entry's chosen version candidate in an environment. */
export function setEntryVersion(
  instance: Instance,
  projectId: string,
  env: EnvironmentId,
  versionId: string,
): ReducerResult {
  return reduceInstance(instance, { type: 'set-version', projectId, env, versionId });
}

/** Resets all entry selections in the instance back to default initial selection. */
export function resetInstanceSelection(instance: Instance): ReducerResult {
  return reduceInstance(instance, { type: 'reset-selection' });
}

/**
 * Computes the header select-all tri-state from a sequence of environment states.
 * Inspects selectable states only.
 */
export function computeHeaderTriState(
  states: Iterable<Pick<EnvironmentState, 'support' | 'version' | 'selection'>>,
): HeaderTriState {
  let selectableCount = 0;
  let selectedCount = 0;
  for (const state of states) {
    if (isSelectable(state)) {
      selectableCount += 1;
      if (state.selection.on) {
        selectedCount += 1;
      }
    }
  }

  if (selectableCount === 0 || selectedCount === 0) {
    return 'unchecked';
  }
  if (selectedCount === selectableCount) {
    return 'checked';
  }
  return 'indeterminate';
}

/**
 * Computes the header select-all tri-state for a project type table in `env`.
 * Inspects selectable collection rows only.
 */
export function getHeaderTriState(
  instance: Instance,
  projectType: ProjectType,
  env: EnvironmentId,
): HeaderTriState {
  const collectionStates = instance.entries
    .filter((entry) => entry.origin === 'collection' && entry.project.type === projectType)
    .map((entry) => entry.environments[env]);

  return computeHeaderTriState(collectionStates);
}

/**
 * Returns true if any entry's selection (`on` or `source`)
 * differs from the default initial selection state.
 */
export function hasSelectionChangedFromDefault(instance: Instance): boolean {
  const defaultInstance = computeInitialSelection(instance);

  for (let i = 0; i < instance.entries.length; i += 1) {
    const currentEntry = instance.entries[i];
    const defaultEntry = defaultInstance.entries[i];
    if (!currentEntry || !defaultEntry) {
      continue;
    }

    for (const env of ENVIRONMENTS) {
      const currentState = currentEntry.environments[env];
      const defaultState = defaultEntry.environments[env];

      if (
        currentState.selection.on !== defaultState.selection.on ||
        currentState.selection.source !== defaultState.selection.source
      ) {
        return true;
      }
    }
  }

  return false;
}
