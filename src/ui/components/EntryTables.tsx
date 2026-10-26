import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CORE_SCHEMA_VERSION,
  ENVIRONMENTS,
  ENV_BADGE_TOOLTIP_META,
  computeEntryStatus,
  computeHeaderTriState,
  formatCellStatusTooltip,
  getHeaderTriState,
  getReasonKind,
  isSelectable,
  isUnverifiedPlatformCandidate,
  type BadgeTooltipMeta,
  type EntryStatus,
  type EnvironmentId,
  type EnvironmentState,
  type ExportableProjectType,
  type HeaderTriState,
  type Instance,
  type Kind,
  type LinkedProjectRef,
  type ProjectType,
  type Status,
  type Support,
  type TableModel,
  type TableRow,
  type VersionRef,
  type VersionType,
} from '../../core';
import { EnvironmentTogglesBar, type ActiveEnvironments } from './EnvironmentTogglesBar';
import { StatusSymbol } from './StatusSymbol';

/** Props for the {@link EntryTables} review table set. */
export interface EntryTablesProps {
  tables: readonly TableModel[];
  instance?: Instance | null;
  entryStatuses?: ReadonlyMap<string, EntryStatus>;
  targetPlatform?: string;
  activeEnvironments?: ActiveEnvironments;
  flashingCells?: ReadonlySet<string>;
  isRecomputing?: boolean;
  environmentTogglesDisabled?: boolean;
  skippedCount?: number;
  onToggleEnvironment?: (env: EnvironmentId, active: boolean) => void;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onToggleSelectAll?: (
    projectType: ExportableProjectType,
    env: EnvironmentId,
    selectAll: boolean,
  ) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
}

/** Display headings mapped to each exportable project type table. */
export const PROJECT_TYPE_HEADINGS: Readonly<Record<ExportableProjectType, string>> = {
  mod: 'Mods',
  plugin: 'Plugins',
  datapack: 'Datapacks',
  resourcepack: 'Resource Packs',
  shader: 'Shaders',
};

const DEFAULT_ACTIVE_ENVIRONMENTS: ActiveEnvironments = {
  client: false,
  server: false,
};

const EMPTY_FLASHING_SET: ReadonlySet<string> = new Set<string>();

/**
 * Formats candidate version dropdown option labels including version number,
 * release channel (if not release), and unverified platform notice.
 */
export function formatCandidateOptionLabel(
  candidate: VersionRef,
  projectType: ProjectType,
): string {
  let label = candidate.versionNumber;
  if (candidate.versionType !== 'release') {
    label += ` (${candidate.versionType})`;
  }
  if (isUnverifiedPlatformCandidate(candidate, projectType)) {
    label += ' [unverified platform]';
  }
  return label;
}

function buildCandidateOptions(envState: EnvironmentState): VersionRef[] {
  if (!envState.version) {
    return envState.candidates;
  }
  if (envState.candidates.some((c) => c.id === envState.version!.id)) {
    return envState.candidates;
  }
  return [envState.version, ...envState.candidates];
}

interface HeaderSelectAllCellProps {
  env: EnvironmentId;
  heading: string;
  triState: HeaderTriState;
  hasSelectableCollectionRows: boolean;
  isActive: boolean;
  isRecomputing: boolean;
  onToggle: (selectAll: boolean) => void;
  onActivateEnvironment?: () => void;
}

function HeaderSelectAllCell({
  env,
  heading,
  triState,
  hasSelectableCollectionRows,
  isActive,
  isRecomputing,
  onToggle,
  onActivateEnvironment,
}: HeaderSelectAllCellProps) {
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const envLabel = env === 'client' ? 'Client' : 'Server';
  const isDisabled = !hasSelectableCollectionRows || isRecomputing;
  const effectiveTriState: HeaderTriState = isActive ? triState : 'unchecked';

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = effectiveTriState === 'indeterminate';
    }
  }, [effectiveTriState]);

  return (
    <th scope="col" className="col-env" data-env={env}>
      <div className="th-env-split">
        <div className="th-env-header">
          <span className="th-env-title">{envLabel}</span>
          <label
            className={`badge env-select-all-token env-select-all-token-${effectiveTriState} ${isDisabled ? 'env-select-all-token-disabled' : ''}`}
          >
            <input
              ref={(el) => {
                checkboxRef.current = el;
                if (el) {
                  el.indeterminate = effectiveTriState === 'indeterminate';
                }
              }}
              type="checkbox"
              className="env-select-all-checkbox sr-only"
              checked={effectiveTriState === 'checked'}
              aria-checked={
                effectiveTriState === 'indeterminate' ? 'mixed' : effectiveTriState === 'checked'
              }
              disabled={isDisabled}
              aria-label={`Select all ${heading} for ${envLabel}`}
              onChange={() => {
                if (!isActive) {
                  onActivateEnvironment?.();
                  if (triState !== 'checked') {
                    onToggle(true);
                  }
                  return;
                }
                onToggle(triState !== 'checked');
              }}
            />
            <span className="env-select-all-token-symbol" aria-hidden="true">
              {effectiveTriState === 'checked' ? (
                <svg
                  className="env-select-all-symbol-svg"
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                >
                  <polyline points="3 8.5 6.5 12 13 4.5" />
                </svg>
              ) : effectiveTriState === 'indeterminate' ? (
                <span className="env-select-all-dash" />
              ) : (
                <span className="env-select-all-empty" />
              )}
            </span>
            <span className="env-select-all-token-label">Select all</span>
          </label>
        </div>
        <div className="env-cell-deps-divider th-env-deps-divider" aria-hidden="true" />
        <div className="th-env-deps">
          <span className="th-env-deps-title">Dependencies</span>
        </div>
      </div>
    </th>
  );
}

function areStringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function areStatusesEqual(a: Status | null, b: Status | null): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a.kind === b.kind && areStringArraysEqual(a.reasons, b.reasons);
}

function areEntryStatusesEqual(a: EntryStatus | undefined, b: EntryStatus | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  return (
    areStatusesEqual(a.client, b.client) &&
    areStatusesEqual(a.server, b.server) &&
    areStatusesEqual(a.row, b.row)
  );
}

function areCandidatesEqual(a: readonly VersionRef[], b: readonly VersionRef[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) {
      return false;
    }
  }
  return true;
}

function areEnvironmentStatesEqual(a: EnvironmentState, b: EnvironmentState): boolean {
  if (a === b) {
    return true;
  }
  return (
    a.support === b.support &&
    (a.version?.id ?? null) === (b.version?.id ?? null) &&
    a.resolution === b.resolution &&
    a.selection.on === b.selection.on &&
    a.selection.source === b.selection.source &&
    areCandidatesEqual(a.candidates, b.candidates)
  );
}

interface MetaBadgeWithTooltipProps {
  className: string;
  label: string;
  category: string;
  title: string;
  description: string;
  tone?: 'ok' | 'warning' | 'unknown';
  dataSelectionSource?: string;
}

function MetaBadgeWithTooltip({
  className,
  label,
  category,
  title,
  description,
  tone = 'ok',
  dataSelectionSource,
}: MetaBadgeWithTooltipProps) {
  return (
    <span className="meta-badge-wrapper">
      <span className={`${className} badge-has-tooltip`} data-selection-source={dataSelectionSource}>
        {label}
      </span>
      <span className="meta-badge-tooltip" role="note">
        <span className={`status-tooltip-card status-tooltip-card-${tone}`}>
          <span className="status-tooltip-card-header">
            <span className="status-tooltip-env-badge">{category}</span>
          </span>
          <span className="status-tooltip-reason-item">
            <strong className="status-tooltip-reason-title">{title}</strong>
            <span className="status-tooltip-reason-text">{description}</span>
          </span>
        </span>
      </span>
    </span>
  );
}

