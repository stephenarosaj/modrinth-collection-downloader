import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  filterReleaseGameVersions,
  formatPlatformDisplayName,
  parseCollectionInput,
  type ReleasePreference,
} from '../../core';
import type { GameVersionInfo, ModrinthClient, PlatformInfo } from '../../ports';
import { isAbortError } from '../utils';

export interface TargetFormValues {
  collectionInput: string;
  gameVersion: string;
  platform: string;
  releasePreference: ReleasePreference;
}

export interface TargetFormProps {
  modrinthClient?: ModrinthClient;
  isResolving: boolean;
  onSubmit: (values: TargetFormValues) => void;
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

export function TargetForm({ modrinthClient, isResolving, onSubmit }: TargetFormProps) {
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

  const tagsReady =
    Boolean(modrinthClient) &&
    !isLoadingTags &&
    !tagLoadError &&
    gameVersions.length > 0 &&
    platforms.length > 0;

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
          disabled={isResolving}
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
            onChange={(e) => setGameVersion(e.target.value)}
            disabled={!tagsReady || isResolving}
          >
            {gameVersions.length === 0 ? (
              <option value="">
                {isLoadingTags ? 'Loading game versions…' : 'No game versions available'}
              </option>
            ) : (
              gameVersions.map((gv) => (
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
            onChange={(e) => setPlatform(e.target.value)}
            disabled={!tagsReady || isResolving}
          >
            {platforms.length === 0 ? (
              <option value="">
                {isLoadingTags ? 'Loading platforms…' : 'No platforms available'}
              </option>
            ) : (
              platforms.map((p) => (
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
            onChange={(e) => setPreferStable(e.target.checked)}
            disabled={isResolving}
          />
          <span>Prefer stable releases over newest alpha/beta</span>
        </label>
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!tagsReady || isResolving}
        >
          {isResolving ? 'Loading collection…' : 'Load collection'}
        </button>
      </div>
    </form>
  );
}
