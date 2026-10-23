import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CORE_SCHEMA_VERSION,
  formatPlatformDisplayName,
  getSkippedEntries,
  resolveCollection,
  toTables,
  type Instance,
  type ResolveProgress,
  type SkippedProject,
} from '../core';
import type { ModrinthClient } from '../ports';
import { exportInstanceJson } from './download';
import { EntryTables } from './components/EntryTables';
import { ResolveProgressPanel } from './components/ResolveProgressPanel';
import { SkippedSection } from './components/SkippedSection';
import { TargetForm, type TargetFormValues } from './components/TargetForm';
import { isAbortError } from './utils';

export interface AppProps {
  appName?: string;
  modrinthClient?: ModrinthClient;
  onExportJson?: (filename: string, jsonContent: string) => void;
}

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
  const [progress, setProgress] = useState<ResolveProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const handleCancelResolve = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsResolving(false);
    setWasCancelled(true);
  }, []);

  const handleLoadCollection = useCallback(
    async (values: TargetFormValues) => {
      if (!modrinthClient) {
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setInstance(null);
      setResolveSkipped([]);
      setExportError(null);
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
        setInstance(result.instance);
        setResolveSkipped(result.skipped);
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
    [modrinthClient],
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
            onSubmit={handleLoadCollection}
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
                <button type="button" className="btn btn-primary" onClick={handleExportJson}>
                  Export instance.json
                </button>
              </div>
            </section>

            {exportError && (
              <div className="alert alert-error" role="alert">
                {exportError}
              </div>
            )}

            <EntryTables tables={tables} />

            <SkippedSection skipped={combinedSkipped} />
          </div>
        )}
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
