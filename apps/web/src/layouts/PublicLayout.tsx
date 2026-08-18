import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="h-screen w-screen bg-void text-text-primary font-mono flex flex-col">
      <Outlet />
    </div>
  );
}
