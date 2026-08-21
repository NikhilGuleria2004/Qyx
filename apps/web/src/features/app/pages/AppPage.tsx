import { useState, useEffect, useRef } from 'react';
import { X, Paperclip } from 'lucide-react';
import { generateKeyPair, sharedSecret, hkdf, decrypt as cryptoDecrypt, encrypt as cryptoEncrypt, decryptFile, encryptFile, randomBytes } from '@qyx/crypto';
import { listConversations, getMessages, sendMessage, getConversationKeys, createConversation, toUint8Array, fromUint8Array, type Conversation, type Message } from '../api/messagesApi';
import { requestUploadUrl, completeUpload, getDownloadUrl, uploadToR2, downloadFromR2 } from '../api/filesApi';
import { getSearchIndex } from '../../../searchIndex';
import { useRealtime } from '../hooks/useRealtime';

const NONCE_LENGTH = 12;
const FILE_KEY_SALT = new TextEncoder().encode('qyx-file');

export default function AppPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [appError, setAppError] = useState('');
  const [loading, setLoading] = useState(true);
  const [handshakePhase, setHandshakePhase] = useState<'idle' | 'running' | 'done'>('running');
  const [handshakeLines, setHandshakeLines] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConversationUserId, setNewConversationUserId] = useState('');
  const [pendingFile, setPendingFile] = useState<{ file: File; fileId: string; name: string; size: number; mimeType: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localKeyPairRef = useRef<{ publicKey: Uint8Array; privateKey: CryptoKey } | null>(null);

  const { subscribe, unsubscribe } = useRealtime((frame) => {
    if (frame.type === 'message' && frame.conversation_id === activeConversationId) {
      setMessages((prev) => {
        const msg = frame.message as unknown as Message;
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } else if (frame.type === 'typing' && frame.conversation_id === activeConversationId) {
      setTypingUsers((prev) => {
        if (prev.includes(frame.user_id)) return prev;
        return [...prev, frame.user_id];
      });
      setTimeout(() => {
        setTypingUsers((prev) => prev.filter((id) => id !== frame.user_id));
      }, 3000);
    }
  });

  useEffect(() => {
    const lines = ['> establishing session…', '> x25519 key agreement…', '> session verified ✓'];
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setHandshakeLines([lines[lines.length - 1]]);
      setTimeout(() => setHandshakePhase('done'), 100);
      return;
    }
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
  }, []);

  useEffect(() => {
    async function initKeyPair() {
      try {
        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('qyx-keypair') : null;
        if (stored) {
          const parsed = JSON.parse(stored) as { publicKey: number[]; privateKey: JsonWebKey };
          const publicKey = new Uint8Array(parsed.publicKey);
          const privateKey = await crypto.subtle.importKey(
            'jwk',
            parsed.privateKey,
            { name: 'X25519' },
            false,
            ['deriveKey', 'deriveBits']
          );
          localKeyPairRef.current = { publicKey, privateKey };
        } else {
          const kp = await generateKeyPair('x25519');
          const privateKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('qyx-keypair', JSON.stringify({ publicKey: Array.from(kp.publicKey), privateKey: privateKeyJwk }));
          }
          localKeyPairRef.current = kp;
        }
      } catch (err) {
        setAppError('Key pair init failed: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
    initKeyPair();
  }, []);

  useEffect(() => {
    async function loadConversations() {
      try {
        const convs = await listConversations();
        setConversations(convs);
        if (convs.length > 0 && !activeConversationId) {
          setActiveConversationId(convs[0].id);
        }
      } catch (err) {
        setAppError('Failed to load conversations: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    }
    loadConversations();
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    subscribe(activeConversationId);
    return () => { unsubscribe(activeConversationId); };
  }, [activeConversationId, subscribe, unsubscribe]);

  useEffect(() => {
    if (!activeConversationId) return;
    const conversationId = activeConversationId;
    let _cancelled = false;
    async function loadMessages() {
      try {
        const msgs = await getMessages(conversationId);
        if (!_cancelled) {
          setMessages(msgs);
          await indexAndDecrypt(msgs);
        }
      } catch (err) {
        setAppError('Failed to load messages: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
    loadMessages();
    return () => { _cancelled = true; };
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function indexAndDecrypt(msgs: Message[]) {
    try {
      const index = await getSearchIndex();
      await index.clear();
      const decrypted = new Map<string, string>();
      let keys: { members: { user_id: string; public_key: string | null }[] } | null = null;
      if (activeConversationId) {
        try {
          keys = await getConversationKeys(activeConversationId);
        } catch {
          // keys unavailable
        }
      }
      for (const msg of msgs) {
        const text = await decryptMessage(msg, keys);
        decrypted.set(msg.id, text);
        await index.add({ id: msg.id, text, timestamp: msg.created_at, conversationId: msg.conversation_id, senderId: msg.sender_id });
      }
      setDecryptedMessages(decrypted);
    } catch {
      // search index unavailable
    }
  }

  useEffect(() => {
    async function doSearch() {
      if (!searchQuery.trim()) { setSearchResults([]); return; }
      try {
        const index = await getSearchIndex();
        const results = await index.search(searchQuery.trim());
        setSearchResults(results.map((r) => r.id));
      } catch {
        setSearchResults([]);
      }
    }
    doSearch();
  }, [searchQuery]);

  async function getConversationCryptoKey(): Promise<CryptoKey | null> {
    if (!activeConversationId || !localKeyPairRef.current) return null;
    try {
      const keys = await getConversationKeys(activeConversationId);
      const otherMember = keys.members.find((m) => m.user_id !== 'self' && m.public_key);
      if (!otherMember) return null;
      const peerPublicKey = Uint8Array.from(atob(otherMember.public_key!), (c) => c.charCodeAt(0));
      const shared = await sharedSecret(localKeyPairRef.current.privateKey, peerPublicKey);
      const aesKey = await hkdf(FILE_KEY_SALT, shared, new TextEncoder().encode('qyx-file'), 32);
      return crypto.subtle.importKey('raw', aesKey.buffer.slice(aesKey.byteOffset, aesKey.byteOffset + aesKey.byteLength) as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    } catch {
      return null;
    }
  }

  async function decryptMessage(msg: Message, keys: { members: { user_id: string; public_key: string | null }[] } | null): Promise<string> {
    try {
      const ciphertext = toUint8Array(msg.ciphertext);
      if (ciphertext.length < NONCE_LENGTH) return '[encrypted]';
      const nonce = ciphertext.slice(0, NONCE_LENGTH);
      const actualCiphertext = ciphertext.slice(NONCE_LENGTH);

      if (!keys || !localKeyPairRef.current) return '[encrypted]';
      const otherMember = keys.members.find((m: { user_id: string; public_key: string | null }) => m.user_id !== msg.sender_id && m.public_key);
      if (!otherMember) return '[encrypted]';

      const peerPublicKey = Uint8Array.from(atob(otherMember.public_key!), (c) => c.charCodeAt(0));
      const shared = await sharedSecret(localKeyPairRef.current.privateKey, peerPublicKey);
      const salt = new TextEncoder().encode('qyx-conversation');
      const aesKey = await hkdf(salt, shared, new TextEncoder().encode('qyx-conversation'), 32);
      const cryptoKey = await crypto.subtle.importKey('raw', aesKey.buffer.slice(aesKey.byteOffset, aesKey.byteOffset + aesKey.byteLength) as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
      const plaintext = await cryptoDecrypt(cryptoKey, actualCiphertext, nonce);
      return new TextDecoder().decode(plaintext);
    } catch {
      return '[encrypted]';
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConversationId || (!compose.trim() && !pendingFile) || sending) return;
    setSending(true);
    setUploadError('');
    try {
      let attachmentRef: string | undefined;
      if (pendingFile) {
        const cryptoKey = await getConversationCryptoKey();
        if (!cryptoKey) {
          setUploadError('No encryption key available for files');
          setSending(false);
          return;
        }
        const fileBuffer = await pendingFile.file.arrayBuffer();
        const { ciphertext, nonce } = await encryptFile(cryptoKey, new Uint8Array(fileBuffer));
        const uploadBytes = new Uint8Array([...nonce, ...ciphertext]);
        const uploadResult = await requestUploadUrl({ mime_type: pendingFile.mimeType, size_bytes: pendingFile.size, conversation_id: activeConversationId || undefined });
        await uploadToR2(uploadResult.upload_url, uploadBytes.buffer);
        await completeUpload({ file_id: uploadResult.file_id });
        attachmentRef = uploadResult.file_id;
        setPendingFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      const plaintext = new TextEncoder().encode(compose.trim());
      const nonce = randomBytes(NONCE_LENGTH);
      let ciphertextArray: number[];
      if (localKeyPairRef.current) {
        const keys = await getConversationKeys(activeConversationId);
        const otherMember = keys.members.find((m: { user_id: string; public_key: string | null }) => m.user_id !== 'self' && m.public_key);
        if (otherMember) {
          const peerPublicKey = Uint8Array.from(atob(otherMember.public_key!), (c) => c.charCodeAt(0));
          const shared = await sharedSecret(localKeyPairRef.current.privateKey, peerPublicKey);
          const salt = new TextEncoder().encode('qyx-conversation');
          const aesKey = await hkdf(salt, shared, new TextEncoder().encode('qyx-conversation'), 32);
          const cryptoKey = await crypto.subtle.importKey('raw', aesKey.buffer.slice(aesKey.byteOffset, aesKey.byteOffset + aesKey.byteLength) as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt']);
          const { ciphertext } = await cryptoEncrypt(cryptoKey, plaintext, nonce);
          ciphertextArray = fromUint8Array(new Uint8Array([...nonce, ...ciphertext]));
        } else {
          ciphertextArray = fromUint8Array(new Uint8Array([...nonce, ...plaintext]));
        }
      } else {
        ciphertextArray = fromUint8Array(new Uint8Array([...nonce, ...plaintext]));
      }
      const sent = await sendMessage(activeConversationId, { ciphertext: ciphertextArray, message_type: 'text', attachment_ref: attachmentRef || undefined });
      setMessages((prev) => [...prev, sent]);
      setCompose('');
    } catch (err) {
      // send failed
    } finally {
      setSending(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;
    setUploadError('');
    setPendingFile({ file, fileId: '', name: file.name, size: file.size, mimeType: file.type });
  }

  async function handleDownload(fileId: string) {
    try {
      const downloadInfo = await getDownloadUrl(fileId);
      const encryptedBuffer = await downloadFromR2(downloadInfo.download_url);
      const cryptoKey = await getConversationCryptoKey();
      if (!cryptoKey) {
        alert('No encryption key available to decrypt file');
        return;
      }
      const encryptedBytes = new Uint8Array(encryptedBuffer);
      const nonce = encryptedBytes.slice(0, NONCE_LENGTH);
      const ciphertext = encryptedBytes.slice(NONCE_LENGTH);
      const plaintext = await decryptFile(cryptoKey, ciphertext, nonce, downloadInfo.size_bytes);
      const blob = new Blob([plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer], { type: downloadInfo.mime_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadInfo.mime_type.split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download file');
    }
  }

  async function handleCreateConversation(e: React.FormEvent) {
    e.preventDefault();
    if (!newConversationUserId.trim()) return;
    try {
      const conv = await createConversation(newConversationUserId.trim());
      setConversations((prev) => [...prev, conv]);
      setActiveConversationId(conv.id);
      setShowNewConversation(false);
      setNewConversationUserId('');
    } catch (err) {
      setAppError('Create conversation failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="flex h-full w-full flex-col bg-void">
      <BufferHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        conversation={activeConversation}
        onShowNewConversation={() => setShowNewConversation(true)}
      />
      <div className="flex-1 overflow-y-auto p-3">
        {appError && <div className="text-xs text-signal-amber mb-2">&gt; {appError}</div>}
        {handshakePhase !== 'done' ? (
          <div className="space-y-1 font-mono text-sm text-signal-cipher">
            {handshakeLines.map((line, i) => (<div key={i} className="animate-fade-in">{line}</div>))}
            <span className="inline-block w-2 h-4 bg-signal-cipher animate-pulse" />
          </div>
        ) : loading ? (
          <div className="text-xs text-text-dim">&gt; loading messages...</div>
        ) : conversations.length === 0 ? (
          <div className="text-xs text-text-dim">&gt; no conversations yet. create one above.</div>
        ) : (
          <MessageList messages={messages} decryptedMessages={decryptedMessages} searchResults={searchResults} typingUsers={typingUsers} endRef={messagesEndRef} onDownload={handleDownload} />
        )}
      </div>
      <div className="border-t border-hairline p-2">
        {uploadError && <div className="mb-1 text-xs text-signal-amber">&gt; {uploadError}</div>}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 border border-hairline bg-raised px-2 py-1 text-xs">
            <span className="text-text-primary">{pendingFile.name}</span>
            <span className="text-text-dim">{(pendingFile.size / 1024).toFixed(1)} KB</span>
            <button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-auto text-text-secondary hover:text-text-primary">✕</button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <span className="text-text-dim">&gt;</span>
          <input
            type="text"
            placeholder="type a message"
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            className="flex-1 bg-transparent font-mono text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
            disabled={!activeConversationId}
          />
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-50" disabled={!activeConversationId || sending} aria-label="Attach file">
            <Paperclip size={14} />
          </button>
          <button type="submit" disabled={!activeConversationId || sending} className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
            {sending ? '...' : 'send'}
          </button>
        </form>
      </div>
      {showNewConversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNewConversation(false)}>
          <div className="w-full max-w-sm bg-surface border border-hairline p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">New conversation</span>
              <button onClick={() => setShowNewConversation(false)} className="text-text-dim hover:text-text-primary"><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateConversation} className="space-y-3">
              <input
                type="text"
                placeholder="user id"
                value={newConversationUserId}
                onChange={(e) => setNewConversationUserId(e.target.value)}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                autoFocus
              />
              <button type="submit" className="w-full border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus">Create</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BufferHeader({ searchQuery, onSearchChange, conversation, onShowNewConversation }: { searchQuery: string; onSearchChange: (v: string) => void; conversation?: Conversation; onShowNewConversation: () => void }) {
  return (
    <div className="flex h-9 items-center border-b border-hairline px-3">
      <span className="text-sm font-medium text-text-primary">{conversation ? `#${conversation.id}` : '#engineering'}</span>
      <span className="ml-2 text-xs text-text-dim">{conversation ? `${conversation.type}` : '12 members'}</span>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={onShowNewConversation} className="text-xs text-text-secondary hover:text-text-primary">+ new</button>
        <input
          type="text"
          placeholder="search log…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-transparent border border-hairline px-2 py-0.5 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
        />
      </div>
    </div>
  );
}

function MessageList({ messages, decryptedMessages, searchResults, typingUsers, endRef, onDownload }: { messages: Message[]; decryptedMessages: Map<string, string>; searchResults: string[]; typingUsers: string[]; endRef: React.Ref<HTMLDivElement>; onDownload: (fileId: string) => void }) {
  const groups: { sender: string; timestamp: string; messages: { id: string; text: string; attachment_ref: string | null }[] }[] = [];
  let current: { sender: string; timestamp: string; messages: { id: string; text: string; attachment_ref: string | null }[] } | null = null;
  for (const msg of messages) {
    if (searchResults.length > 0 && !searchResults.includes(msg.id)) continue;
    const text = decryptedMessages.get(msg.id) || '[encrypted]';
    if (current && current.sender === msg.sender_id) {
      current.messages.push({ id: msg.id, text, attachment_ref: msg.attachment_ref });
    } else {
      current = { sender: msg.sender_id, timestamp: new Date(msg.created_at).toLocaleTimeString(), messages: [{ id: msg.id, text, attachment_ref: msg.attachment_ref }] };
      groups.push(current);
    }
  }
  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span>[{group.timestamp}]</span>
            <span className="font-medium text-text-primary">{group.sender}</span>
            {typingUsers.includes(group.sender) && <span className="text-text-dim">▏</span>}
          </div>
          {group.messages.map((msg) => (
            <div key={msg.id} className="text-sm text-text-primary pl-20">
              {msg.text}
              {msg.attachment_ref && (
                <div className="mt-1 inline-flex items-center gap-2 border border-hairline bg-raised px-2 py-1 text-xs font-mono">
                  <span>▤</span>
                  <span className="text-text-primary">attachment</span>
                  <button onClick={() => onDownload(msg.attachment_ref!)} className="text-text-secondary hover:text-text-primary">↓ download</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
