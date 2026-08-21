import { useNavigate } from 'react-router-dom';
import { RoleMismatchBanner } from '../../../layouts/shared/RoleMismatchBanner';
import AppPage from '../../app/pages/AppPage';
import { logout } from '../../../lib/auth';

export default function EmployeeHome() {
  const navigate = useNavigate();
  async function handleLogout() { await logout(); navigate('/login'); }
  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex items-center justify-between p-3">
        <RoleMismatchBanner />
        <button onClick={handleLogout} className="text-xs text-text-dim hover:text-text-primary border border-hairline rounded px-2 py-1">Logout</button>
      </div>
      <div className="flex-1 overflow-hidden">
        <AppPage />
      </div>
    </div>
  );
}
