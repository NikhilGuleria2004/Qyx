import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';

function renderRegister(initialEntries: string[] = ['/register']) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={initialEntries}>
      <RegisterPage />
    </MemoryRouter>
  );
}

describe('RegisterPage', () => {
  it('renders create-org form by default', () => {
    const html = renderRegister();
    expect(html).toContain('Organization name');
    expect(html).toContain('Domain');
    expect(html).toContain('Display name');
    expect(html).toContain('Email');
    expect(html).toContain('Password');
    expect(html).not.toContain('Invite code');
    expect(html).not.toContain('Confirm password');
  });

  it('renders submit button and login link', () => {
    const html = renderRegister();
    expect(html).toContain('Create account');
    expect(html).toContain('href="/login"');
    expect(html).toContain('Sign in');
  });

  it('renders a form element for registration', () => {
    const html = renderRegister();
    expect(html).toContain('<form');
    expect(html).toContain('Create your organization and account');
  });

  it('renders flow toggle tabs', () => {
    const html = renderRegister();
    expect(html).toContain('Create org');
    expect(html).toContain('Join with invite');
  });

  it('shows invite fields when join flow is active', () => {
    const html = renderRegister(['/register?flow=join']);
    expect(html).toContain('Invite code');
    expect(html).toContain('Confirm password');
    expect(html).not.toContain('Organization name');
  });
});
