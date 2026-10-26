import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  filterReleaseGameVersions,
  formatPlatformDisplayName,
  parseCollectionInput,
  type InstanceTarget,
  type ReleasePreference,
} from '../../core';
import type { GameVersionInfo, ModrinthClient, PlatformInfo } from '../../ports';
import { isAbortError } from '../utils';

/** Form values defining the target instance configuration. */
export interface TargetFormValues {
  collectionInput: string;
  gameVersion: string;
  platform: string;
  releasePreference: ReleasePreference;
}

/** Props for {@link TargetForm}. */
export interface TargetFormProps {
  modrinthClient?: ModrinthClient;
  isResolving: boolean;
  isDisabled?: boolean;
  activeTarget?: InstanceTarget | null;
  activeCollectionId?: string | null;
  revertToken?: number;
  onSubmit: (values: TargetFormValues) => void;
  onTargetChange?: (values: TargetFormValues) => void;
  onImportFile?: (file: File) => void | Promise<void>;
}

function filterPlatforms(platforms: readonly PlatformInfo[]): PlatformInfo[] {
  const modOrPluginPlatforms = platforms.filter(
    (p) =>
      p.supportedProjectTypes.includes('mod') || p.supportedProjectTypes.includes('plugin'),
  );
  if (modOrPluginPlatforms.length > 0) {
    return modOrPluginPlatforms;
  }
  return platforms.filter((p) => p.name.trim().toLowerCase() !== 'datapack');
}

/**
 * Configuration form capturing collection URL or ID, Minecraft game version,
 * mod platform/loader, and release preference, with support for offline `instance.json` import.
 */
