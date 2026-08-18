import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';

function renderLanding(initialEntries: string[] = ['/']) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={initialEntries}>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  it('renders product name and description', () => {
    const html = renderLanding();
    expect(html).toContain('qyx');
    expect(html).toContain('Organization-centric communications platform');
  });

  it('renders feature list', () => {
    const html = renderLanding();
    expect(html).toContain('identity');
    expect(html).toContain('access-control');
    expect(html).toContain('isolation');
    expect(html).toContain('audit');
    expect(html).toContain('devices');
    expect(html).toContain('files');
  });

  it('renders CTAs to register and login', () => {
    const html = renderLanding();
    expect(html).toContain('Get started');
    expect(html).toContain('Sign in');
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
  });

  it('does not contain premature E2EE or zero-knowledge claims', () => {
    const html = renderLanding().toLowerCase();
    expect(html).not.toContain('end-to-end encryption');
    expect(html).not.toContain('e2ee');
    expect(html).not.toContain('zero-knowledge');
    expect(html).not.toContain('server cannot read');
  });
});
