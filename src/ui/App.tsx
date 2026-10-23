import { CORE_SCHEMA_VERSION } from '../core';

export interface AppProps {
  appName?: string;
}

export function App({ appName = 'modrinth-collection-downloader' }: AppProps) {
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

      <main className="card">
        <p>Collection instance builder scaffold ready.</p>
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
