import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ENVIRONMENTS,
  PROJECT_TYPE_ORDER,
  changeEntryVersion,
  computeEntryStatus,
  deselectAllInTable,
  deselectEntry,
  deserialize,
  formatPlatformDisplayName,
  getHeaderTriState,
  getMrpackWarnings,
  getSkippedEntries,
  hasSelectionChangedFromDefault,
  resolveCollection,
  selectAllInTable,
  selectEntry,
  setEntryVersion,
  toFileTree,
  toMrpack,
  toTables,
  type Change,
  type EnvironmentId,
  type ExportableProjectType,
  type FileTree,
  type Instance,
  type MrpackIndex,
  type ResolveProgress,
  type SkippedProject,
} from '../core';
import type { ArchiveWriter, FileFetcher, ModrinthClient } from '../ports';
import { AutoSelectToast, formatAutoSelectChanges } from './components/AutoSelectToast';
import { ConfirmReResolveDialog } from './components/ConfirmReResolveDialog';
import { EntryTables } from './components/EntryTables';
import type { ActiveEnvironments } from './components/EnvironmentTogglesBar';
import { ExportBar } from './components/ExportBar';
import { ResolveProgressPanel } from './components/ResolveProgressPanel';
import { SkippedSection } from './components/SkippedSection';
import { TargetForm, type TargetFormValues } from './components/TargetForm';
import {
  exportEnvironmentZip,
  exportInstanceJson,
  exportMrpackArchive,
  type ExportEnvironmentZipResult,
  type ZipExportProgress,
} from './download';
import { formatUserFacingError, isAbortError } from './utils';

/** Props for the root {@link App} component. */
export interface AppProps {
  appName?: string;
  modrinthClient?: ModrinthClient;
  fileFetcher?: FileFetcher;
  archiveWriter?: ArchiveWriter;
  onExportJson?: (filename: string, jsonContent: string) => void;
  onExportBlob?: (filename: string, blob: Blob) => void;
}

const INITIAL_ACTIVE_ENVIRONMENTS: ActiveEnvironments = {
  client: false,
  server: false,
};

const EMPTY_FILE_TREES: { client: FileTree; server: FileTree } = {
  client: { environment: 'client', files: [] },
  server: { environment: 'server', files: [] },
};

const EMPTY_MRPACK_PREVIEW: MrpackIndex = {
  formatVersion: 1,
  game: 'minecraft',
  versionId: '1.0.0',
  name: '',
  files: [],
  dependencies: {},
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

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file.'));
    };
    reader.readAsText(file);
  });
}

/**
 * Root React application component.
 *
 * Manages collection target configuration, resolution pipelines, the loaded
 * immutable {@link Instance}, environment toggle (defaulting to off),
 * and export actions for zips, `.mrpack`, and `instance.json`.
 */