function getSupportBadgeMeta(
  support: Exclude<Support, 'unsupported'>,
  envLabel: string,
): BadgeTooltipMeta {
  if (support === 'required') {
    return ENV_BADGE_TOOLTIP_META.support.required(envLabel);
  }
  if (support === 'optional') {
    return ENV_BADGE_TOOLTIP_META.support.optional(envLabel);
  }
  return ENV_BADGE_TOOLTIP_META.support.unknown();
}

function getVersionTypeBadgeMeta(versionType: Exclude<VersionType, 'release'>): BadgeTooltipMeta {
  return ENV_BADGE_TOOLTIP_META.versionType[versionType];
}

export type ChipTone = 'error' | 'warning' | 'unknown' | 'default';

function resolveChipTone(
  linkedId: string,
  isRequiredLink: boolean,
  isDependencyRow: boolean,
  env: EnvironmentId,
  parentEnvState: EnvironmentState,
  isActiveEnv: boolean,
  statuses: ReadonlyMap<string, EntryStatus>,
  tableRowById: ReadonlyMap<string, TableRow>,
): ChipTone {
  if (!isActiveEnv) {
    return 'default';
  }
  const linkedStatus = statuses.get(linkedId)?.[env] ?? null;
  const linkedRow = tableRowById.get(linkedId);
  const linkedEnvState = linkedRow?.environments[env];

  if (isDependencyRow) {
    if (linkedStatus) {
      if (linkedStatus.kind === 'error') {
        return 'error';
      }
      if (linkedStatus.kind === 'warning') {
        return 'warning';
      }
      if (linkedStatus.kind === 'unknown') {
        return 'unknown';
      }
      return 'default';
    }
    if (linkedEnvState?.support === 'unknown') {
      return 'unknown';
    }
    return 'default';
  }

  // In the Mod section (`!isDependencyRow`), only highlight a dependency chip if the issue
  // belongs to THAT specific dependency itself (ignore DEPENDENCY_NOT_SELECTED / DEPENDENCY_UNAVAILABLE
  // caused by another sub-dependency).
  if (linkedStatus) {
    const selfReasons = linkedStatus.reasons.filter(
      (r) => r !== 'DEPENDENCY_NOT_SELECTED' && r !== 'DEPENDENCY_UNAVAILABLE',
    );
    const support = linkedEnvState?.support ?? 'required';
    let hasWarning = false;
    let hasUnknown = false;
    for (const reason of selfReasons) {
      const kind =
        reason === 'NO_COMPATIBLE_VERSION' && support === 'optional'
          ? 'warning'
          : getReasonKind(reason);
      if (kind === 'error') {
        return 'error';
      }
      if (kind === 'warning') {
        hasWarning = true;
      } else if (kind === 'unknown') {
        hasUnknown = true;
      }
    }
    if (hasWarning) {
      return 'warning';
    }
    if (hasUnknown) {
      return 'unknown';
    }
    return 'default';
  }

  if (linkedEnvState) {
    if (isRequiredLink && parentEnvState.selection.on) {
      if (linkedEnvState.support === 'unsupported' || linkedEnvState.version === null) {
        return 'error';
      }
      if (!linkedEnvState.selection.on) {
        return 'warning';
      }
    }
    if (linkedEnvState.support === 'unknown') {
      return 'unknown';
    }
    return 'default';
  }

  if (isRequiredLink && parentEnvState.selection.on) {
    return 'error';
  }
  return 'default';
}

function computeCellChipTonesKey(
  requiredRefs: readonly LinkedProjectRef[],
  optionalRefs: readonly LinkedProjectRef[],
  isDependencyRow: boolean,
  env: EnvironmentId,
  parentEnvState: EnvironmentState,
  isActiveEnv: boolean,
  statuses: ReadonlyMap<string, EntryStatus>,
  tableRowById: ReadonlyMap<string, TableRow>,
): string {
  if ((requiredRefs.length === 0 && optionalRefs.length === 0) || !isActiveEnv) {
    return '';
  }
  const parts: string[] = [];
  for (const ref of requiredRefs) {
    const tone = resolveChipTone(
      ref.id,
      true,
      isDependencyRow,
      env,
      parentEnvState,
      isActiveEnv,
      statuses,
      tableRowById,
    );
    if (tone !== 'default') {
      parts.push(`${ref.id}:${tone}`);
    }
  }
  for (const ref of optionalRefs) {
    const tone = resolveChipTone(
      ref.id,
      false,
      isDependencyRow,
      env,
      parentEnvState,
      isActiveEnv,
      statuses,
      tableRowById,
    );
    if (tone !== 'default') {
      parts.push(`${ref.id}:${tone}`);
    }
  }
  return parts.join('|');
}

function getChipToneFromKey(chipTonesKey: string, linkedId: string): ChipTone {
  if (!chipTonesKey) {
    return 'default';
  }
  const entries = chipTonesKey.split('|');
  for (const item of entries) {
    if (item === `${linkedId}:error`) {
      return 'error';
    }
    if (item === `${linkedId}:warning`) {
      return 'warning';
    }
    if (item === `${linkedId}:unknown`) {
      return 'unknown';
    }
  }
  return 'default';
}

const EMPTY_LINKED_REFS: readonly LinkedProjectRef[] = [];

function areLinkedRefsEqual(
  a: readonly LinkedProjectRef[] | undefined,
  b: readonly LinkedProjectRef[] | undefined,
): boolean {
  const listA = a ?? EMPTY_LINKED_REFS;
  const listB = b ?? EMPTY_LINKED_REFS;
  if (listA === listB) {
    return true;
  }
  if (listA.length !== listB.length) {
    return false;
  }
  for (let i = 0; i < listA.length; i += 1) {
    if (listA[i]?.id !== listB[i]?.id || listA[i]?.title !== listB[i]?.title) {
      return false;
    }
  }
  return true;
}

function renderChipTitle(title: string) {
  if (title.length <= 1) {
    return <span>{title}</span>;
  }
  return (
    <>
      <span>{title.slice(0, 1)}</span>
      <span>{title.slice(1)}</span>
    </>
  );
}

interface EnvironmentCellProps {
  projectId: string;
  projectTitle: string;
  projectType: ProjectType;
  env: EnvironmentId;
  envState: EnvironmentState;
  cellStatus: Status | null;
  isActive: boolean;
  isFlashing: boolean;
  isRecomputing: boolean;
  isDependency?: boolean;
  hasSelectedDependents?: boolean;
  chipTonesKey?: string;
  isolatedChipId?: string | null;
  requiredDeps?: readonly LinkedProjectRef[];
  optionalDeps?: readonly LinkedProjectRef[];
  requiredByRefs?: readonly LinkedProjectRef[];
  optionalByRefs?: readonly LinkedProjectRef[];
  requiresListTestId?: string;
  optionalListTestId?: string;
  requiredByListTestId?: string;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
  onHoverLink?: (sourceId: string, targetId: string | null) => void;
  onToggleFocusProject?: (projectId: string, fallbackProjectId?: string) => void;
}

