import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import OnboardingPage from './OnboardingPage';

function renderOnboarding(initialEntries: string[] = ['/onboarding']) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={initialEntries}>
      <OnboardingPage />
    </MemoryRouter>
  );
}

describe('OnboardingPage', () => {
  it('renders onboarding heading', () => {
    const html = renderOnboarding();
    expect(html).toContain('Onboarding');
  });

  it('shows create-org flow by default', () => {
    const html = renderOnboarding();
    expect(html).toContain('Create organization');
  });

  it('shows join-org flow when flow=join', () => {
    const html = renderOnboarding(['/onboarding?flow=join']);
    expect(html).toContain('Join organization');
  });

  it('shows invite code input in join flow', () => {
    const html = renderOnboarding(['/onboarding?flow=join']);
    expect(html).toContain('enter invite code');
  });

  it('shows domain search in join flow', () => {
    const html = renderOnboarding(['/onboarding?flow=join']);
    expect(html).toContain('search by domain');
  });
});
