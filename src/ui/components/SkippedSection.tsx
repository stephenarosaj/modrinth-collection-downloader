import type { SkippedProject } from '../../core';

/** Props for {@link SkippedSection}. */
export interface SkippedSectionProps {
  skipped: readonly SkippedProject[];
}

/**
 * Renders a list of collection projects that cannot be exported (such as modpacks
 * or projects where version lookups failed) alongside clear user explanations.
 */
export function SkippedSection({ skipped }: SkippedSectionProps) {
  if (skipped.length === 0) {
    return null;
  }

  return (
    <section className="skipped-section card" aria-label="Skipped Projects">
      <div className="skipped-header">
        <h2>Skipped Projects</h2>
        <span className="badge badge-count">{skipped.length}</span>
      </div>
      <ul className="skipped-list">
        {skipped.map((item) => (
          <li key={item.id} className="skipped-item" data-skipped-id={item.id}>
            <div className="skipped-item-main">
              <span className="skipped-title">{item.title}</span>
              <span className="badge badge-skipped-type">{item.type}</span>
              {item.modrinthUrl && item.modrinthUrl.trim().length > 0 && (
                <a
                  href={item.modrinthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modrinth-link"
                  aria-label={`Open ${item.title} on Modrinth`}
                >
                  Open on Modrinth ↗
                </a>
              )}
            </div>
            <p className="skipped-reason">{item.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