function areEnvCellPropsEqual(prev: EnvironmentCellProps, next: EnvironmentCellProps): boolean {
  return (
    prev.projectId === next.projectId &&
    prev.projectTitle === next.projectTitle &&
    prev.projectType === next.projectType &&
    prev.env === next.env &&
    prev.isActive === next.isActive &&
    prev.isFlashing === next.isFlashing &&
    prev.isRecomputing === next.isRecomputing &&
    (prev.isDependency ?? false) === (next.isDependency ?? false) &&
    (prev.hasSelectedDependents ?? true) === (next.hasSelectedDependents ?? true) &&
    (prev.chipTonesKey ?? '') === (next.chipTonesKey ?? '') &&
    (prev.isolatedChipId ?? null) === (next.isolatedChipId ?? null) &&
    prev.requiresListTestId === next.requiresListTestId &&
    prev.optionalListTestId === next.optionalListTestId &&
    prev.requiredByListTestId === next.requiredByListTestId &&
    prev.onToggleEntrySelection === next.onToggleEntrySelection &&
    prev.onChangeEntryVersion === next.onChangeEntryVersion &&
    prev.onHoverLink === next.onHoverLink &&
    prev.onToggleFocusProject === next.onToggleFocusProject &&
    areEnvironmentStatesEqual(prev.envState, next.envState) &&
    areStatusesEqual(prev.cellStatus, next.cellStatus) &&
    areLinkedRefsEqual(prev.requiredDeps, next.requiredDeps) &&
    areLinkedRefsEqual(prev.optionalDeps, next.optionalDeps) &&
    areLinkedRefsEqual(prev.requiredByRefs, next.requiredByRefs) &&
    areLinkedRefsEqual(prev.optionalByRefs, next.optionalByRefs)
  );
}

