import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CORE_SCHEMA_VERSION,
  ENVIRONMENTS,
  changeEntryVersion,
  computeEntryStatus,
  deselectAllInTable,
  deselectEntry,
  formatPlatformDisplayName,
  getSkippedEntries,
  hasSelectionChangedFromDefault,
  resolveCollection,
  selectAllInTable,
  selectEntry,
  setEntryVersion,
  toTables,
  type Change,
  type EnvironmentId,
  type ExportableProjectType,
  type Instance,
  type ResolveProgress,
  type SkippedProject,
} from '../core';
import type { ModrinthClient } from '../ports';
import { AutoSelectToast, formatAutoSelectChanges } from './components/AutoSelectToast';
import { ConfirmReResolveDialog } from './components/ConfirmReResolveDialog';
import { EntryTables } from './components/EntryTables';
import { EnvironmentTogglesBar, type ActiveEnvironments } from './components/EnvironmentTogglesBar';
import { ResolveProgressPanel } from './components/ResolveProgressPanel';
import { SkippedSection } from './components/SkippedSection';
import { TargetForm, type TargetFormValues } from './components/TargetForm';
import { exportInstanceJson } from './download';
import { isAbortError } from './utils';

export interface AppProps {
  appName?: string;
  modrinthClient?: ModrinthClient;
  onExportJson?: (filename: string, jsonContent: string) => void;
}

const INITIAL_ACTIVE_ENVIRONMENTS: ActiveEnvironments = {
  client: false,
  server: false,
};

const FLASH_DURATION_MS = 1000;

