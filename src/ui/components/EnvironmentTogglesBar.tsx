import type { EnvironmentId } from '../../core';

/** Active state for each environment review column (`client` and `server`). */
export type ActiveEnvironments = Record<EnvironmentId, boolean>;

/** Props for {@link EnvironmentTogglesBar}. */
export interface EnvironmentTogglesBarProps {
  activeEnvironments: ActiveEnvironments;
  onToggleEnvironment: (env: EnvironmentId, active: boolean) => void;
  disabled?: boolean;
}

/**
 * Toolbar controlling active Client and Server review lanes. Both default to off,
 * gating interactivity, status evaluation, and environment zip exports.
 */
export function EnvironmentTogglesBar({
  activeEnvironments,
  onToggleEnvironment,
  disabled = false,
}: EnvironmentTogglesBarProps) {
  return (
    <section className="env-toggles-bar" aria-label="Environment toggles">
      <div className="env-toggles-info">
        <h3>Target Environments</h3>
        <p>
          Enable an environment to customize its selections and versions. Disabled environments
          remain read-only while preserving their underlying selections.
        </p>
      </div>
      <div className="env-toggles-controls">
        <label
          htmlFor="toggle-env-client"
          className={`env-toggle-pill ${activeEnvironments.client ? 'env-toggle-pill-active' : ''}`}
        >
          <input
            id="toggle-env-client"
            type="checkbox"
            checked={activeEnvironments.client}
            disabled={disabled}
            onChange={(e) => onToggleEnvironment('client', e.target.checked)}
          />
          <span>Client environment</span>
        </label>

        <label
          htmlFor="toggle-env-server"
          className={`env-toggle-pill ${activeEnvironments.server ? 'env-toggle-pill-active' : ''}`}
        >
          <input
            id="toggle-env-server"
            type="checkbox"
            checked={activeEnvironments.server}
            disabled={disabled}
            onChange={(e) => onToggleEnvironment('server', e.target.checked)}
          />
          <span>Server environment</span>
        </label>
      </div>
    </section>
  );
}