const EnvironmentCell = memo(function EnvironmentCell({
  projectId,
  projectTitle,
  projectType,
  env,
  envState,
  cellStatus,
  isActive,
  isFlashing,
  isRecomputing,
  isDependency = false,
  hasSelectedDependents = true,
  chipTonesKey = '',
  isolatedChipId = null,
  requiredDeps = EMPTY_LINKED_REFS,
  optionalDeps = EMPTY_LINKED_REFS,
  requiredByRefs = EMPTY_LINKED_REFS,
  optionalByRefs = EMPTY_LINKED_REFS,
  requiresListTestId,
  optionalListTestId,
  requiredByListTestId,
  onToggleEntrySelection,
  onChangeEntryVersion,
  onHoverLink,
  onToggleFocusProject,
}: EnvironmentCellProps) {
  const envLabel = env === 'client' ? 'Client' : 'Server';
  const cellKind = cellStatus?.kind ?? 'none';
  const cellReasons = cellStatus?.reasons.join(',') ?? '';
  const hasRing = Boolean(cellStatus && cellStatus.kind !== 'ok');
  const cellTooltip = hasRing ? formatCellStatusTooltip(cellStatus, env) : undefined;

  const baseClassName = [
    'col-env',
    'env-cell',
    !isActive ? 'env-col-inactive' : '',
    isFlashing ? 'env-cell-flash' : '',
    hasRing && cellStatus ? `env-cell-ring env-cell-ring-${cellStatus.kind}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const renderChipButton = (ref: LinkedProjectRef, isOptional: boolean) => {
    const tone = getChipToneFromKey(chipTonesKey, ref.id);
    const isChipIsolated = isolatedChipId === ref.id;
    const chipClassName = [
      'dep-link-chip',
      isOptional ? 'dep-link-chip-optional' : '',
      tone !== 'default' ? `dep-link-chip-${tone}` : '',
      isChipIsolated ? 'dep-link-chip-isolated' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        type="button"
        className={chipClassName}
        data-linked-project-id={ref.id}
        data-chip-status={tone}
        data-chip-isolated={isChipIsolated ? 'true' : undefined}
        aria-pressed={isChipIsolated}
        aria-label={`Isolate ${ref.title}`}
        onMouseEnter={() => onHoverLink?.(projectId, ref.id)}
        onMouseLeave={() => onHoverLink?.(projectId, null)}
        onFocus={() => onHoverLink?.(projectId, ref.id)}
        onBlur={() => onHoverLink?.(projectId, null)}
        onClick={() => onToggleFocusProject?.(ref.id, projectId)}
      >
        {renderChipTitle(ref.title)}
      </button>
    );
  };

  const renderEnvDependenciesPanel = () => {
    if (!isDependency) {
      if (requiredDeps.length === 0 && optionalDeps.length === 0) {
        return null;
      }
      return (
        <>
          <div className="env-cell-deps-divider" aria-hidden="true" />
          <div className="env-cell-deps-panel">
            {requiredDeps.length > 0 && (
              <div
                className="env-deps-section requires-list"
                data-testid={requiresListTestId}
              >
                <div className="env-deps-heading">
                  required<span className="sr-only">{': '}</span>
                </div>
                <div className="env-deps-chips">
                  {requiredDeps.map((dep, idx) => (
                    <span key={`${dep.id}-${idx}`} className="dep-link-chip-wrap">
                      {idx > 0 && <span className="sr-only">{', '}</span>}
                      {renderChipButton(dep, false)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {requiredDeps.length > 0 && optionalDeps.length > 0 && (
              <div className="env-deps-horiz-divider" aria-hidden="true" />
            )}
            {optionalDeps.length > 0 && (
              <div
                className="env-deps-section optional-list"
                data-testid={optionalListTestId}
              >
                <div className="env-deps-heading">
                  optional<span className="sr-only">{': '}</span>
                </div>
                <div className="env-deps-chips">
                  {optionalDeps.map((dep, idx) => (
                    <span key={`${dep.id}-${idx}`} className="dep-link-chip-wrap">
                      {idx > 0 && <span className="sr-only">{', '}</span>}
                      {renderChipButton(dep, true)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      );
    }

    if (requiredByRefs.length === 0 && optionalByRefs.length === 0) {
      return null;
    }
    return (
      <>
        <div className="env-cell-deps-divider" aria-hidden="true" />
        <div className="env-cell-deps-panel required-by-list" data-testid={requiredByListTestId}>
          {requiredByRefs.length > 0 && (
            <div className="env-deps-section required-by-item">
              <div className="env-deps-heading">
                required<span className="sr-only">{' by: '}</span>
              </div>
              <div className="env-deps-chips">
                {requiredByRefs.map((ref, idx) => (
                  <span key={`${ref.id}-${idx}`} className="dep-link-chip-wrap">
                    {idx > 0 && <span className="sr-only">{', '}</span>}
                    {renderChipButton(ref, false)}
                  </span>
                ))}
                <span className="sr-only">{` (${env})`}</span>
              </div>
            </div>
          )}
          {requiredByRefs.length > 0 && optionalByRefs.length > 0 && (
            <div className="env-deps-horiz-divider" aria-hidden="true" />
          )}
          {optionalByRefs.length > 0 && (
            <div className="env-deps-section optional-by-item">
              <div className="env-deps-heading">
                optional<span className="sr-only">{' for: '}</span>
              </div>
              <div className="env-deps-chips">
                {optionalByRefs.map((ref, idx) => (
                  <span key={`${ref.id}-${idx}`} className="dep-link-chip-wrap">
                    {idx > 0 && <span className="sr-only">{', '}</span>}
                    {renderChipButton(ref, true)}
                  </span>
                ))}
                <span className="sr-only">{` (${env})`}</span>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  if (envState.support === 'unsupported') {
    return (
      <td
        className={`${baseClassName} env-cell-unsupported`}
        data-env={env}
        data-cell-status={cellKind}
        data-cell-reasons={cellReasons}
        data-flashing={isFlashing ? 'true' : undefined}
        title={cellTooltip}
      >
        <div className="env-cell-split">
          <div className="env-cell-controls">
            <span className="env-unsupported" aria-label="Unsupported">
              ✗
            </span>
          </div>
          {renderEnvDependenciesPanel()}
        </div>
      </td>
    );
  }

  const supportMeta = getSupportBadgeMeta(envState.support, envLabel);

  if (envState.version === null) {
    const noVersionClassName = [
      'env-no-version',
      cellKind === 'warning' ? 'env-no-version-warning' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <td
        className={`${baseClassName} env-cell-missing`}
        data-env={env}
        data-cell-status={cellKind}
        data-cell-reasons={cellReasons}
        data-flashing={isFlashing ? 'true' : undefined}
        title={cellTooltip}
      >
        <div className="env-cell-split">
          <div className="env-cell-controls">
            <div className="env-cell-primary">
              <span className={noVersionClassName}>No compatible version</span>
            </div>
            <div className="env-cell-badges">
              <MetaBadgeWithTooltip
                className={`badge badge-support badge-support-${envState.support}`}
                label={envState.support}
                category={`${envLabel} Support`}
                title={supportMeta.title}
                description={supportMeta.description}
                tone={supportMeta.tone}
              />
            </div>
          </div>
          {renderEnvDependenciesPanel()}
        </div>
      </td>
    );
  }

  const candidateOptions = buildCandidateOptions(envState);
  const showFallbackBadge =
    envState.resolution === 'game-version-fallback' ||
    isUnverifiedPlatformCandidate(envState.version, projectType);
  const versionType = envState.version.versionType;
  const isPillDisabled = !isActive || isRecomputing;
  const isVisuallyChecked = isActive && envState.selection.on;
  const isUnneededDependencyInEnv = isDependency && !hasSelectedDependents;
  const isUnusedSelectedDep =
    Boolean(cellStatus?.reasons.includes('UNUSED_DEPENDENCY_SELECTED')) ||
    (isUnneededDependencyInEnv && envState.selection.on);
  const autoBadgeMeta = ENV_BADGE_TOOLTIP_META.selectionAuto(envLabel);
  const unneededDepMeta = ENV_BADGE_TOOLTIP_META.dependencyUnneeded(
    envLabel,
    isVisuallyChecked && isUnusedSelectedDep,
  );
  const fallbackBadgeMeta = ENV_BADGE_TOOLTIP_META.platformUnverified;

  return (
    <td
      className={baseClassName}
      data-env={env}
      data-cell-status={cellKind}
      data-cell-reasons={cellReasons}
      data-flashing={isFlashing ? 'true' : undefined}
      title={cellTooltip}
    >
      <div className="env-cell-split">
        <div className="env-cell-controls env-cell-with-checkbox">
          <div className="env-cell-body">
            <div className="env-cell-primary">
              <div
                className={`badge env-select-all-token env-row-select-pill ${
                  isVisuallyChecked
                    ? isUnusedSelectedDep
                      ? 'env-select-all-token-checked env-select-all-token-warning'
                      : 'env-select-all-token-checked'
                    : 'env-select-all-token-unchecked'
                } ${isPillDisabled ? 'env-select-all-token-disabled' : ''}`}
              >
                <label className="env-row-select-pill-toggle">
                  <input
                    type="checkbox"
                    className="env-select-checkbox sr-only"
                    data-selection-source={
                      envState.selection.on
                        ? envState.selection.source
                        : envState.selection.source === 'user'
                          ? 'user-off'
                          : 'none'
                    }
                    checked={envState.selection.on}
                    disabled={isPillDisabled}
                    aria-label={`Select ${projectTitle} for ${envLabel}`}
                    onChange={(e) => onToggleEntrySelection?.(projectId, env, e.target.checked)}
                  />
                  <span className="env-select-all-token-symbol" aria-hidden="true">
                    {isVisuallyChecked ? (
                      <svg
                        className="env-select-all-symbol-svg"
                        width="10"
                        height="10"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.8"
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                      >
                        <polyline points="3 8.5 6.5 12 13 4.5" />
                      </svg>
                    ) : (
                      <span className="env-select-all-empty" />
                    )}
                  </span>
                </label>
                <select
                  className="env-version-select"
                  aria-label={`${projectTitle} ${envLabel} version`}
                  value={envState.version.id}
                  disabled={isPillDisabled}
                  onChange={(e) => onChangeEntryVersion?.(projectId, env, e.target.value)}
                >
                  {candidateOptions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {formatCandidateOptionLabel(candidate, projectType)}
                    </option>
                  ))}
                </select>
                <span className="env-version-number sr-only">{envState.version.versionNumber}</span>
              </div>
            </div>
            <div className="env-cell-badges">
              <MetaBadgeWithTooltip
                className={`badge badge-support badge-support-${envState.support}`}
                label={envState.support}
                category={`${envLabel} Support`}
                title={supportMeta.title}
                description={supportMeta.description}
                tone={supportMeta.tone}
              />
              {isUnneededDependencyInEnv && (
                <MetaBadgeWithTooltip
                  className={`badge badge-dep-unneeded ${
                    isVisuallyChecked && isUnusedSelectedDep ? 'badge-dep-unneeded-warning' : ''
                  }`.trim()}
                  label="not needed"
                  category={`${envLabel} Dependency`}
                  title={unneededDepMeta.title}
                  description={unneededDepMeta.description}
                  tone={unneededDepMeta.tone}
                />
              )}
              {envState.selection.on && envState.selection.source === 'auto' && (
                <MetaBadgeWithTooltip
                  className="badge badge-selection-auto"
                  dataSelectionSource="auto"
                  label="auto"
                  category="Selection"
                  title={autoBadgeMeta.title}
                  description={autoBadgeMeta.description}
                  tone={autoBadgeMeta.tone}
                />
              )}
              {versionType !== 'release' && (
                <MetaBadgeWithTooltip
                  className={`badge badge-version-type badge-${versionType}`}
                  label={versionType}
                  category="Release Channel"
                  title={getVersionTypeBadgeMeta(versionType).title}
                  description={getVersionTypeBadgeMeta(versionType).description}
                  tone={getVersionTypeBadgeMeta(versionType).tone}
                />
              )}
              {showFallbackBadge && (
                <MetaBadgeWithTooltip
                  className="badge badge-fallback"
                  label="unverified platform"
                  category="Platform Match"
                  title={fallbackBadgeMeta.title}
                  description={fallbackBadgeMeta.description}
                  tone={fallbackBadgeMeta.tone}
                />
              )}
            </div>
          </div>
        </div>
        {renderEnvDependenciesPanel()}
      </div>
    </td>
  );
}, areEnvCellPropsEqual);

function renderIsolateButtonContent(isFocused: boolean) {
  if (!isFocused) {
    return '⧉ Isolate';
  }
  return (
    <>
      <svg
        className="dep-focus-check-svg"
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden="true"
      >
        <polyline points="3 8.5 6.5 12 13 4.5" />
      </svg>
      <span>Isolated</span>
    </>
  );
}

function resolveRequiredByRefsForEnv(
  row: TableRow,
  env: EnvironmentId,
): LinkedProjectRef[] {
  const refs = row.requiredByRefs?.[env];
  if (refs && refs.length > 0) {
    return refs;
  }
  return row.requiredByTitles[env].map((title) => ({ id: title, title }));
}

interface EntryTableRowProps {
  row: TableRow;
  entryStatus: EntryStatus | undefined;
  activeEnvironments: ActiveEnvironments;
  clientFlashing: boolean;
  serverFlashing: boolean;
  isRecomputing: boolean;
  isDependency?: boolean;
  clientHasSelectedDependents?: boolean;
  serverHasSelectedDependents?: boolean;
  isFocused?: boolean;
  clientChipTonesKey?: string;
  serverChipTonesKey?: string;
  isolatedChipId?: string | null;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
  onHoverLink?: (sourceId: string, targetId: string | null) => void;
  onToggleFocusProject?: (projectId: string, fallbackProjectId?: string) => void;
}

function areTableRowsEqual(a: TableRow, b: TableRow): boolean {
  if (a === b) {
    return true;
  }
  return (
    a.project.id === b.project.id &&
    a.project.title === b.project.title &&
    a.project.type === b.project.type &&
    a.project.modrinthUrl === b.project.modrinthUrl &&
    a.origin === b.origin &&
    a.platform === b.platform &&
    areStringArraysEqual(a.requiredByTitles.client, b.requiredByTitles.client) &&
    areStringArraysEqual(a.requiredByTitles.server, b.requiredByTitles.server) &&
    areEnvironmentStatesEqual(a.environments.client, b.environments.client) &&
    areEnvironmentStatesEqual(a.environments.server, b.environments.server) &&
    areLinkedRefsEqual(a.requiredDependencies?.client, b.requiredDependencies?.client) &&
    areLinkedRefsEqual(a.requiredDependencies?.server, b.requiredDependencies?.server) &&
    areLinkedRefsEqual(a.optionalDependencies?.client, b.optionalDependencies?.client) &&
    areLinkedRefsEqual(a.optionalDependencies?.server, b.optionalDependencies?.server) &&
    areLinkedRefsEqual(a.requiredByRefs?.client, b.requiredByRefs?.client) &&
    areLinkedRefsEqual(a.requiredByRefs?.server, b.requiredByRefs?.server) &&
    areLinkedRefsEqual(a.optionalByRefs?.client, b.optionalByRefs?.client) &&
    areLinkedRefsEqual(a.optionalByRefs?.server, b.optionalByRefs?.server)
  );
}

function areEntryRowPropsEqual(prev: EntryTableRowProps, next: EntryTableRowProps): boolean {
  return (
    (prev.isDependency ?? false) === (next.isDependency ?? false) &&
    (prev.clientHasSelectedDependents ?? true) === (next.clientHasSelectedDependents ?? true) &&
    (prev.serverHasSelectedDependents ?? true) === (next.serverHasSelectedDependents ?? true) &&
    (prev.isFocused ?? false) === (next.isFocused ?? false) &&
    (prev.clientChipTonesKey ?? '') === (next.clientChipTonesKey ?? '') &&
    (prev.serverChipTonesKey ?? '') === (next.serverChipTonesKey ?? '') &&
    (prev.isolatedChipId ?? null) === (next.isolatedChipId ?? null) &&
    prev.activeEnvironments.client === next.activeEnvironments.client &&
    prev.activeEnvironments.server === next.activeEnvironments.server &&
    prev.clientFlashing === next.clientFlashing &&
    prev.serverFlashing === next.serverFlashing &&
    prev.isRecomputing === next.isRecomputing &&
    prev.onToggleEntrySelection === next.onToggleEntrySelection &&
    prev.onChangeEntryVersion === next.onChangeEntryVersion &&
    prev.onHoverLink === next.onHoverLink &&
    prev.onToggleFocusProject === next.onToggleFocusProject &&
    areTableRowsEqual(prev.row, next.row) &&
    areEntryStatusesEqual(prev.entryStatus, next.entryStatus)
  );
}

const EntryTableRow = memo(function EntryTableRow({
  row,
  entryStatus,
  activeEnvironments,
  clientFlashing,
  serverFlashing,
  isRecomputing,
  isDependency = false,
  clientHasSelectedDependents = true,
  serverHasSelectedDependents = true,
  isFocused = false,
  clientChipTonesKey = '',
  serverChipTonesKey = '',
  isolatedChipId = null,
  onToggleEntrySelection,
  onChangeEntryVersion,
  onHoverLink,
  onToggleFocusProject,
}: EntryTableRowProps) {
  const clientRequiredByRefs = resolveRequiredByRefsForEnv(row, 'client');
  const serverRequiredByRefs = resolveRequiredByRefsForEnv(row, 'server');
  const clientOptionalByRefs = row.optionalByRefs?.client ?? EMPTY_LINKED_REFS;
  const serverOptionalByRefs = row.optionalByRefs?.server ?? EMPTY_LINKED_REFS;
  const clientRequiredDeps = row.requiredDependencies?.client ?? EMPTY_LINKED_REFS;
  const serverRequiredDeps = row.requiredDependencies?.server ?? EMPTY_LINKED_REFS;
  const clientOptionalDeps = row.optionalDependencies?.client ?? EMPTY_LINKED_REFS;
  const serverOptionalDeps = row.optionalDependencies?.server ?? EMPTY_LINKED_REFS;

  const rowStatus = entryStatus?.row ?? null;
  const rowStatusKind = rowStatus?.kind ?? 'none';

  const rowClassName = [
    'entry-row',
    isDependency ? 'entry-row-dependency' : '',
    rowStatus && rowStatus.kind !== 'ok' ? `row-tint row-tint-${rowStatus.kind}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isolateBtnToneClass =
    isFocused &&
    (rowStatusKind === 'error' || rowStatusKind === 'warning' || rowStatusKind === 'unknown')
      ? `dep-focus-btn-active-${rowStatusKind}`
      : '';

  const renderIsolateButton = (relationNoun: 'dependencies' | 'dependents') => (
    <button
      type="button"
      className={`badge dep-focus-btn ${isFocused ? `dep-focus-btn-active ${isolateBtnToneClass}` : ''}`.trim()}
      data-testid={`focus-tree-${row.project.id}`}
      aria-pressed={isFocused}
      aria-label={
        isFocused
          ? `Stop isolating ${row.project.title} and its ${relationNoun}`
          : `Show only ${row.project.title} and its ${relationNoun}`
      }
      title={
        isFocused
          ? 'Show all projects in table'
          : `Show only ${row.project.title} and its ${relationNoun}`
      }
      onClick={() => onToggleFocusProject?.(row.project.id)}
    >
      {renderIsolateButtonContent(isFocused)}
    </button>
  );

  const hasCollectionLinks =
    !isDependency &&
    (clientRequiredDeps.length > 0 ||
      serverRequiredDeps.length > 0 ||
      clientOptionalDeps.length > 0 ||
      serverOptionalDeps.length > 0);
  const hasDepLinks =
    isDependency &&
    (clientRequiredByRefs.length > 0 ||
      serverRequiredByRefs.length > 0 ||
      clientOptionalByRefs.length > 0 ||
      serverOptionalByRefs.length > 0);

  const clientHasDepPanel =
    clientRequiredByRefs.length > 0 || clientOptionalByRefs.length > 0;
  const serverHasDepPanel =
    serverRequiredByRefs.length > 0 || serverOptionalByRefs.length > 0;

  return (
    <tr
      className={rowClassName}
      data-project-id={row.project.id}
      data-origin={row.origin}
      data-row-status={rowStatusKind}
    >
      <td className="col-status" data-row-status={rowStatusKind}>
        {entryStatus && entryStatus.row !== null ? (
          <StatusSymbol
            projectId={row.project.id}
            projectTitle={row.project.title}
            entryStatus={entryStatus}
          />
        ) : null}
      </td>
      <td className="name-cell">
        <div className="project-header">
          <span className="project-title">{row.project.title}</span>
          <a
            href={row.project.modrinthUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="modrinth-link"
            aria-label={`Open ${row.project.title} on Modrinth`}
          >
            Open on Modrinth ↗
          </a>
          {hasCollectionLinks && renderIsolateButton('dependencies')}
          {hasDepLinks && renderIsolateButton('dependents')}
        </div>
      </td>
      <EnvironmentCell
        projectId={row.project.id}
        projectTitle={row.project.title}
        projectType={row.project.type}
        env="client"
        envState={row.environments.client}
        cellStatus={entryStatus?.client ?? null}
        isActive={activeEnvironments.client}
        isFlashing={clientFlashing}
        isRecomputing={isRecomputing}
        isDependency={isDependency}
        hasSelectedDependents={clientHasSelectedDependents}
        chipTonesKey={clientChipTonesKey}
        isolatedChipId={isolatedChipId}
        requiredDeps={clientRequiredDeps}
        optionalDeps={clientOptionalDeps}
        requiredByRefs={clientRequiredByRefs}
        optionalByRefs={clientOptionalByRefs}
        requiresListTestId={
          clientRequiredDeps.length > 0 ? `requires-list-${row.project.id}` : undefined
        }
        optionalListTestId={
          clientOptionalDeps.length > 0 ? `optional-list-${row.project.id}` : undefined
        }
        requiredByListTestId={
          clientHasDepPanel ? `required-by-list-${row.project.id}` : undefined
        }
        onToggleEntrySelection={onToggleEntrySelection}
        onChangeEntryVersion={onChangeEntryVersion}
        onHoverLink={onHoverLink}
        onToggleFocusProject={onToggleFocusProject}
      />
      <EnvironmentCell
        projectId={row.project.id}
        projectTitle={row.project.title}
        projectType={row.project.type}
        env="server"
        envState={row.environments.server}
        cellStatus={entryStatus?.server ?? null}
        isActive={activeEnvironments.server}
        isFlashing={serverFlashing}
        isRecomputing={isRecomputing}
        isDependency={isDependency}
        hasSelectedDependents={serverHasSelectedDependents}
        chipTonesKey={serverChipTonesKey}
        isolatedChipId={isolatedChipId}
        requiredDeps={serverRequiredDeps}
        optionalDeps={serverOptionalDeps}
        requiredByRefs={serverRequiredByRefs}
        optionalByRefs={serverOptionalByRefs}
        requiresListTestId={
          serverRequiredDeps.length > 0
            ? clientRequiredDeps.length > 0
              ? `requires-list-${row.project.id}-server`
              : `requires-list-${row.project.id}`
            : undefined
        }
        optionalListTestId={
          serverOptionalDeps.length > 0
            ? clientOptionalDeps.length > 0
              ? `optional-list-${row.project.id}-server`
              : `optional-list-${row.project.id}`
            : undefined
        }
        requiredByListTestId={
          serverHasDepPanel
            ? clientHasDepPanel
              ? `required-by-list-${row.project.id}-server`
              : `required-by-list-${row.project.id}`
            : undefined
        }
        onToggleEntrySelection={onToggleEntrySelection}
        onChangeEntryVersion={onChangeEntryVersion}
        onHoverLink={onHoverLink}
        onToggleFocusProject={onToggleFocusProject}
      />
    </tr>
  );
}, areEntryRowPropsEqual);

type StatusFilterValue = 'all' | Kind;
export type SortOrder = 'default' | 'asc' | 'desc';

const STATUS_FILTER_OPTIONS: readonly { value: StatusFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'warning', label: 'Warnings' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'ok', label: 'OK' },
] as const;

const SORT_ORDER_OPTIONS: readonly { value: SortOrder; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'asc', label: 'A–Z' },
  { value: 'desc', label: 'Z–A' },
] as const;

