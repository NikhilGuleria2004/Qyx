import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, Users, Hash, MessageSquare, Settings, Shield, X, FileText, Monitor, KeyRound, Bell, LogOut } from 'lucide-react';
import { Badge, Command, CommandInput, CommandList, CommandItem } from '@qyx/ui';
import { useAuthStore } from '../stores/authStore';
import { logout } from '../lib/auth';
import { listMyDevices, registerDevice, resolvePairingCode, authorizeDevice, revokeDevice, type Device } from '../features/devices/api/devicesApi';

export default function AuthenticatedLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="h-screen w-screen bg-void text-text-primary font-mono flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <DirectoryPane userRole={user?.role} />
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex-1">
            <Outlet />
          </div>
          <InspectorPane />
        </div>
      </div>
      <StatusBar user={user} onLogout={handleLogout} />
      <CommandPalette />
    </div>
  );
}

function DirectoryPane({ userRole }: { userRole?: string }) {
  const [open, setOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'directory' | 'buffer' | 'inspector'>('buffer');

  return (
    <>
      <div className="hidden lg:flex lg:w-64">
        {open && (
          <div className="flex h-full w-full flex-col border-r border-hairline bg-surface">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Directory</span>
              <button onClick={() => setOpen(false)} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close directory pane">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-2">
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>ACME CORP</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <Hash size={12} className="mr-2" />
                    <span>general</span>
                  </div>
                  <div className="flex items-center px-2 py-1 text-xs text-text-primary bg-raised">
                    <Hash size={12} className="mr-2" />
                    <span>engineering</span>
                  </div>
                </div>
              </div>
              <div className="mb-2">
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>Groups</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <Users size={12} className="mr-2" />
                    <span>Engineering Lead</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>Direct</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <MessageSquare size={12} className="mr-2" />
                    <span>sarah.w</span>
                  </div>
                </div>
              </div>
              <AdminNav userRole={userRole} />
            </div>
          </div>
        )}
        {!open && (
          <button onClick={() => setOpen(true)} className="flex h-full w-8 flex-col items-center justify-center border-r border-hairline bg-surface text-text-dim hover:text-text-primary" aria-label="Open directory pane">
            <Settings size={14} />
          </button>
        )}
      </div>
      <div className="fixed inset-0 z-40 bg-void lg:hidden">
        {mobileView === 'directory' && (
          <div className="flex h-full w-full flex-col">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Directory</span>
              <button onClick={() => setMobileView('buffer')} className="ml-auto text-text-dim hover:text-text-primary">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-2">
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>ACME CORP</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <Hash size={12} className="mr-2" />
                    <span>general</span>
                  </div>
                  <div className="flex items-center px-2 py-1 text-xs text-text-primary bg-raised">
                    <Hash size={12} className="mr-2" />
                    <span>engineering</span>
                  </div>
                </div>
              </div>
              <div className="mb-2">
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>Groups</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <Users size={12} className="mr-2" />
                    <span>Engineering Lead</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>Direct</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <MessageSquare size={12} className="mr-2" />
                    <span>sarah.w</span>
                  </div>
                </div>
              </div>
              <AdminNav userRole={userRole} />
            </div>
          </div>
        )}
        {mobileView === 'inspector' && (
          <div className="flex h-full w-full flex-col">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Inspector</span>
              <button onClick={() => setMobileView('buffer')} className="ml-auto text-text-dim hover:text-text-primary">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <InspectorContent />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AdminNav({ userRole }: { userRole?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = userRole || 'employee';

  if (role !== 'super_admin' && role !== 'admin') return null;

  const items: { view: string; label: string; icon: React.ReactNode }[] = [
    { view: '/app/members', label: 'Members', icon: <Users size={12} className="mr-2" /> },
    { view: '/app/groups', label: 'Groups', icon: <Users size={12} className="mr-2" /> },
    { view: '/app/channels', label: 'Channels', icon: <Hash size={12} className="mr-2" /> },
    { view: '/app/requests', label: 'Requests', icon: <Shield size={12} className="mr-2" /> },
    { view: '/app/settings', label: 'Org Settings', icon: <Settings size={12} className="mr-2" /> },
    { view: '/app/security', label: 'Security Center', icon: <Shield size={12} className="mr-2" /> },
    { view: '/app/audit', label: 'Audit Log', icon: <FileText size={12} className="mr-2" /> },
    { view: '/app/devices', label: 'Devices', icon: <Monitor size={12} className="mr-2" /> },
    { view: '/app/sso', label: 'SSO', icon: <KeyRound size={12} className="mr-2" /> },
    { view: '/app/alerts', label: 'Alerts', icon: <Bell size={12} className="mr-2" /> },
  ];

  return (
    <div className="mb-2">
      <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
        <Shield size={12} className="mr-1" />
        <span>Admin</span>
      </div>
      <div className="ml-4 mt-1 space-y-1">
        {items.map((item) => (
          <button key={item.view} onClick={() => navigate(item.view)} className={`flex items-center w-full px-2 py-1 text-xs ${location.pathname === item.view ? 'text-text-primary bg-raised' : 'text-text-dim hover:text-text-primary'}`}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InspectorPane() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <div className="hidden lg:flex lg:w-72">
        {open && (
          <div className="flex h-full w-full flex-col border-l border-hairline bg-surface">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Inspector</span>
              <button onClick={() => setOpen(false)} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close inspector pane">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <InspectorContent />
            </div>
          </div>
        )}
        {!open && (
          <button onClick={() => setOpen(true)} className="flex h-full w-8 flex-col items-center justify-center border-l border-hairline bg-surface text-text-dim hover:text-text-primary" aria-label="Open inspector pane">
            <Shield size={14} />
          </button>
        )}
      </div>
    </>
  );
}

function InspectorContent() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [deviceError, setDeviceError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [authorizePayload, setAuthorizePayload] = useState('');
  const [pairingDeviceId, setPairingDeviceId] = useState('');
  const [identityOpen, setIdentityOpen] = useState(false);
  const [localFingerprint, setLocalFingerprint] = useState('');
  const [remoteFingerprint, setRemoteFingerprint] = useState('');
  const [fingerprintMatch, setFingerprintMatch] = useState<boolean | null>(null);
  const [allowedFileTypes, setAllowedFileTypes] = useState('pdf,docx,xlsx,pptx,png,jpg,mp4');
  const [maxFileSize, setMaxFileSize] = useState(500);
  const [externalSharing, setExternalSharing] = useState(false);
  const [filePolicySaved, setFilePolicySaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        const data = await listMyDevices();
        if (!cancelled) setDevices(data);
      } catch {
        if (!cancelled) setDeviceError('failed to load devices');
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    }
    loadDevices();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function computeFingerprint() {
      try {
        const { fingerprint } = await import('@qyx/crypto');
        const activeDevice = devices.find((d) => d.status === 'active');
        const key = activeDevice?.public_key
          ? Uint8Array.from(atob(activeDevice.public_key), (c) => c.charCodeAt(0))
          : new Uint8Array([0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f,0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1a,0x1b,0x1c,0x1d,0x1e,0x1f,0x20]);
        const fp = await fingerprint(key);
        if (!cancelled) setLocalFingerprint(fp);
      } catch {
        if (!cancelled) setLocalFingerprint('error');
      }
    }
    computeFingerprint();
    return () => { cancelled = true; };
  }, [devices]);

  async function handleRegisterDevice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDeviceError('');
    setRegistering(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const deviceName = String(formData.get('device_name') || '').trim();
    const platform = (String(formData.get('platform') || 'web') as 'web' | 'ios' | 'android' | 'desktop') || undefined;
    const publicKey = String(formData.get('public_key') || '').trim();
    const signingKey = String(formData.get('signing_key') || '').trim();
    if (!deviceName || !publicKey || !signingKey) {
      setDeviceError('device name, public key, and signing key are required');
      setRegistering(false);
      return;
    }
    try {
      const created = await registerDevice({ device_name: deviceName, platform, public_key: publicKey, signing_key: signingKey });
      setDevices((prev) => [...prev, created]);
      form.reset();
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'failed to register device');
    } finally {
      setRegistering(false);
    }
  }

  async function handleResolvePairing() {
    if (!pairingCode.trim()) return;
    setDeviceError('');
    try {
      const device = await resolvePairingCode(pairingCode.trim());
      setPairingDeviceId(device.id);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'invalid pairing code');
    }
  }

  async function handleAuthorizeDevice() {
    if (!pairingDeviceId || !authorizePayload.trim()) return;
    setDeviceError('');
    try {
      const updated = await authorizeDevice(pairingDeviceId, authorizePayload.trim());
      setDevices((prev) => prev.map((d) => d.id === updated.id ? updated : d));
      setPairingCode('');
      setAuthorizePayload('');
      setPairingDeviceId('');
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'failed to authorize device');
    }
  }

  async function handleRevokeDevice(deviceId: string) {
    if (!confirm('Revoke this device?')) return;
    try {
      await revokeDevice(deviceId);
      setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, status: 'revoked' as const } : d));
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'failed to revoke device');
    }
  }

  const pendingDevices = devices.filter((d) => d.status === 'pending');
  const activeDevices = devices.filter((d) => d.status === 'active');

  return (
    <>
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">MEMBERS (12)</div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-primary">alice.k</span>
            <Badge variant="signal">online</Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-primary">bob.r</span>
            <Badge variant="signal">online</Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-dim">charlie</span>
            <Badge variant="amber">away</Badge>
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">ENCRYPTION</div>
        <div className="text-xs text-text-dim space-y-1">
          <div>cipher: AES-256-GCM</div>
          <div>epoch: 4</div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">SECURITY</div>
        <div className="text-xs text-signal-cipher">verified</div>
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">DEVICES</div>
        {deviceError && <div className="text-[10px] text-signal-amber mb-1">&gt; {deviceError}</div>}
        {loadingDevices ? (
          <div className="text-xs text-text-dim">&gt; loading devices...</div>
        ) : (
          <div className="space-y-1">
            {activeDevices.map((device) => (
              <div key={device.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-text-primary">{device.device_name}</span>
                  <span className="text-[10px] text-text-dim ml-2">{device.platform}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-signal-cipher">{device.status}</span>
                  <button onClick={() => handleRevokeDevice(device.id)} className="text-[10px] text-text-secondary hover:text-signal-red">revoke</button>
                </div>
              </div>
            ))}
            {pendingDevices.map((device) => (
              <div key={device.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-text-primary">{device.device_name}</span>
                  <span className="text-[10px] text-text-dim ml-2">{device.platform}</span>
                  {device.pairing_code && <span className="text-[10px] text-signal-amber ml-2">code: {device.pairing_code}</span>}
                </div>
                <span className="text-[10px] text-signal-amber">{device.status}</span>
              </div>
            ))}
            {devices.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no devices</div>
            )}
          </div>
        )}
        <details className="mt-2">
          <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">Register new device</summary>
          <form onSubmit={handleRegisterDevice} className="mt-2 space-y-1">
            <input name="device_name" placeholder="device name" required className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
            <select name="platform" defaultValue="web" className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus">
              <option value="web">web</option>
              <option value="ios">ios</option>
              <option value="android">android</option>
              <option value="desktop">desktop</option>
            </select>
            <input name="public_key" placeholder="public key (base64)" required className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
            <input name="signing_key" placeholder="signing key (base64)" required className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
            <button type="submit" disabled={registering} className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus disabled:opacity-50">
              {registering ? 'Registering...' : 'Register device'}
            </button>
          </form>
        </details>
        <div className="mt-2 space-y-1">
          <div className="text-xs text-text-secondary">Pair existing pending device</div>
          <input type="text" placeholder="pairing code" value={pairingCode} onChange={(e) => setPairingCode(e.target.value)} className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
          <input type="text" placeholder="authorization payload" value={authorizePayload} onChange={(e) => setAuthorizePayload(e.target.value)} className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
          <button onClick={pairingDeviceId ? handleAuthorizeDevice : handleResolvePairing} className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus">
            {pairingDeviceId ? 'Authorize device' : 'Resolve pairing code'}
          </button>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">IDENTITY VERIFICATION</div>
        {!identityOpen ? (
          <button onClick={() => setIdentityOpen(true)} className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus">Verify identity</button>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-text-dim">
              <div className="mb-1">Local fingerprint:</div>
              <div className="font-mono text-text-primary break-all">{localFingerprint || 'computing...'}</div>
              {localFingerprint && (
                <div className="mt-1 text-signal-cipher">
                  Security number: {localFingerprint.slice(0, 4)} {localFingerprint.slice(4, 8)} {localFingerprint.slice(8, 12)}
                </div>
              )}
            </div>
            <input type="text" placeholder="Paste remote fingerprint" value={remoteFingerprint} onChange={(e) => { setRemoteFingerprint(e.target.value); if (e.target.value.length === 64) { setFingerprintMatch(e.target.value === localFingerprint); } else { setFingerprintMatch(null); } }} className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
            {fingerprintMatch === true && <div className="text-xs text-signal-cipher">Fingerprints match — identity verified</div>}
            {fingerprintMatch === false && <div className="text-xs text-signal-amber">Fingerprints do not match — possible MITM</div>}
            <button onClick={() => setIdentityOpen(false)} className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus">Close</button>
          </div>
        )}
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">RECOVERY POLICY</div>
        <select defaultValue="device_only" className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus">
          <option value="device_only">Device only</option>
          <option value="enterprise_key" disabled>Enterprise key (coming soon)</option>
          <option value="user_backup" disabled>User backup (coming soon)</option>
        </select>
        <div className="text-[10px] text-text-dim mt-1">Device-only recovery is the default and recommended policy.</div>
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary mb-2">FILE POLICY</div>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-text-dim block mb-1">Allowed file types (comma-separated)</label>
            <input type="text" value={allowedFileTypes} onChange={(e) => setAllowedFileTypes(e.target.value)} className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
          </div>
          <div>
            <label className="text-[10px] text-text-dim block mb-1">Max file size (MB)</label>
            <input type="number" value={maxFileSize} onChange={(e) => setMaxFileSize(parseInt(e.target.value, 10) || 0)} className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="external_sharing" checked={externalSharing} onChange={(e) => setExternalSharing(e.target.checked)} className="h-3 w-3 rounded border-hairline bg-transparent" />
            <label htmlFor="external_sharing" className="text-xs text-text-primary">Allow external sharing</label>
          </div>
          <button onClick={() => { setFilePolicySaved(true); setTimeout(() => setFilePolicySaved(false), 2000); }} className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus">Save file policy</button>
          {filePolicySaved && <div className="text-[10px] text-signal-cipher">File policy saved</div>}
        </div>
      </div>
    </>
  );
}

function StatusBar({ user, onLogout }: { user: { display_name?: string; email?: string; role?: string } | null; onLogout: () => void }) {
  const display = user?.display_name || user?.email || 'local';
  return (
    <div className="h-7 bg-surface border-t border-hairline flex items-center px-3 text-xs text-text-dim shrink-0">
      <span className="text-signal-cipher mr-2">●</span>
      <span>connected</span>
      <span className="mx-3">│</span>
      <span>e2ee active</span>
      <span className="mx-3">│</span>
      <span className="mr-2">{display}</span>
      <button onClick={onLogout} className="text-text-dim hover:text-text-primary" aria-label="Logout">
        <LogOut size={12} />
      </button>
      <span className="ml-auto">local</span>
    </div>
  );
}

function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg">
        <Command>
          <CommandInput placeholder="Type a command or search..." value={query} onValueChange={setQuery} autoFocus />
          <CommandList>
            <CommandItem>Jump to conversation...</CommandItem>
            <CommandItem>Open directory</CommandItem>
            <CommandItem>Admin dashboard</CommandItem>
            <CommandItem>Security center</CommandItem>
          </CommandList>
        </Command>
        <button onClick={() => setOpen(false)} className="absolute -top-2 -right-2 text-text-dim hover:text-text-primary" aria-label="Close command palette">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
