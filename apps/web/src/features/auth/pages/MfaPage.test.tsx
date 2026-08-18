import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import MfaPage from './MfaPage';

function renderMfa(initialEntries: string[] = ['/mfa']) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={initialEntries}>
      <MfaPage />
    </MemoryRouter>
  );
}

describe('MfaPage', () => {
  it('renders MFA code input and submit button', () => {
    const html = renderMfa();
    expect(html).toContain('TOTP code');
    expect(html).toContain('Verify');
  });

  it('renders a form element for MFA verification', () => {
    const html = renderMfa();
    expect(html).toContain('<form');
    expect(html).toContain('Enter your MFA code');
  });
});