function sortTableRows(rows: readonly TableRow[], sortOrder: SortOrder): TableRow[] {
  if (sortOrder === 'default') {
    return [...rows];
  }
  const direction = sortOrder === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      direction *
      a.project.title.localeCompare(b.project.title, undefined, {
        sensitivity: 'base',
        numeric: true,
      }),
  );
}

function doesRowMatchSearch(row: TableRow, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }
  if (row.project.title.toLowerCase().includes(normalizedQuery)) {
    return true;
  }
  if (row.project.slug.toLowerCase().includes(normalizedQuery)) {
    return true;
  }
  for (const env of ENVIRONMENTS) {
    if (
      row.requiredByTitles[env].some((t) => t.toLowerCase().includes(normalizedQuery))
    ) {
      return true;
    }
    if (
      row.requiredDependencies?.[env].some(
        (d) =>
          d.title.toLowerCase().includes(normalizedQuery) ||
          d.id.toLowerCase().includes(normalizedQuery),
      )
    ) {
      return true;
    }
    if (
      row.optionalDependencies?.[env].some(
        (d) =>
          d.title.toLowerCase().includes(normalizedQuery) ||
          d.id.toLowerCase().includes(normalizedQuery),
      )
    ) {
      return true;
    }
  }
  return false;
}