export function App({
  appName = 'modrinth-collection-downloader',
  modrinthClient,
  fileFetcher,
  archiveWriter,
  onExportJson,
  onExportBlob,
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
  const [importError, setImportError] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportingEnv, setExportingEnv] = useState<EnvironmentId | null>(null);
  const [zipProgress, setZipProgress] = useState<ZipExportProgress | null>(null);
  const [zipResult, setZipResult] = useState<ExportEnvironmentZipResult | null>(null);
  const [platformVersion, setPlatformVersion] = useState('');

  const [activeEnvironments, setActiveEnvironments] = useState<ActiveEnvironments>(
    INITIAL_ACTIVE_ENVIRONMENTS,
  );
  const [flashingCells, setFlashingCells] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingReResolve, setPendingReResolve] = useState<TargetFormValues | null>(null);
  const [lastSubmittedTarget, setLastSubmittedTarget] = useState<TargetFormValues | null>(null);
  const [revertToken, setRevertToken] = useState(0);

  const instanceRef = useRef<Instance | null>(instance);
  instanceRef.current = instance;
  const abortControllerRef = useRef<AbortController | null>(null);
  const versionAbortControllerRef = useRef<AbortController | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const importAbortControllerRef = useRef<AbortController | null>(null);
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
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
      importAbortControllerRef.current?.abort();
      importAbortControllerRef.current = null;
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

  const handleCancelZipExport = useCallback(() => {
    if (exportAbortControllerRef.current) {
      exportAbortControllerRef.current.abort();
      exportAbortControllerRef.current = null;
    }
    setIsExporting(false);
    setExportingEnv(null);
    setZipProgress(null);
  }, []);

  const executeLoadCollection = useCallback(
    async (values: TargetFormValues) => {
      if (!modrinthClient) {
        return;
      }

      setLastSubmittedTarget(values);
      abortControllerRef.current?.abort();
      versionAbortControllerRef.current?.abort();
      versionAbortControllerRef.current = null;
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
      importAbortControllerRef.current?.abort();
      importAbortControllerRef.current = null;
      clearFlashTimer();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      instanceRef.current = null;
      setInstance(null);
      setResolveSkipped([]);
      setExportError(null);
      setImportError(null);
      setIsExporting(false);
      setExportingEnv(null);
      setZipProgress(null);
      setZipResult(null);
      setPlatformVersion('');
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
        setResolveError(formatUserFacingError(err, 'Failed to resolve collection.'));
        setIsResolving(false);
      }
    },
    [modrinthClient, clearFlashTimer],
  );

  const handleRetryResolve = useCallback(() => {
    if (lastSubmittedTarget) {
      void executeLoadCollection(lastSubmittedTarget);
    }
  }, [lastSubmittedTarget, executeLoadCollection]);

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

  const handleImportFile = useCallback(
    async (file: File) => {
      importAbortControllerRef.current?.abort();
      const importController = new AbortController();
      importAbortControllerRef.current = importController;

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      versionAbortControllerRef.current?.abort();
      versionAbortControllerRef.current = null;
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
      clearFlashTimer();

      setIsResolving(false);
      setIsRecomputing(false);
      setIsExporting(false);
      setExportingEnv(null);
      setZipProgress(null);
      setImportError(null);
      setExportError(null);

      try {
        const text = await readFileText(file);
        if (
          importAbortControllerRef.current !== importController ||
          importController.signal.aborted
        ) {
          return;
        }
        const importedInstance = deserialize(text);
        importAbortControllerRef.current = null;

        instanceRef.current = importedInstance;
        setInstance(importedInstance);
        setResolveSkipped(getSkippedEntries(importedInstance));
        setActiveEnvironments(INITIAL_ACTIVE_ENVIRONMENTS);
        setFlashingCells(new Set<string>());
        setToastMessage(null);
        setPendingReResolve(null);
        setZipResult(null);
        setPlatformVersion('');
        setResolveError(null);
        setWasCancelled(false);
        setProgress(null);
        setLogs([]);
        setRevertToken((prev) => prev + 1);
      } catch (err: unknown) {
        if (
          importAbortControllerRef.current !== importController ||
          importController.signal.aborted ||
          isAbortError(err)
        ) {
          return;
        }
        importAbortControllerRef.current = null;
        setImportError(formatUserFacingError(err, 'Failed to import instance.json.'));
      }
    },
    [clearFlashTimer],
  );

  const handleToggleEnvironment = useCallback((env: EnvironmentId, active: boolean) => {
    setActiveEnvironments((prev) => ({
      ...prev,
      [env]: active,
    }));
    if (active && instanceRef.current) {
      let current = instanceRef.current;
      let changed = false;
      for (const projectType of PROJECT_TYPE_ORDER) {
        if (getHeaderTriState(current, projectType, env) === 'unchecked') {
          const res = selectAllInTable(current, projectType, env);
          if (res.instance !== current) {
            current = res.instance;
            changed = true;
          }
        }
      }
      if (changed) {
        instanceRef.current = current;
        setInstance(current);
      }
    }
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
        setExportError(formatUserFacingError(err, 'Failed to recompute dependency closure.'));
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
      setExportError(formatUserFacingError(err, 'Failed to export instance.json.'));
    }
  }, [instance, onExportJson]);

  const handleExportEnvironmentZip = useCallback(
    async (env: EnvironmentId) => {
      const currentInstance = instanceRef.current;
      if (!currentInstance || !fileFetcher || !archiveWriter) {
        return;
      }

      exportAbortControllerRef.current?.abort();
      const controller = new AbortController();
      exportAbortControllerRef.current = controller;

      setExportError(null);
      setZipResult(null);
      setIsExporting(true);
      setExportingEnv(env);
      setZipProgress({
        phase: 'downloading',
        completed: 0,
        total: toFileTree(currentInstance)[env].files.length,
        archivePercent: 0,
      });

      try {
        const result = await exportEnvironmentZip({
          instance: currentInstance,
          env,
          fileFetcher,
          archiveWriter,
          signal: controller.signal,
          onProgress: (update) => {
            if (exportAbortControllerRef.current !== controller || controller.signal.aborted) {
              return;
            }
            setZipProgress(update);
          },
          onExportBlob,
        });

        if (exportAbortControllerRef.current !== controller || controller.signal.aborted) {
          return;
        }

        exportAbortControllerRef.current = null;
        setIsExporting(false);
        setExportingEnv(null);
        setZipProgress(null);
        setZipResult(result);
      } catch (err: unknown) {
        if (exportAbortControllerRef.current !== controller) {
          return;
        }
        exportAbortControllerRef.current = null;
        setIsExporting(false);
        setExportingEnv(null);
        setZipProgress(null);
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }
        setExportError(formatUserFacingError(err, `Failed to export ${env}.zip.`));
      }
    },
    [fileFetcher, archiveWriter, onExportBlob],
  );

  const handleExportMrpack = useCallback(async () => {
    const currentInstance = instanceRef.current;
    if (!currentInstance || !archiveWriter) {
      return;
    }

    exportAbortControllerRef.current?.abort();
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;

    setExportError(null);
    setIsExporting(true);

    try {
      await exportMrpackArchive({
        instance: currentInstance,
        archiveWriter,
        platformVersion,
        signal: controller.signal,
        onExportBlob,
      });
    } catch (err: unknown) {
      if (
        exportAbortControllerRef.current !== controller ||
        controller.signal.aborted ||
        isAbortError(err)
      ) {
        return;
      }
      setExportError(formatUserFacingError(err, 'Failed to export .mrpack.'));
    } finally {
      if (exportAbortControllerRef.current === controller) {
        exportAbortControllerRef.current = null;
        setIsExporting(false);
      }
    }
  }, [archiveWriter, platformVersion, onExportBlob]);

  const tables = useMemo(() => (instance ? toTables(instance) : []), [instance]);

  const fileTrees = useMemo(() => (instance ? toFileTree(instance) : EMPTY_FILE_TREES), [instance]);

  const mrpackPreview = useMemo(
    () => (instance ? toMrpack(instance, { platformVersion }) : EMPTY_MRPACK_PREVIEW),
    [instance, platformVersion],
  );

  const mrpackWarnings = useMemo(() => (instance ? getMrpackWarnings(instance) : []), [instance]);

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
          Build client &amp; server instances from a Modrinth collection — entirely in your browser.
        </p>
      </header>

      <main className="app-main">
        <section className="card target-card" aria-label="Target configuration">
          <TargetForm
            modrinthClient={modrinthClient}
            isResolving={isResolving}
            isDisabled={isRecomputing || isExporting}
            activeTarget={instance?.meta.target ?? null}
            activeCollectionId={instance?.meta.source.collectionId ?? null}
            revertToken={revertToken}
            onSubmit={handleRequestLoadOrReResolve}
            onImportFile={handleImportFile}
          />
          {importError && (
            <div className="alert alert-error import-error-alert" role="alert">
              {importError}
            </div>
          )}
        </section>

        <ResolveProgressPanel
          isResolving={isResolving}
          progress={progress}
          logs={logs}
          error={resolveError}
          wasCancelled={wasCancelled}
          onCancel={handleCancelResolve}
          onRetry={lastSubmittedTarget ? handleRetryResolve : undefined}
        />

        {!instance && !isResolving && !resolveError && !wasCancelled && (
          <section className="card empty-workspace-card" aria-label="Getting started">
            <h2>Ready to build an instance</h2>
            <ol className="empty-steps">
              <li>
                Paste a Modrinth collection link or ID above to resolve compatible project files, or
                restore a saved configuration file offline.
              </li>
              <li>
                Toggle your target environments to inspect resolved versions, dependencies, and
                compatibility warnings.
              </li>
              <li>
                Download ready-to-use environment archives, a portable configuration snapshot, or a
                Modrinth modpack package.
              </li>
            </ol>
          </section>
        )}

        {instance && (
          <div className="review-workspace">
            <div className="review-summary-export-card card">
              <section className="review-header" aria-label="Collection summary">
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
              </section>

              <ExportBar
                activeEnvironments={activeEnvironments}
                fileTrees={fileTrees}
                mrpackPreview={mrpackPreview}
                mrpackWarnings={mrpackWarnings}
                platformVersion={platformVersion}
                onPlatformVersionChange={setPlatformVersion}
                canExportZip={Boolean(fileFetcher && archiveWriter)}
                canExportMrpack={Boolean(archiveWriter)}
                isRecomputing={isRecomputing}
                isExporting={isExporting}
                exportingEnv={exportingEnv}
                zipProgress={zipProgress}
                zipResult={zipResult}
                onExportEnvironmentZip={(env) => {
                  void handleExportEnvironmentZip(env);
                }}
                onCancelZipExport={handleCancelZipExport}
                onExportJson={handleExportJson}
                onExportMrpack={() => {
                  void handleExportMrpack();
                }}
              />
            </div>

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
              isRecomputing={isRecomputing || isExporting}
              environmentTogglesDisabled={isResolving || isRecomputing || isExporting}
              skippedCount={combinedSkipped.length}
              onToggleEnvironment={handleToggleEnvironment}
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
        <div>
          Made with &lt;3 by Stephen Rosa{' | '}
          <a
            href="https://www.github.com/stephenarosaj/modrinth-collection-downloader"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{' | '}
          <a
            href="https://www.linkedin.com/in/stephenarosaj/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>{' | '}
          <a
            href="https://www.buymeacoffee.com/stephenrosaj"
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy Me A Coffee ☕
          </a>
        </div>
      </footer>
    </div>
  );
}