function mergeSkippedProjects(
  fromResolve: readonly SkippedProject[],
  fromInstance: readonly SkippedProject[],
): SkippedProject[] {
  const seen = new Set<string>();
  const merged: SkippedProject[] = [];
  for (const item of [...fromResolve, ...fromInstance]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function App({
  appName = 'modrinth-collection-downloader',
  modrinthClient,
  onExportJson,
}: AppProps) {
  const [instance, setInstance] = useState<Instance | null>(null);
  const [resolveSkipped, setResolveSkipped] = useState<SkippedProject[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [progress, setProgress] = useState<ResolveProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [activeEnvironments, setActiveEnvironments] = useState<ActiveEnvironments>(
    INITIAL_ACTIVE_ENVIRONMENTS,
  );
  const [flashingCells, setFlashingCells] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingReResolve, setPendingReResolve] = useState<TargetFormValues | null>(null);
  const [revertToken, setRevertToken] = useState(0);

  const instanceRef = useRef<Instance | null>(instance);
  instanceRef.current = instance;
  const abortControllerRef = useRef<AbortController | null>(null);
  const versionAbortControllerRef = useRef<AbortController | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlashTimer = useCallback(() => {
    if (flashTimerRef.current !== null) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  }, []);

  const applyChangesFeedback = useCallback(
    (changes: readonly Change[]) => {
      if (changes.length === 0) {
        return;
      }

      clearFlashTimer();
      const keys = new Set<string>(changes.map((c) => `${c.projectId}:${c.env}`));
      setFlashingCells(keys);
      setToastMessage(formatAutoSelectChanges(changes));

      flashTimerRef.current = setTimeout(() => {
        setFlashingCells(new Set<string>());
        flashTimerRef.current = null;
      }, FLASH_DURATION_MS);
    },
    [clearFlashTimer],
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      versionAbortControllerRef.current?.abort();
      versionAbortControllerRef.current = null;
      clearFlashTimer();
    };
  }, [clearFlashTimer]);

  const handleCancelResolve = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsResolving(false);
    setWasCancelled(true);
  }, []);

  const executeLoadCollection = useCallback(
    async (values: TargetFormValues) => {
      if (!modrinthClient) {
        return;
      }

      abortControllerRef.current?.abort();
      versionAbortControllerRef.current?.abort();
      versionAbortControllerRef.current = null;
      clearFlashTimer();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      instanceRef.current = null;
      setInstance(null);
      setResolveSkipped([]);
      setExportError(null);
      setActiveEnvironments(INITIAL_ACTIVE_ENVIRONMENTS);
      setFlashingCells(new Set<string>());
      setToastMessage(null);
      setPendingReResolve(null);
      setIsRecomputing(false);
      setIsResolving(true);
      setWasCancelled(false);
      setResolveError(null);
      setProgress(null);
      setLogs([]);

      try {
        const result = await resolveCollection(modrinthClient, {
          collectionInput: values.collectionInput,
          gameVersion: values.gameVersion,
          platform: values.platform,
          releasePreference: values.releasePreference,
          signal: controller.signal,
          onProgress: (update) => {
            if (abortControllerRef.current !== controller || controller.signal.aborted) {
              return;
            }
            setProgress(update);
            if (update.message) {
              setLogs((prev) => [...prev, update.message!]);
            }
          },
        });

        if (abortControllerRef.current !== controller || controller.signal.aborted) {
          return;
        }

        abortControllerRef.current = null;
        instanceRef.current = result.instance;
        setInstance(result.instance);
        setResolveSkipped(result.skipped);
        setActiveEnvironments(INITIAL_ACTIVE_ENVIRONMENTS);
        setIsResolving(false);
      } catch (err: unknown) {
        if (abortControllerRef.current !== controller) {
          return;
        }
        abortControllerRef.current = null;
        if (controller.signal.aborted || isAbortError(err)) {
          setIsResolving(false);
          setWasCancelled(true);
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setResolveError(message || 'Failed to resolve collection.');
        setIsResolving(false);
      }
    },
    [modrinthClient, clearFlashTimer],
  );

  const handleRequestLoadOrReResolve = useCallback(
    (values: TargetFormValues) => {
      if (versionAbortControllerRef.current) {
        versionAbortControllerRef.current.abort();
        versionAbortControllerRef.current = null;
        setIsRecomputing(false);
      }
      if (instance && hasSelectionChangedFromDefault(instance)) {
        setPendingReResolve(values);
        return;
      }
      setPendingReResolve(null);
      void executeLoadCollection(values);
    },
    [instance, executeLoadCollection],
  );

  const handleConfirmReResolve = useCallback(() => {
    if (!pendingReResolve) {
      return;
    }
    const targetValues = pendingReResolve;
    setPendingReResolve(null);
    void executeLoadCollection(targetValues);
  }, [pendingReResolve, executeLoadCollection]);

  const handleCancelReResolve = useCallback(() => {
    setPendingReResolve(null);
    setRevertToken((prev) => prev + 1);
  }, []);

  const handleToggleEnvironment = useCallback((env: EnvironmentId, active: boolean) => {
    setActiveEnvironments((prev) => ({
      ...prev,
      [env]: active,
    }));
  }, []);

  const handleToggleEntrySelection = useCallback(
    (projectId: string, env: EnvironmentId, selected: boolean) => {
      const currentInstance = instanceRef.current;
      if (!currentInstance) {
        return;
      }
      const result = selected
        ? selectEntry(currentInstance, projectId, env)
        : deselectEntry(currentInstance, projectId, env);
      instanceRef.current = result.instance;
      setInstance(result.instance);
      applyChangesFeedback(result.changes);
    },
    [applyChangesFeedback],
  );

  const handleToggleSelectAll = useCallback(
    (projectType: ExportableProjectType, env: EnvironmentId, selectAll: boolean) => {
      const currentInstance = instanceRef.current;
      if (!currentInstance) {
        return;
      }
      const result = selectAll
        ? selectAllInTable(currentInstance, projectType, env)
        : deselectAllInTable(currentInstance, projectType, env);
      instanceRef.current = result.instance;
      setInstance(result.instance);
      applyChangesFeedback(result.changes);
    },
    [applyChangesFeedback],
  );

  const handleChangeEntryVersion = useCallback(
    async (projectId: string, env: EnvironmentId, versionId: string) => {
      const currentInstance = instanceRef.current;
      if (!currentInstance) {
        return;
      }

      setExportError(null);

      if (!modrinthClient) {
        const result = setEntryVersion(currentInstance, projectId, env, versionId);
        instanceRef.current = result.instance;
        setInstance(result.instance);
        applyChangesFeedback(result.changes);
        return;
      }

      versionAbortControllerRef.current?.abort();
      const controller = new AbortController();
      versionAbortControllerRef.current = controller;
      setIsRecomputing(true);

      try {
        const result = await changeEntryVersion(currentInstance, modrinthClient, {
          projectId,
          env,
          versionId,
          signal: controller.signal,
        });

        if (versionAbortControllerRef.current !== controller || controller.signal.aborted) {
          return;
        }

        versionAbortControllerRef.current = null;
        setIsRecomputing(false);
        instanceRef.current = result.instance;
        setInstance(result.instance);
        applyChangesFeedback(result.changes);
      } catch (err: unknown) {
        if (versionAbortControllerRef.current !== controller) {
          return;
        }
        versionAbortControllerRef.current = null;
        setIsRecomputing(false);
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setExportError(message || 'Failed to recompute dependency closure.');
      }
    },
    [modrinthClient, applyChangesFeedback],
  );

  const handleExportJson = useCallback(() => {
    if (!instance) {
      return;
    }
    setExportError(null);
    try {
      exportInstanceJson(instance, onExportJson);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExportError(message || 'Failed to export instance.json.');
    }
  }, [instance, onExportJson]);

  const tables = useMemo(() => (instance ? toTables(instance) : []), [instance]);

  const activeEnvironmentIds = useMemo<EnvironmentId[]>(
    () => ENVIRONMENTS.filter((env) => activeEnvironments[env]),
    [activeEnvironments],
  );

  const entryStatuses = useMemo(
    () => (instance ? computeEntryStatus(instance, activeEnvironmentIds) : undefined),
    [instance, activeEnvironmentIds],
  );

  const combinedSkipped = useMemo(() => {
    if (!instance) {
      return resolveSkipped;
    }
    return mergeSkippedProjects(resolveSkipped, getSkippedEntries(instance));
  }, [instance, resolveSkipped]);

  return (
    <div className="app-shell">
      <header>
        <div className="logo">
          <h1>{appName}</h1>
        </div>
        <p>
          Build client &amp; server instances from a Modrinth collection — entirely in your browser
          (schema v{CORE_SCHEMA_VERSION}).
        </p>
      </header>

      <main className="app-main">
        <section className="card target-card" aria-label="Target configuration">
          <TargetForm
            modrinthClient={modrinthClient}
            isResolving={isResolving}
            isDisabled={isRecomputing}
            activeTarget={instance?.meta.target ?? null}
            activeCollectionId={instance?.meta.source.collectionId ?? null}
            revertToken={revertToken}
            onSubmit={handleRequestLoadOrReResolve}
            onTargetChange={handleRequestLoadOrReResolve}
          />
        </section>

        <ResolveProgressPanel
          isResolving={isResolving}
          progress={progress}
          logs={logs}
          error={resolveError}
          wasCancelled={wasCancelled}
          onCancel={handleCancelResolve}
        />

        {instance && (
          <div className="review-workspace">
            <section className="review-header card" aria-label="Collection summary">
              <div className="review-meta">
                <h2>{instance.meta.name}</h2>
                <dl className="meta-badges">
                  <div className="meta-pair">
                    <dt>Collection</dt>
                    <dd>{instance.meta.source.collectionId}</dd>
                  </div>
                  <div className="meta-pair">
                    <dt>Game Version</dt>
                    <dd>{instance.meta.target.gameVersion}</dd>
                  </div>
                  <div className="meta-pair">
                    <dt>Platform</dt>
                    <dd>{formatPlatformDisplayName(instance.meta.target.platform)}</dd>
                  </div>
                  <div className="meta-pair">
                    <dt>Release Preference</dt>
                    <dd>{instance.meta.target.releasePreference}</dd>
                  </div>
                </dl>
              </div>
              <div className="review-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExportJson}
                  disabled={isRecomputing}
                >
                  Export instance.json
                </button>
              </div>
            </section>

            <EnvironmentTogglesBar
              activeEnvironments={activeEnvironments}
              onToggleEnvironment={handleToggleEnvironment}
              disabled={isResolving || isRecomputing}
            />

            <AutoSelectToast message={toastMessage} onDismiss={() => setToastMessage(null)} />

            {exportError && (
              <div className="alert alert-error" role="alert">
                {exportError}
              </div>
            )}

            <EntryTables
              tables={tables}
              instance={instance}
              entryStatuses={entryStatuses}
              targetPlatform={instance.meta.target.platform}
              activeEnvironments={activeEnvironments}
              flashingCells={flashingCells}
              isRecomputing={isRecomputing}
              onToggleEntrySelection={handleToggleEntrySelection}
              onToggleSelectAll={handleToggleSelectAll}
              onChangeEntryVersion={handleChangeEntryVersion}
            />

            <SkippedSection skipped={combinedSkipped} />
          </div>
        )}

        <ConfirmReResolveDialog
          open={pendingReResolve !== null}
          onConfirm={handleConfirmReResolve}
          onCancel={handleCancelReResolve}
        />
      </main>

      <footer>
        <div>
          Based on{' '}
          <a
            href="https://github.com/DanyCDev/modrinth-collection-web-download"
            target="_blank"
            rel="noopener noreferrer"
          >
            DanyCDev/modrinth-collection-web-download
          </a>{' '}
          (live at{' '}
          <a href="https://md.dkg.sk/" target="_blank" rel="noopener noreferrer">
            md.dkg.sk
          </a>
          )
        </div>
        <div>
          Powered by the{' '}
          <a href="https://docs.modrinth.com/" target="_blank" rel="noopener noreferrer">
            Modrinth API
          </a>
          . All downloads happen directly in your browser.
        </div>
      </footer>
    </div>
  );
}