function getRowChipTonesKeys(
  row: TableRow,
  isDependency: boolean,
  activeEnvironments: ActiveEnvironments,
  statuses: ReadonlyMap<string, EntryStatus>,
  tableRowById: ReadonlyMap<string, TableRow>,
): { clientKey: string; serverKey: string } {
  const clientReq = isDependency
    ? resolveRequiredByRefsForEnv(row, 'client')
    : (row.requiredDependencies?.client ?? EMPTY_LINKED_REFS);
  const clientOpt = isDependency
    ? (row.optionalByRefs?.client ?? EMPTY_LINKED_REFS)
    : (row.optionalDependencies?.client ?? EMPTY_LINKED_REFS);
  const serverReq = isDependency
    ? resolveRequiredByRefsForEnv(row, 'server')
    : (row.requiredDependencies?.server ?? EMPTY_LINKED_REFS);
  const serverOpt = isDependency
    ? (row.optionalByRefs?.server ?? EMPTY_LINKED_REFS)
    : (row.optionalDependencies?.server ?? EMPTY_LINKED_REFS);

  return {
    clientKey: computeCellChipTonesKey(
      clientReq,
      clientOpt,
      isDependency,
      'client',
      row.environments.client,
      activeEnvironments.client,
      statuses,
      tableRowById,
    ),
    serverKey: computeCellChipTonesKey(
      serverReq,
      serverOpt,
      isDependency,
      'server',
      row.environments.server,
      activeEnvironments.server,
      statuses,
      tableRowById,
    ),
  };
}

/**
 * Review tables rendering categorized project entries, candidate version selectors,
 * selection checkboxes, status symbols, and dependency relationships.
 */
