import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

function renderLogin(initialEntries: string[] = ['/login']) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={initialEntries}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  it('renders login form fields', () => {
    const html = renderLogin();
    expect(html).toContain('Email');
    expect(html).toContain('Password');
    expect(html).toContain('Device name');
  });

  it('renders submit button and register link', () => {
    const html = renderLogin();
    expect(html).toContain('Sign in');
    expect(html).toContain('href="/register"');
    expect(html).toContain('Register');
  });

  it('renders SSO section', () => {
    const html = renderLogin();
    expect(html).toContain('sign in with SSO');
    expect(html).toContain('Organization ID');
    expect(html).toContain('Provider');
  });

  it('renders a form element for login', () => {
    const html = renderLogin();
    expect(html).toContain('<form');
    expect(html).toContain('Sign in to your workspace');
  });
});
