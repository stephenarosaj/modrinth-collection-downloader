import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/app/config';
import { App } from '../src/ui/App';

describe('App scaffold', () => {
  it('renders APP_NAME and upstream attribution links in the footer', () => {
    render(<App appName={APP_NAME} />);

    expect(screen.getByRole('heading', { name: APP_NAME })).toBeInTheDocument();

    const repoLink = screen.getByRole('link', {
      name: /DanyCDev\/modrinth-collection-web-download/i,
    });
    expect(repoLink).toHaveAttribute(
      'href',
      'https://github.com/DanyCDev/modrinth-collection-web-download',
    );

    const liveLink = screen.getByRole('link', { name: /md\.dkg\.sk/i });
    expect(liveLink).toHaveAttribute('href', 'https://md.dkg.sk/');
  });
});
