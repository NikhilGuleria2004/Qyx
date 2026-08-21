import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Shell } from './shared/Shell';
import { AdminStyleSidebar } from './shared/AdminStyleSidebar';
import { InspectorPane } from './shared/InspectorPane';

export default function SuperAdminLayout() {
  const role = useAuthStore((s) => s.user?.role);
  return (
    <Shell sidebar={<AdminStyleSidebar basePath="/superadmin" userRole={role} />} inspector={<InspectorPane />}>
      <Outlet />
    </Shell>
  );
}
