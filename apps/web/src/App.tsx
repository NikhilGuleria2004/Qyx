import { useState, useEffect } from 'react';
import { ChevronRight, Users, Hash, MessageSquare, Settings, Shield, X } from 'lucide-react';
import { Badge, Command, CommandInput, CommandList, CommandItem } from '@qyx/ui';

function App() {
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'directory' | 'buffer' | 'inspector'>('buffer');
  const [query, setQuery] = useState('');
  const [devices] = useState([
    { id: 'dev_1', device_name: 'MacBook Pro', platform: 'web', status: 'active', pairing_code: 'ABC12345' },
    { id: 'dev_2', device_name: 'iPhone 15', platform: 'ios', status: 'pending', pairing_code: 'XYZ98765' },
  ]);
  const [pairingCode, setPairingCode] = useState('');
  const [authorizePayload, setAuthorizePayload] = useState('');
  const [identityOpen, setIdentityOpen] = useState(false);
  const [localFingerprint, setLocalFingerprint] = useState('');
  const [remoteFingerprint, setRemoteFingerprint] = useState('');
  const [fingerprintMatch, setFingerprintMatch] = useState<boolean | null>(null);
  const [messages] = useState([
    { id: 'msg_1', sender: 'alice.k', timestamp: '09:14:22', content: 'Deploy completed, all green.', reactions: { '+1': ['bob.r'] } },
    { id: 'msg_2', sender: 'bob.r', timestamp: '09:15:01', content: 'nice, watching metrics now', reactions: {} },
    { id: 'msg_3', sender: 'alice.k', timestamp: '09:15:45', content: 'P99 latency looks stable at 120ms', reactions: { 'eyes': ['charlie'] } },
    { id: 'msg_4', sender: 'bob.r', timestamp: '09:16:03', content: 'Here is the report', reactions: {}, attachments: [{ id: 'file_a91c', name: 'quarterly-report.pdf', size_bytes: 2048310, mime_type: 'application/pdf' }] },
  ]);
  const [handshakePhase, setHandshakePhase] = useState<'idle' | 'running' | 'done'>('running');
  const [handshakeLines, setHandshakeLines] = useState<string[]>([]);
  const [typingUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [allowedFileTypes, setAllowedFileTypes] = useState('pdf,docx,xlsx,pptx,png,jpg,mp4');
  const [maxFileSize, setMaxFileSize] = useState(500);
  const [externalSharing, setExternalSharing] = useState(false);
  const [filePolicySaved, setFilePolicySaved] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function computeFingerprint() {
      try {
        const { fingerprint } = await import('@qyx/crypto');
        const sampleKey = new Uint8Array([
          0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
          0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
          0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
          0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
        ]);
        const fp = await fingerprint(sampleKey);
        if (!cancelled) setLocalFingerprint(fp);
      } catch {
        if (!cancelled) setLocalFingerprint('error');
      }
    }
    computeFingerprint();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (handshakePhase !== 'running') return;
    const lines = [
      '> establishing session…',
      '> x25519 key agreement…',
      '> session verified ✓',
    ];
    let i = 0;
    setHandshakeLines([lines[0]]);
    const interval = setInterval(() => {
      i++;
      if (i < lines.length) {
        setHandshakeLines((prev) => [...prev, lines[i]]);
      } else {
        clearInterval(interval);
        setTimeout(() => setHandshakePhase('done'), 400);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [handshakePhase]);

  useEffect(() => {
    async function indexMessages() {
      try {
        const { getSearchIndex } = await import('./searchIndex');
        const index = await getSearchIndex();
        await index.clear();
        for (const msg of messages) {
          await index.add({
            id: msg.id,
            text: msg.content,
            timestamp: Date.now(),
            conversationId: 'conv_1',
            senderId: msg.sender,
          });
        }
      } catch {
        // search index unavailable
      }
    }
    indexMessages();
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    async function doSearch() {
      if (!searchQuery.trim()) {
        if (!cancelled) setSearchResults([]);
        return;
      }
      try {
        const { getSearchIndex } = await import('./searchIndex');
        const index = await getSearchIndex();
        const results = await index.search(searchQuery.trim());
        if (!cancelled) setSearchResults(results.map(r => r.id));
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }
    doSearch();
    return () => { cancelled = true; };
  }, [searchQuery, messages]);

  return (
    <div className="h-screen w-screen bg-void text-text-primary font-mono flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:flex lg:w-64">
          {directoryOpen && (
            <div className="flex h-full w-full flex-col border-r border-hairline bg-surface">
              <div className="flex h-9 items-center border-b border-hairline px-3">
                <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Directory</span>
                <button
                  onClick={() => setDirectoryOpen(false)}
                  className="ml-auto text-text-dim hover:text-text-primary"
                  aria-label="Close directory pane"
                >
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
              </div>
            </div>
          )}
          {!directoryOpen && (
            <button
              onClick={() => setDirectoryOpen(true)}
              className="flex h-full w-8 flex-col items-center justify-center border-r border-hairline bg-surface text-text-dim hover:text-text-primary"
              aria-label="Open directory pane"
            >
              <Settings size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col lg:flex-row">
          <div className={`flex-1 ${mobileView === 'directory' ? 'hidden' : ''} ${mobileView === 'inspector' ? 'hidden' : ''}`}>
          <div className="flex h-full w-full flex-col bg-void">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-sm font-medium text-text-primary">#engineering</span>
              <span className="ml-2 text-xs text-text-dim">12 members</span>
              <div className="ml-auto">
                <input
                  type="text"
                  placeholder="search log…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border border-hairline px-2 py-0.5 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {handshakePhase !== 'done' ? (
                <div className="space-y-1 font-mono text-sm text-signal-cipher">
                  {handshakeLines.map((line, i) => (
                    <div key={i} style={{ animation: 'fadeIn 300ms ease' }}>{line}</div>
                  ))}
                  <span className="inline-block w-2 h-4 bg-signal-cipher animate-pulse" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const groups: { sender: string; timestamp: string; messages: typeof messages }[] = [];
                    let current: { sender: string; timestamp: string; messages: typeof messages } | null = null;
                    for (const msg of messages) {
                      if (searchResults.length > 0 && !searchResults.includes(msg.id)) {
                        continue;
                      }
                      if (current && current.sender === msg.sender) {
                        current.messages.push(msg);
                      } else {
                        current = { sender: msg.sender, timestamp: msg.timestamp, messages: [msg] };
                        groups.push(current);
                      }
                    }
                    return groups.map((group, gi) => (
                      <div key={gi} className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <span>[{group.timestamp}]</span>
                          <span className="font-medium text-text-primary">{group.sender}</span>
                          {typingUsers.includes(group.sender) && <span className="text-text-dim">▏</span>}
                        </div>
                         {group.messages.map((msg, _mi) => (
                           <div key={msg.id} className="text-sm text-text-primary pl-20">
                             {msg.content}
                             {(msg as { attachments?: Array<{ id: string; name: string; size_bytes: number; mime_type: string }> }).attachments?.map((att) => (
                               <div key={att.id} className="mt-1 inline-flex items-center gap-2 border border-hairline bg-raised px-2 py-1 text-xs font-mono">
                                 <span>▤</span>
                                 <span className="text-text-primary">{att.name}</span>
                                 <span className="text-text-dim">{(att.size_bytes / 1024 / 1024).toFixed(1)}MB</span>
                                 <button className="text-text-secondary hover:text-text-primary">↓ download</button>
                               </div>
                             ))}
                             {Object.keys(msg.reactions).length > 0 && (
                               <span className="ml-2 text-xs text-text-dim">
                                 {Object.entries(msg.reactions).map(([emoji, users]) => (
                                   <span key={emoji} className="mr-1">:{emoji}: {users.length}</span>
                                 ))}
                               </span>
                             )}
                           </div>
                         ))}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            <div className="border-t border-hairline p-2">
              <div className="flex items-center gap-2">
                <span className="text-text-dim">&gt;</span>
                <input
                  type="text"
                  placeholder="type a message"
                  className="flex-1 bg-transparent font-mono text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

          <div className="hidden lg:flex lg:w-72">
            {inspectorOpen && (
              <div className="flex h-full w-full flex-col border-l border-hairline bg-surface">
                <div className="flex h-9 items-center border-b border-hairline px-3">
                  <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Inspector</span>
                  <button
                    onClick={() => setInspectorOpen(false)}
                    className="ml-auto text-text-dim hover:text-text-primary"
                    aria-label="Close inspector pane"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-4">
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
                    <div className="text-xs text-text-dim space-y-1">
                      {devices.map((device) => (
                        <div key={device.id} className="flex items-center justify-between">
                          <span className="text-text-primary">{device.device_name}</span>
                          <span className={`text-[10px] ${device.status === 'active' ? 'text-signal-cipher' : 'text-signal-amber'}`}>{device.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1">
                      <input
                        type="text"
                        placeholder="pairing code"
                        value={pairingCode}
                        onChange={(e) => setPairingCode(e.target.value)}
                        className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                      />
                      <input
                        type="text"
                        placeholder="authorization payload"
                        value={authorizePayload}
                        onChange={(e) => setAuthorizePayload(e.target.value)}
                        className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                      />
                      <button className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus">
                        Authorize device
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-text-secondary mb-2">IDENTITY VERIFICATION</div>
                    {!identityOpen ? (
                      <button
                        onClick={() => setIdentityOpen(true)}
                        className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
                      >
                        Verify identity
                      </button>
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
                        <input
                          type="text"
                          placeholder="Paste remote fingerprint"
                          value={remoteFingerprint}
                          onChange={(e) => {
                            setRemoteFingerprint(e.target.value);
                            if (e.target.value.length === 64) {
                              setFingerprintMatch(e.target.value === localFingerprint);
                            } else {
                              setFingerprintMatch(null);
                            }
                          }}
                          className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                        />
                        {fingerprintMatch === true && (
                          <div className="text-xs text-signal-cipher">Fingerprints match — identity verified</div>
                        )}
                        {fingerprintMatch === false && (
                          <div className="text-xs text-signal-amber">Fingerprints do not match — possible MITM</div>
                        )}
                        <button
                          onClick={() => setIdentityOpen(false)}
                          className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-text-secondary mb-2">RECOVERY POLICY</div>
                    <select
                      defaultValue="device_only"
                      className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus"
                    >
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
                        <input
                          type="text"
                          value={allowedFileTypes}
                          onChange={(e) => setAllowedFileTypes(e.target.value)}
                          className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-dim block mb-1">Max file size (MB)</label>
                        <input
                          type="number"
                          value={maxFileSize}
                          onChange={(e) => setMaxFileSize(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="external_sharing"
                          checked={externalSharing}
                          onChange={(e) => setExternalSharing(e.target.checked)}
                          className="h-3 w-3 rounded border-hairline bg-transparent"
                        />
                        <label htmlFor="external_sharing" className="text-xs text-text-primary">Allow external sharing</label>
                      </div>
                      <button
                        onClick={() => {
                          setFilePolicySaved(true);
                          setTimeout(() => setFilePolicySaved(false), 2000);
                        }}
                        className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
                      >
                        Save file policy
                      </button>
                      {filePolicySaved && (
                        <div className="text-[10px] text-signal-cipher">File policy saved</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!inspectorOpen && (
              <button
                onClick={() => setInspectorOpen(true)}
                className="flex h-full w-8 flex-col items-center justify-center border-l border-hairline bg-surface text-text-dim hover:text-text-primary"
                aria-label="Open inspector pane"
              >
                <Shield size={14} />
              </button>
            )}
          </div>
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
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex h-9 items-center border-t border-hairline bg-surface lg:hidden">
        <button
          onClick={() => setMobileView('directory')}
          className={`flex-1 justify-center text-xs ${mobileView === 'directory' ? 'text-signal-cipher' : 'text-text-dim'}`}
          aria-label="Directory"
        >
          <Settings size={14} className="mx-auto mb-0.5" />
        </button>
        <button
          onClick={() => setMobileView('buffer')}
          className={`flex-1 justify-center text-xs ${mobileView === 'buffer' ? 'text-signal-cipher' : 'text-text-dim'}`}
          aria-label="Buffer"
        >
          <MessageSquare size={14} className="mx-auto mb-0.5" />
        </button>
        <button
          onClick={() => setMobileView('inspector')}
          className={`flex-1 justify-center text-xs ${mobileView === 'inspector' ? 'text-signal-cipher' : 'text-text-dim'}`}
          aria-label="Inspector"
        >
          <Shield size={14} className="mx-auto mb-0.5" />
        </button>
      </div>

      <div className="h-7 bg-surface border-t border-hairline flex items-center px-3 text-xs text-text-dim shrink-0">
        <span className="text-signal-cipher mr-2">●</span>
        <span>connected</span>
        <span className="mx-3">│</span>
        <span>e2ee active</span>
        <span className="mx-3">│</span>
        <span className="ml-auto">local</span>
      </div>

      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPaletteOpen(false)} />
          <div className="relative w-full max-w-lg">
            <Command>
              <CommandInput
                placeholder="Type a command or search..."
                value={query}
                onValueChange={setQuery}
                autoFocus
              />
              <CommandList>
                <CommandItem>Jump to conversation...</CommandItem>
                <CommandItem>Open directory</CommandItem>
                <CommandItem>Admin dashboard</CommandItem>
                <CommandItem>Security center</CommandItem>
              </CommandList>
            </Command>
            <button
              onClick={() => setPaletteOpen(false)}
              className="absolute -top-2 -right-2 text-text-dim hover:text-text-primary"
              aria-label="Close command palette"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