export function EntryTables({
  tables,
  instance = null,
  entryStatuses,
  targetPlatform = 'fabric',
  activeEnvironments = DEFAULT_ACTIVE_ENVIRONMENTS,
  flashingCells = EMPTY_FLASHING_SET,
  isRecomputing = false,
  environmentTogglesDisabled = false,
  skippedCount,
  onToggleEnvironment,
  onToggleEntrySelection,
  onToggleSelectAll,
  onChangeEntryVersion,
}: EntryTablesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('default');
  const [focusedState, setFocusedState] = useState<{
    rowProjectId: string;
    chipTargetId: string;
  } | null>(null);
  const focusedProjectId = focusedState?.rowProjectId ?? null;
  const focusedChipTargetId = focusedState?.chipTargetId ?? null;

  const tableRowById = useMemo<ReadonlyMap<string, TableRow>>(() => {
    const map = new Map<string, TableRow>();
    for (const table of tables) {
      for (const row of [...table.rows, ...table.dependencies]) {
        map.set(row.project.id, row);
      }
    }
    return map;
  }, [tables]);

  const allTableProjectIds = useMemo<ReadonlySet<string>>(
    () => new Set<string>(tableRowById.keys()),
    [tableRowById],
  );
  const allTableProjectIdsRef = useRef<ReadonlySet<string>>(allTableProjectIds);
  allTableProjectIdsRef.current = allTableProjectIds;

  const handleToggleFocusProject = useCallback(
    (projectId: string, fallbackProjectId?: string) => {
      const targetId =
        allTableProjectIdsRef.current.has(projectId) || !fallbackProjectId
          ? projectId
          : fallbackProjectId;
      setFocusedState((prev) =>
        prev && (prev.chipTargetId === projectId || prev.rowProjectId === targetId)
          ? null
          : { rowProjectId: targetId, chipTargetId: projectId },
      );
    },
    [],
  );

  const handleHoverLink = useCallback((sourceId: string, targetId: string | null) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const prevRows = container.querySelectorAll('tr.entry-row-link-highlighted');
    for (const el of prevRows) {
      el.classList.remove('entry-row-link-highlighted');
      el.removeAttribute('data-link-highlighted');
    }
    if (!targetId) {
      return;
    }
    const allRows = container.querySelectorAll('tr.entry-row');
    for (const rowEl of allRows) {
      const pid = rowEl.getAttribute('data-project-id');
      if (pid === sourceId || pid === targetId) {
        rowEl.classList.add('entry-row-link-highlighted');
        rowEl.setAttribute('data-link-highlighted', 'true');
      }
    }
  }, []);

  const activeEnvironmentIds = useMemo<EnvironmentId[]>(
    () => ENVIRONMENTS.filter((env) => activeEnvironments[env]),
    [activeEnvironments],
  );

  const resolvedEntryStatuses = useMemo<ReadonlyMap<string, EntryStatus>>(() => {
    if (entryStatuses) {
      return entryStatuses;
    }
    if (instance) {
      return computeEntryStatus(instance, activeEnvironmentIds);
    }
    if (tables.length === 0) {
      return new Map<string, EntryStatus>();
    }
    const fallbackInstance: Instance = {
      schemaVersion: CORE_SCHEMA_VERSION,
      meta: {
        name: '',
        source: { collectionId: '', url: '' },
        target: {
          gameVersion: '',
          platform: targetPlatform,
          releasePreference: 'stable',
        },
        createdAt: '',
      },
      entries: tables.flatMap((t) => [
        ...t.rows.map((r) => r.entry),
        ...t.dependencies.map((r) => r.entry),
      ]),
    };
    return computeEntryStatus(fallbackInstance, activeEnvironmentIds);
  }, [entryStatuses, instance, tables, targetPlatform, activeEnvironmentIds]);

  const statusCounts = useMemo<Record<StatusFilterValue, number>>(() => {
    const counts: Record<StatusFilterValue, number> = {
      all: 0,
      error: 0,
      warning: 0,
      unknown: 0,
      ok: 0,
    };
    const seen = new Set<string>();
    for (const table of tables) {
      for (const row of [...table.rows, ...table.dependencies]) {
        if (seen.has(row.project.id)) {
          continue;
        }
        seen.add(row.project.id);
        counts.all += 1;
        const rowKind = resolvedEntryStatuses.get(row.project.id)?.row?.kind;
        if (rowKind) {
          counts[rowKind] += 1;
        }
      }
    }
    return counts;
  }, [tables, resolvedEntryStatuses]);

  const focusedFilterInfo = useMemo<{
    projectId: string;
    title: string;
    allowedIds: ReadonlySet<string>;
    linkedCount: number;
  } | null>(() => {
    if (!focusedProjectId) {
      return null;
    }
    for (const table of tables) {
      for (const row of [...table.rows, ...table.dependencies]) {
        if (row.project.id === focusedProjectId) {
          const allowed = new Set<string>([focusedProjectId]);
          for (const env of ENVIRONMENTS) {
            for (const dep of row.requiredDependencies?.[env] ?? []) {
              allowed.add(dep.id);
            }
            for (const dep of row.optionalDependencies?.[env] ?? []) {
              allowed.add(dep.id);
            }
            for (const depId of row.environments[env].dependencies) {
              allowed.add(depId);
            }
            for (const ref of resolveRequiredByRefsForEnv(row, env)) {
              allowed.add(ref.id);
            }
            for (const ref of row.optionalByRefs?.[env] ?? []) {
              allowed.add(ref.id);
            }
            for (const parentId of row.environments[env].requiredBy) {
              allowed.add(parentId);
            }
          }
          return {
            projectId: focusedProjectId,
            title: row.project.title,
            allowedIds: allowed,
            linkedCount: Math.max(0, allowed.size - 1),
          };
        }
      }
    }
    return null;
  }, [tables, focusedProjectId]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isFilterActive =
    normalizedQuery !== '' || statusFilter !== 'all' || focusedFilterInfo !== null;

  const filteredTables = useMemo<TableModel[]>(() => {
    if (!isFilterActive && sortOrder === 'default') {
      return [...tables];
    }
    const result: TableModel[] = [];
    for (const table of tables) {
      const matchesFilter = (row: TableRow) => {
        if (focusedFilterInfo && !focusedFilterInfo.allowedIds.has(row.project.id)) {
          return false;
        }
        if (!doesRowMatchSearch(row, normalizedQuery)) {
          return false;
        }
        if (statusFilter !== 'all') {
          const rowKind = resolvedEntryStatuses.get(row.project.id)?.row?.kind;
          if (rowKind !== statusFilter) {
            return false;
          }
        }
        return true;
      };

      const rows = sortTableRows(
        isFilterActive ? table.rows.filter(matchesFilter) : table.rows,
        sortOrder,
      );
      const dependencies = sortTableRows(
        isFilterActive ? table.dependencies.filter(matchesFilter) : table.dependencies,
        sortOrder,
      );

      if (rows.length > 0 || dependencies.length > 0) {
        result.push({
          type: table.type,
          rows,
          dependencies,
        });
      }
    }
    return result;
  }, [
    tables,
    isFilterActive,
    sortOrder,
    focusedFilterInfo,
    normalizedQuery,
    statusFilter,
    resolvedEntryStatuses,
  ]);

  if (tables.length === 0) {
    return (
      <div className="empty-tables card">
        {onToggleEnvironment && (
          <EnvironmentTogglesBar
            activeEnvironments={activeEnvironments}
            onToggleEnvironment={onToggleEnvironment}
            disabled={environmentTogglesDisabled}
          />
        )}
        <p>No exportable projects found in this collection.</p>
        {skippedCount !== undefined && skippedCount > 0 && (
          <p className="empty-tables-note">
            {skippedCount} skipped project{skippedCount === 1 ? ' is' : 's are'} listed below.
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="entry-tables card">
      <div className="table-controls-header">
        {onToggleEnvironment && (
          <EnvironmentTogglesBar
            activeEnvironments={activeEnvironments}
            onToggleEnvironment={onToggleEnvironment}
            disabled={environmentTogglesDisabled}
          />
        )}
        <div className="table-filter-bar" role="region" aria-label="Table filters">
          <div className="table-filter-top-row">
            <div className="table-filter-search">
              <input
                type="search"
                className="table-filter-input"
                data-testid="table-filter-search-input"
                aria-label="Filter projects by name"
                placeholder="Search projects or dependencies…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  className="table-filter-clear-btn"
                  aria-label="Clear search filter"
                  onClick={() => setSearchQuery('')}
                >
                  ×
                </button>
              )}
            </div>
            <div className="table-sort-pills" role="group" aria-label="Sort by name">
              <span className="table-sort-label">Sort:</span>
              {SORT_ORDER_OPTIONS.map((opt) => {
                const isSelected = sortOrder === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`table-sort-pill ${isSelected ? 'table-sort-pill-active' : ''}`}
                    data-testid={`sort-order-pill-${opt.value}`}
                    data-sort-order={opt.value}
                    aria-pressed={isSelected}
                    onClick={() => setSortOrder(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="table-filter-bottom-row">
            <div className="table-filter-pills" role="group" aria-label="Filter by status">
              {STATUS_FILTER_OPTIONS.map((opt) => {
                const isSelected = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`table-filter-pill table-filter-pill-${opt.value} ${isSelected ? 'table-filter-pill-active' : ''}`}
                    data-testid={`status-filter-pill-${opt.value}`}
                    data-status-filter={opt.value}
                    aria-pressed={isSelected}
                    onClick={() => setStatusFilter(opt.value)}
                  >
                    <span className="table-filter-pill-label">{opt.label}</span>
                    <span className="table-filter-pill-count">{statusCounts[opt.value]}</span>
                  </button>
                );
              })}
            </div>
            {focusedFilterInfo && (
              <div className="table-focus-banner" data-testid="table-focus-banner">
                <span className="table-focus-banner-label">
                  {`Isolated: ${focusedFilterInfo.title} (+${focusedFilterInfo.linkedCount} linked)`}
                </span>
                <button
                  type="button"
                  className="table-focus-clear-btn"
                  aria-label="Clear isolated project filter"
                  onClick={() => setFocusedState(null)}
                >
                  Show all ×
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {filteredTables.length === 0 ? (
        <div className="empty-filter-state">
          <p>No projects match the current filter.</p>
          <button
            type="button"
            className="btn-secondary table-filter-reset-btn"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setFocusedState(null);
            }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        filteredTables.map((table) => {
          const heading = PROJECT_TYPE_HEADINGS[table.type];
          const clientTriState = instance
            ? getHeaderTriState(instance, table.type, 'client')
            : computeHeaderTriState(table.rows.map((r) => r.environments.client));
          const serverTriState = instance
            ? getHeaderTriState(instance, table.type, 'server')
            : computeHeaderTriState(table.rows.map((r) => r.environments.server));
          const hasSelectableClientRows = table.rows.some((r) =>
            isSelectable(r.environments.client),
          );
          const hasSelectableServerRows = table.rows.some((r) =>
            isSelectable(r.environments.server),
          );

          return (
            <section
              key={table.type}
              className="table-section"
              aria-label={heading}
              data-project-type={table.type}
            >
              <div className="table-section-header">
                <h2>{heading}</h2>
                <div className="table-counts">
                  <span className="badge badge-count">
                    {table.rows.length} {table.rows.length === 1 ? 'entry' : 'entries'}
                  </span>
                  {table.dependencies.length > 0 && (
                    <span className="badge badge-count badge-count-dep">
                      {table.dependencies.length}{' '}
                      {table.dependencies.length === 1 ? 'dependency' : 'dependencies'}
                    </span>
                  )}
                </div>
              </div>

              <div className="table-wrapper">
                <table className="entry-table" aria-label={`${heading} table`}>
                  <thead>
                    <tr>
                      <th scope="col" className="col-status" aria-label="Status">
                        <span className="sr-only">Status</span>
                      </th>
                      <th scope="col" className="col-name">
                        Name
                      </th>
                      <HeaderSelectAllCell
                        env="client"
                        heading={heading}
                        triState={clientTriState}
                        hasSelectableCollectionRows={hasSelectableClientRows}
                        isActive={activeEnvironments.client}
                        isRecomputing={isRecomputing}
                        onActivateEnvironment={() => onToggleEnvironment?.('client', true)}
                        onToggle={(selectAll) =>
                          onToggleSelectAll?.(table.type, 'client', selectAll)
                        }
                      />
                      <HeaderSelectAllCell
                        env="server"
                        heading={heading}
                        triState={serverTriState}
                        hasSelectableCollectionRows={hasSelectableServerRows}
                        isActive={activeEnvironments.server}
                        isRecomputing={isRecomputing}
                        onActivateEnvironment={() => onToggleEnvironment?.('server', true)}
                        onToggle={(selectAll) =>
                          onToggleSelectAll?.(table.type, 'server', selectAll)
                        }
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => {
                      const { clientKey, serverKey } = getRowChipTonesKeys(
                        row,
                        false,
                        activeEnvironments,
                        resolvedEntryStatuses,
                        tableRowById,
                      );
                      return (
                        <EntryTableRow
                          key={row.project.id}
                          row={row}
                          entryStatus={resolvedEntryStatuses.get(row.project.id)}
                          activeEnvironments={activeEnvironments}
                          clientFlashing={flashingCells.has(`${row.project.id}:client`)}
                          serverFlashing={flashingCells.has(`${row.project.id}:server`)}
                          isRecomputing={isRecomputing}
                          isFocused={focusedProjectId === row.project.id}
                          clientChipTonesKey={clientKey}
                          serverChipTonesKey={serverKey}
                          isolatedChipId={focusedChipTargetId}
                          onToggleEntrySelection={onToggleEntrySelection}
                          onChangeEntryVersion={onChangeEntryVersion}
                          onHoverLink={handleHoverLink}
                          onToggleFocusProject={handleToggleFocusProject}
                        />
                      );
                    })}
                  </tbody>
                  {table.dependencies.length > 0 && (
                    <tbody className="dependencies-body">
                      <tr className="dependencies-divider">
                        <th colSpan={4} scope="rowgroup">
                          Dependencies
                        </th>
                      </tr>
                      {table.dependencies.map((depRow) => {
                        const { clientKey, serverKey } = getRowChipTonesKeys(
                          depRow,
                          true,
                          activeEnvironments,
                          resolvedEntryStatuses,
                          tableRowById,
                        );
                        const clientRefs = resolveRequiredByRefsForEnv(depRow, 'client');
                        const serverRefs = resolveRequiredByRefsForEnv(depRow, 'server');
                        const clientHasSelectedDependents = clientRefs.some(
                          (ref) =>
                            (tableRowById.get(ref.id)?.environments.client.selection.on ?? true) ===
                            true,
                        );
                        const serverHasSelectedDependents = serverRefs.some(
                          (ref) =>
                            (tableRowById.get(ref.id)?.environments.server.selection.on ?? true) ===
                            true,
                        );
                        return (
                          <EntryTableRow
                            key={depRow.project.id}
                            row={depRow}
                            entryStatus={resolvedEntryStatuses.get(depRow.project.id)}
                            activeEnvironments={activeEnvironments}
                            clientFlashing={flashingCells.has(`${depRow.project.id}:client`)}
                            serverFlashing={flashingCells.has(`${depRow.project.id}:server`)}
                            isRecomputing={isRecomputing}
                            isDependency
                            clientHasSelectedDependents={clientHasSelectedDependents}
                            serverHasSelectedDependents={serverHasSelectedDependents}
                            isFocused={focusedProjectId === depRow.project.id}
                            clientChipTonesKey={clientKey}
                            serverChipTonesKey={serverKey}
                            isolatedChipId={focusedChipTargetId}
                            onToggleEntrySelection={onToggleEntrySelection}
                            onChangeEntryVersion={onChangeEntryVersion}
                            onHoverLink={handleHoverLink}
                            onToggleFocusProject={handleToggleFocusProject}
                          />
                        );
                      })}
                    </tbody>
                  )}
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
