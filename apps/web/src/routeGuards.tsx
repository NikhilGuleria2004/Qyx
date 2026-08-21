import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { verifyRole } from './lib/auth';
import { ROLE_HOME_PATH, bucketOf, can, type RoleBucket } from './lib/roles';

function FullScreenSpinner() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-void text-text-primary">
      <div className="text-xs text-text-dim">Loading…</div>
    </div>
  );
}

export function RequireGuest({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (accessToken && user) {
    const bucket = bucketOf(user.role);
    return <Navigate to={ROLE_HOME_PATH[bucket]} replace />;
  }
  return <>{children}</>;
}

export function RequireBucket({ bucket, children }: { bucket: RoleBucket; children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const meVerifiedAt = useAuthStore((s) => s.meVerifiedAt);
  const [checking, setChecking] = useState(true);
  const [resolvedBucket, setResolvedBucket] = useState<RoleBucket | null>(user ? bucketOf(user.role) : null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const stale = !meVerifiedAt || Date.now() - meVerifiedAt > 60_000;
      if (accessToken && stale) {
        const verified = await verifyRole();
        if (!cancelled) setResolvedBucket(verified);
      }
      if (!cancelled) setChecking(false);
    }
    check();
    return () => { cancelled = true; };
  }, [accessToken, meVerifiedAt]);

  if (!accessToken) return <Navigate to="/login" replace />;
  if (checking) return <FullScreenSpinner />;
  if (!resolvedBucket) return <Navigate to="/login" replace />;
  if (resolvedBucket !== bucket) return <Navigate to={ROLE_HOME_PATH[resolvedBucket]} replace />;
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user || !can(user.role, permission)) {
    return <Navigate to="/admin" replace />;
  }
  return <>{children}</>;
}

export function HomeRedirect() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken || !user) {
    return <Navigate to="/login" replace />;
  }
  const bucket = bucketOf(user.role);
  return <Navigate to={ROLE_HOME_PATH[bucket]} replace />;
}
