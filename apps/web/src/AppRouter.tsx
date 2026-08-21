import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import SuperAdminLayout from './layouts/SuperAdminLayout';
import AdminLayout from './layouts/AdminLayout';
import EmployeeLayout from './layouts/EmployeeLayout';
import LandingPage from './features/landing/pages/LandingPage';
import LoginPage from './features/auth/pages/LoginPage';
import RegisterPage from './features/auth/pages/RegisterPage';
import MfaPage from './features/auth/pages/MfaPage';
import SsoCallbackPage from './features/auth/pages/SsoCallbackPage';
import OnboardingPage from './features/onboarding/pages/OnboardingPage';
import SuperAdminHome from './features/superadmin/pages/SuperAdminHome';
import AdminHome from './features/admin/pages/AdminHome';
import EmployeeHome from './features/employee/pages/EmployeeHome';
import { MembersScreen, GroupsScreen, ChannelsScreen, RequestsScreen, OrgSettingsScreen, SecurityCenterScreen, AuditLogScreen, DevicesScreen, SSOScreen, AlertsScreen } from './features/admin';
import { ADMIN_NAV_ITEMS } from './lib/roles';
import { useAuthStore } from './stores/authStore';
import { RequireGuest, RequireBucket, RequirePermission, HomeRedirect } from './routeGuards';

type AdminScreenProps = { orgId: string; token: string; onClose: () => void };

function AdminScreenWrapper({ component: Component }: { component: React.ComponentType<AdminScreenProps> }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const orgId = useAuthStore((s) => s.user?.orgId) || '';
  const navigate = useNavigate();

  if (!accessToken || !orgId) {
    return <Navigate to="/login" replace />;
  }

  return <Component orgId={orgId} token={accessToken} onClose={() => navigate('/admin')} />;
}

const ADMIN_SCREEN_MAP: Record<string, React.ComponentType<AdminScreenProps>> = {
  '/admin/members': MembersScreen,
  '/admin/groups': GroupsScreen,
  '/admin/channels': ChannelsScreen,
  '/admin/requests': RequestsScreen,
  '/admin/settings': OrgSettingsScreen,
  '/admin/security': SecurityCenterScreen,
  '/admin/audit': AuditLogScreen,
  '/admin/devices': DevicesScreen,
  '/admin/sso': SSOScreen,
  '/admin/alerts': AlertsScreen,
};

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

        <Route element={<RequireBucket bucket="superadmin"><SuperAdminLayout /></RequireBucket>}>
          <Route path="/superadmin" element={<SuperAdminHome />} />
          {ADMIN_NAV_ITEMS.map((item) => {
            const superAdminPath = item.path.replace('/admin', '/superadmin');
            const ScreenComponent = ADMIN_SCREEN_MAP[item.path];
            if (!ScreenComponent) return null;
            return (
              <Route key={superAdminPath} path={superAdminPath} element={<AdminScreenWrapper component={ScreenComponent} />} />
            );
          })}
        </Route>

        <Route element={<RequireBucket bucket="admin"><AdminLayout /></RequireBucket>}>
          <Route path="/admin" element={<AdminHome />} />
          {ADMIN_NAV_ITEMS.map((item) => (
            <Route key={item.path} path={item.path.replace('/admin', '')} element={
              <RequirePermission permission={item.permission}>
                <AdminScreenWrapper component={ADMIN_SCREEN_MAP[item.path]} />
              </RequirePermission>
            } />
          ))}
        </Route>

        <Route element={<RequireBucket bucket="employee"><EmployeeLayout /></RequireBucket>}>
          <Route path="/employee" element={<EmployeeHome />} />
        </Route>

        <Route path="/app" element={<HomeRedirect />} />
        <Route path="/app/*" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
