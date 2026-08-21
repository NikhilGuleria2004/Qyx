import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Shell } from './shared/Shell';
import { DirectoryPane } from './shared/DirectoryPane';

export default function EmployeeLayout() {
  const role = useAuthStore((s) => s.user?.role);
  return (
    <Shell sidebar={<DirectoryPane userRole={role} />}>
      <Outlet />
    </Shell>
  );
}
