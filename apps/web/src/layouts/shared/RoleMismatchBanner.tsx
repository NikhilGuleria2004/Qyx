import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BUCKET_LABEL, type RoleBucket } from '../../lib/roles';

export function useOneTimeLocationBanner<T>(key: string): T | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [value] = useState<T | null>((location.state as Record<string, unknown> | null)?.[key] as T ?? null);

  useEffect(() => {
    if (value !== null) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // run once on mount only
  }, []);

  return value;
}

export function RoleMismatchBanner() {
  const mismatch = useOneTimeLocationBanner<{ selected: RoleBucket; actual: RoleBucket }>('roleMismatch');
  if (!mismatch) return null;
  return (
    <div className="border border-signal-amber/40 bg-signal-amber/10 px-3 py-2 text-xs text-signal-amber">
      You selected {BUCKET_LABEL[mismatch.selected]}, but this account is a {BUCKET_LABEL[mismatch.actual]} account. We've signed you in to your {BUCKET_LABEL[mismatch.actual]} home.
    </div>
  );
}
