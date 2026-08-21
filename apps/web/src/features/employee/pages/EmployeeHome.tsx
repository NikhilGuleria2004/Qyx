import { RoleMismatchBanner } from '../../../layouts/shared/RoleMismatchBanner';
import AppPage from '../../app/pages/AppPage';

export default function EmployeeHome() {
  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <RoleMismatchBanner />
      <div className="flex-1 overflow-hidden">
        <AppPage />
      </div>
    </div>
  );
}
