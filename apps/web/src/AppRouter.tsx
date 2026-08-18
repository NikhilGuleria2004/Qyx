import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import AuthenticatedLayout from './layouts/AuthenticatedLayout';
import LandingPage from './features/landing/pages/LandingPage';
import LoginPage from './features/auth/pages/LoginPage';
import RegisterPage from './features/auth/pages/RegisterPage';
import MfaPage from './features/auth/pages/MfaPage';
import SsoCallbackPage from './features/auth/pages/SsoCallbackPage';
import OnboardingPage from './features/onboarding/pages/OnboardingPage';
import AppPage from './features/app/pages/AppPage';
import { MembersScreen, GroupsScreen, ChannelsScreen, RequestsScreen, OrgSettingsScreen, SecurityCenterScreen, AuditLogScreen, DevicesScreen, SSOScreen, AlertsScreen } from './features/admin';
import { useAuthStore } from './stores/authStore';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
          <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
          <Route path="/mfa" element={<RequireGuest><MfaPage /></RequireGuest>} />
          <Route path="/auth/sso/:provider/callback" element={<SsoCallbackPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>
        <Route element={<AuthenticatedLayout />}>
          <Route path="/app" element={<RequireAuth><AppPage /></RequireAuth>} />
          <Route path="/app/members" element={<RequireAuth><AdminWrapper component={MembersScreen} /></RequireAuth>} />
          <Route path="/app/groups" element={<RequireAuth><AdminWrapper component={GroupsScreen} /></RequireAuth>} />
          <Route path="/app/channels" element={<RequireAuth><AdminWrapper component={ChannelsScreen} /></RequireAuth>} />
          <Route path="/app/requests" element={<RequireAuth><AdminWrapper component={RequestsScreen} /></RequireAuth>} />
          <Route path="/app/settings" element={<RequireAuth><AdminWrapper component={OrgSettingsScreen} /></RequireAuth>} />
          <Route path="/app/security" element={<RequireAuth><AdminWrapper component={SecurityCenterScreen} /></RequireAuth>} />
          <Route path="/app/audit" element={<RequireAuth><AdminWrapper component={AuditLogScreen} /></RequireAuth>} />
          <Route path="/app/devices" element={<RequireAuth><AdminWrapper component={DevicesScreen} /></RequireAuth>} />
          <Route path="/app/sso" element={<RequireAuth><AdminWrapper component={SSOScreen} /></RequireAuth>} />
          <Route path="/app/alerts" element={<RequireAuth><AdminWrapper component={AlertsScreen} /></RequireAuth>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

type AdminScreenProps = { orgId: string; token: string; onClose: () => void };

function AdminWrapper({ component: Component }: { component: React.ComponentType<AdminScreenProps> }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const orgId = useAuthStore((s) => s.user?.orgId) || '';
  const navigate = useNavigate();

  if (!accessToken || !orgId) {
    return <Navigate to="/login" replace />;
  }

  return <Component orgId={orgId} token={accessToken} onClose={() => navigate('/app')} />;
}