export function TargetForm({
  modrinthClient,
  isResolving,
  isDisabled = false,
  activeTarget = null,
  activeCollectionId = null,
  revertToken = 0,
  onSubmit,
  onTargetChange,
  onImportFile,
}: TargetFormProps) {
  const [collectionInput, setCollectionInput] = useState('');
  const [gameVersion, setGameVersion] = useState('');
  const [platform, setPlatform] = useState('');
  const [preferStable, setPreferStable] = useState(true);

  const [gameVersions, setGameVersions] = useState<GameVersionInfo[]>([]);
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [tagLoadError, setTagLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (revertToken > 0 && activeTarget) {
      if (activeCollectionId) {
        setCollectionInput(activeCollectionId);
      }
      setGameVersion(activeTarget.gameVersion);
      setPlatform(activeTarget.platform);
      setPreferStable(activeTarget.releasePreference === 'stable');
      setValidationError(null);
    }
  }, [revertToken, activeTarget, activeCollectionId]);

  useEffect(() => {
    if (!modrinthClient) {
      setGameVersions([]);
      setPlatforms([]);
      setIsLoadingTags(false);
      setTagLoadError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoadingTags(true);
    setTagLoadError(null);

    Promise.all([
      modrinthClient.getGameVersions({ signal: controller.signal }),
      modrinthClient.getPlatforms({ signal: controller.signal }),
    ])
      .then(([rawGameVersions, rawPlatforms]) => {
        if (controller.signal.aborted) {
          return;
        }
        const releaseVersions = filterReleaseGameVersions(rawGameVersions);
        const usablePlatforms = filterPlatforms(rawPlatforms);

        setGameVersions(releaseVersions);
        setPlatforms(usablePlatforms);

        setGameVersion((prev) => {
          if (prev && releaseVersions.some((v) => v.version === prev)) {
            return prev;
          }
          return releaseVersions[0]?.version ?? '';
        });

        setPlatform((prev) => {
          if (prev && usablePlatforms.some((p) => p.name === prev)) {
            return prev;
          }
          const fabricPlatform = usablePlatforms.find(
            (p) => p.name.toLowerCase() === 'fabric',
          );
          return fabricPlatform?.name ?? usablePlatforms[0]?.name ?? '';
        });

        setIsLoadingTags(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setTagLoadError(message || 'Failed to load game versions and platforms.');
        setIsLoadingTags(false);
      });

    return () => {
      controller.abort();
    };
  }, [modrinthClient, reloadNonce]);

  const handleRetryTags = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const notifyTargetChangeIfLoaded = (
    nextGameVersion: string,
    nextPlatform: string,
    nextPreferStable: boolean,
  ) => {
    if (
      !activeTarget ||
      !activeCollectionId ||
      !onTargetChange ||
      !nextGameVersion ||
      !nextPlatform
    ) {
      return;
    }
    setCollectionInput(activeCollectionId);
    setValidationError(null);
    onTargetChange({
      collectionInput: activeCollectionId,
      gameVersion: nextGameVersion,
      platform: nextPlatform,
      releasePreference: nextPreferStable ? 'stable' : 'newest',
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      parseCollectionInput(collectionInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid collection input.';
      setValidationError(message);
      return;
    }

    if (!gameVersion || !platform) {
      setValidationError('Please select both a game version and a platform.');
      return;
    }

    setValidationError(null);
    onSubmit({
      collectionInput: collectionInput.trim(),
      gameVersion,
      platform,
      releasePreference: preferStable ? 'stable' : 'newest',
    });
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onImportFile) {
      return;
    }
    void onImportFile(file);
  };

  const tagsReady =
    Boolean(modrinthClient) &&
    !isLoadingTags &&
    !tagLoadError &&
    gameVersions.length > 0 &&
    platforms.length > 0;
  const controlsDisabled = isResolving || isDisabled;

  const effectiveGameVersions =
    gameVersion && !gameVersions.some((gv) => gv.version === gameVersion)
      ? [
          {
            version: gameVersion,
            versionType: 'release' as const,
            date: '',
            major: true,
          },
          ...gameVersions,
        ]
      : gameVersions;

  const effectivePlatforms =
    platform && !platforms.some((p) => p.name === platform)
      ? [
          {
            name: platform,
            supportedProjectTypes: ['mod'],
          },
          ...platforms,
        ]
      : platforms;

  return (
    <form className="target-form" onSubmit={handleSubmit} noValidate>
      {tagLoadError && (
        <div className="alert alert-error" role="alert">
          <span>Failed to load Modrinth metadata: {tagLoadError}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRetryTags}
            disabled={isLoadingTags}
          >
            Retry
          </button>
        </div>
      )}

      <div className="form-field">
        <label htmlFor="collection-input">Collection URL or ID</label>
        <input
          id="collection-input"
          type="text"
          value={collectionInput}
          onChange={(e) => {
            setCollectionInput(e.target.value);
            if (validationError) {
              setValidationError(null);
            }
          }}
          placeholder="https://modrinth.com/collection/5OBQuutT or 5OBQuutT"
          disabled={controlsDisabled}
          aria-invalid={validationError ? 'true' : 'false'}
          aria-describedby={validationError ? 'collection-input-error' : undefined}
        />
        {validationError && (
          <p id="collection-input-error" className="field-error" role="alert">
            {validationError}
          </p>
        )}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="game-version-select">Game Version</label>
          <select
            id="game-version-select"
            value={gameVersion}
            onChange={(e) => {
              const nextGameVersion = e.target.value;
              setGameVersion(nextGameVersion);
              notifyTargetChangeIfLoaded(nextGameVersion, platform, preferStable);
            }}
            disabled={!tagsReady || controlsDisabled}
          >
            {effectiveGameVersions.length === 0 ? (
              <option value="">
                {isLoadingTags ? 'Loading game versions…' : 'No game versions available'}
              </option>
            ) : (
              effectiveGameVersions.map((gv) => (
                <option key={gv.version} value={gv.version}>
                  {gv.version}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="platform-select">Platform</label>
          <select
            id="platform-select"
            value={platform}
            onChange={(e) => {
              const nextPlatform = e.target.value;
              setPlatform(nextPlatform);
              notifyTargetChangeIfLoaded(gameVersion, nextPlatform, preferStable);
            }}
            disabled={!tagsReady || controlsDisabled}
          >
            {effectivePlatforms.length === 0 ? (
              <option value="">
                {isLoadingTags ? 'Loading platforms…' : 'No platforms available'}
              </option>
            ) : (
              effectivePlatforms.map((p) => (
                <option key={p.name} value={p.name}>
                  {formatPlatformDisplayName(p.name)}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="form-checkbox">
        <label htmlFor="prefer-stable-checkbox">
          <input
            id="prefer-stable-checkbox"
            type="checkbox"
            checked={preferStable}
            onChange={(e) => {
              const nextPreferStable = e.target.checked;
              setPreferStable(nextPreferStable);
              notifyTargetChangeIfLoaded(gameVersion, platform, nextPreferStable);
            }}
            disabled={controlsDisabled}
          />
          <span>Prefer stable releases over newest alpha/beta</span>
        </label>
      </div>

      <div className="form-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          aria-label="Import instance.json file"
          className="sr-only"
          onChange={handleFileInputChange}
          disabled={controlsDisabled}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={controlsDisabled}
        >
          Import instance.json
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!tagsReady || controlsDisabled}
        >
          {isResolving ? 'Loading collection…' : 'Load collection'}
        </button>
      </div>
    </form>
  );
}
