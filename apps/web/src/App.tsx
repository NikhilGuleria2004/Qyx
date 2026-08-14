import { useState, useEffect } from 'react';
import { ChevronRight, Users, Hash, MessageSquare, Settings, Shield, X } from 'lucide-react';
import { Badge, Command, CommandInput, CommandList, CommandItem } from '@qyx/ui';

function App() {
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'directory' | 'buffer' | 'inspector'>('buffer');
  const [query, setQuery] = useState('');

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
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <span>[09:14]</span>
                      <span className="font-medium text-text-primary">alice.k</span>
                    </div>
                    <div className="mt-1 text-sm text-text-primary">
                      Deploy completed, all green.
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <span>[09:15]</span>
                      <span className="font-medium text-text-primary">bob.r</span>
                    </div>
                    <div className="mt-1 text-sm text-text-primary">
                      nice, watching metrics now
                    </div>
                  </div>
                  <div className="text-xs text-text-dim">▏ (typing…)</div>
                </div>
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
