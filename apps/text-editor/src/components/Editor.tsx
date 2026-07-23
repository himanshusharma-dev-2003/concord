import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { RgaDocument, RGANode } from 'concord-core';
import { Share2, ChevronLeft, Undo, Redo, Search } from 'lucide-react';

interface EditorProps {
  documentId: string;
  token: string;
  userId: number;
  documentTitle: string;
  onBack: () => void;
}

interface PresenceUser {
  clientId: number;
  socketId: string;
  color: string;
  offset?: number;
}

const COLORS = ['#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#3b82f6'];

/**
 * Calculates the exact diff (insertion and deletion ranges) between two strings
 * using a fast prefix-suffix scan.
 */
function getDiff(oldText: string, newText: string): { start: number; deleteCount: number; insertText: string } {
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }

  let oldEnd = oldText.length - 1;
  let newEnd = newText.length - 1;
  while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const deleteCount = oldEnd - start + 1;
  const insertText = newText.slice(start, newEnd + 1);

  return { start, deleteCount, insertText };
}

export function Editor({ documentId, token, userId, documentTitle, onBack }: EditorProps) {
  const [doc, setDoc] = useState<RgaDocument | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<Map<number, PresenceUser>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [title, setTitle] = useState(documentTitle);
  const [showCmd, setShowCmd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isApplyingRemote = useRef(false);
  const lastCursorPosition = useRef(0);

  // Initialize CRDT document and WebSocket
  useEffect(() => {
    const crdtDoc = new RgaDocument(userId);
    setDoc(crdtDoc);

    const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3002', {
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      setStatus('connected');
      newSocket.emit('join-document', { documentId, clientId: userId });
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      setStatus('offline');
    });

    newSocket.on('initial-state', (data: any) => {
      if (data.snapshot) {
        data.snapshot.forEach((node: RGANode) => crdtDoc.applyRemoteOp(node));
      }
      if (data.operations) {
        data.operations.forEach((node: RGANode) => crdtDoc.applyRemoteOp(node));
      }
      renderEditorContent(crdtDoc);
      setDoc(crdtDoc);
    });

    newSocket.on('presence-sync', (users: { clientId: number, socketId: string }[]) => {
      setConnectedUsers(prev => {
        const next = new Map(prev);
        users.forEach((u, i) => {
          if (u.clientId !== userId) {
            next.set(u.clientId, { ...u, color: COLORS[u.clientId % COLORS.length] });
          }
        });
        return next;
      });
    });

    newSocket.on('user-joined', (user: { clientId: number, socketId: string }) => {
      setConnectedUsers(prev => {
        const next = new Map(prev);
        next.set(user.clientId, { ...user, color: COLORS[user.clientId % COLORS.length] });
        return next;
      });
    });

    newSocket.on('user-left', (user: { clientId: number }) => {
      setConnectedUsers(prev => {
        const next = new Map(prev);
        next.delete(user.clientId);
        return next;
      });
    });

    newSocket.on('crdt-op', (data: { op: RGANode; fromClientId: number }) => {
      if (data.fromClientId === userId) return;
      isApplyingRemote.current = true;
      lastCursorPosition.current = getCursorPosition();
      crdtDoc.applyRemoteOp(data.op);
      renderEditorContent(crdtDoc, true);
      isApplyingRemote.current = false;
    });

    newSocket.on('cursor-update', (data: { clientId: number, offset: number }) => {
      setConnectedUsers(prev => {
        const user = prev.get(data.clientId);
        if (user) {
          const next = new Map(prev);
          next.set(data.clientId, { ...user, offset: data.offset });
          return next;
        }
        return prev;
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [documentId, userId]);

  // Handle Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmd(prev => !prev);
      } else if (e.key === 'Escape') {
        setShowCmd(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderEditorContent = useCallback((crdtDoc: RgaDocument, preserveCursor = false) => {
    if (!editorRef.current) return;
    const text = crdtDoc.toString();
    const currentText = editorRef.current.textContent || '';
    if (text !== currentText) {
      editorRef.current.textContent = text;
      if (preserveCursor && lastCursorPosition.current !== null) {
        setTimeout(() => setCursorPosition(Math.min(lastCursorPosition.current, text.length)), 0);
      }
    }
  }, []);

  const getCursorPosition = (): number => {
    const selection = window.getSelection();
    if (!selection || !editorRef.current) return 0;
    if (selection.rangeCount === 0) return 0;
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  };

  const setCursorPosition = (position: number) => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    let currentPos = 0;
    const nodeStack: Node[] = [editorRef.current];

    while (nodeStack.length > 0) {
      const node = nodeStack.pop()!;
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const nodeLength = textNode.length;
        if (currentPos + nodeLength >= position) {
          range.setStart(textNode, position - currentPos);
          range.setEnd(textNode, position - currentPos);
          break;
        }
        currentPos += nodeLength;
      } else {
        for (let i = node.childNodes.length - 1; i >= 0; i--) {
          nodeStack.push(node.childNodes[i]);
        }
      }
    }
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const emitCursorMove = useCallback(() => {
    if (socket && isConnected) {
      const offset = getCursorPosition();
      socket.emit('cursor-move', { documentId, offset });
    }
  }, [socket, isConnected, documentId]);

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (!doc || !socket || isApplyingRemote.current) return;
    const newText = (e.currentTarget.textContent || '');
    const currentText = doc.toString();
    if (newText === currentText) return;

    const { start, deleteCount, insertText } = getDiff(currentText, newText);

    // 1. Process deletions
    for (let j = 0; j < deleteCount; j++) {
      const deletedNode = doc.delete(start);
      if (deletedNode) {
        socket.emit('crdt-op', { documentId, op: deletedNode });
      }
    }

    // 2. Process insertions
    for (let j = 0; j < insertText.length; j++) {
      const node = doc.insert(start + j, insertText[j]);
      socket.emit('crdt-op', { documentId, op: node });
    }

    setDoc(doc);
    emitCursorMove();
  }, [doc, socket, documentId, emitCursorMove]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (doc && socket) {
        const pos = getCursorPosition();
        const node = doc.insert(pos, '\n');
        socket.emit('crdt-op', { documentId, op: node });
        renderEditorContent(doc);
        emitCursorMove();
      }
    } else if (e.key.startsWith('Arrow')) {
      setTimeout(emitCursorMove, 10);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const handleShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', documentId);
    navigator.clipboard.writeText(url.toString()).then(() => {
      showToast('🔗 Share link copied to clipboard');
    }).catch(() => {
      showToast('Failed to copy link — please copy the URL manually');
    });
  };

  // Helper to render remote cursors
  const renderRemoteCursors = () => {
    if (!editorRef.current || !containerRef.current) return null;
    const textContent = editorRef.current.textContent || '';
    
    return Array.from(connectedUsers.values()).map(user => {
      if (user.offset === undefined) return null;
      
      // Calculate coordinates (approximation for contenteditable without spans)
      // We create a temporary range to find the rect.
      const range = document.createRange();
      let pos = Math.min(user.offset, textContent.length);
      
      let currentPos = 0;
      let targetNode: Node | null = null;
      let targetOffset = 0;
      
      const nodeStack: Node[] = [editorRef.current!];
      while (nodeStack.length > 0) {
        const node = nodeStack.pop()!;
        if (node.nodeType === Node.TEXT_NODE) {
          const textNode = node as Text;
          const nodeLength = textNode.length;
          if (currentPos + nodeLength >= pos) {
            targetNode = textNode;
            targetOffset = pos - currentPos;
            break;
          }
          currentPos += nodeLength;
        } else {
          for (let i = node.childNodes.length - 1; i >= 0; i--) {
            nodeStack.push(node.childNodes[i]);
          }
        }
      }

      let top = 0, left = 0;
      if (targetNode) {
        range.setStart(targetNode, targetOffset);
        range.setEnd(targetNode, targetOffset);
        const rects = range.getClientRects();
        const editorRect = containerRef.current!.getBoundingClientRect();
        
        if (rects.length > 0) {
          top = rects[0].top - editorRect.top;
          left = rects[0].left - editorRect.left;
        } else {
          // Fallback to start of editor
          top = 32; // padding
          left = 32;
        }
      }

      if (top === 0 && left === 0) return null;

      return (
        <div 
          key={user.clientId} 
          className="remote-cursor active"
          style={{ top, left, backgroundColor: user.color }}
        >
          <div className="remote-cursor-label" style={{ backgroundColor: user.color }}>
            User {user.clientId}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="editor-layout">
      {/* Top Toolbar */}
      <div className="top-toolbar">
        <div className="toolbar-left">
          <button onClick={onBack} className="secondary" style={{ padding: '8px', width: 'auto' }}>
            <ChevronLeft size={18} />
          </button>
          
          <input 
            type="text" 
            className="doc-title" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            spellCheck={false}
          />
          
          <div className="sync-status">
            <div className={`status-dot ${status}`}></div>
            {status === 'connected' ? 'Synced' : status === 'offline' ? 'Offline' : 'Connecting...'}
          </div>
        </div>
        
        <div className="toolbar-right">
          <div className="avatar-stack">
            {Array.from(connectedUsers.values()).map(user => (
              <div key={user.clientId} className="avatar" style={{ backgroundColor: user.color }} title={`User ${user.clientId}`}>
                {user.clientId.toString().slice(-1)}
              </div>
            ))}
          </div>
          
          <button className="share-btn" onClick={handleShare}>
            <Share2 size={16} />
            Share
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="editor-container" ref={containerRef} onClick={() => editorRef.current?.focus()}>
        {renderRemoteCursors()}
        <div
          ref={editorRef}
          id="editor"
          contentEditable
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={emitCursorMove}
          onKeyUp={emitCursorMove}
          suppressContentEditableWarning={true}
        />
      </div>

      {/* Cmd+K Menu */}
      {showCmd && (
        <div className="cmd-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCmd(false) }}>
          <div className="cmd-palette">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={18} style={{ position: 'absolute', left: '20px', color: 'var(--text-muted)' }} />
              <input 
                autoFocus 
                className="cmd-input" 
                style={{ paddingLeft: '48px' }}
                placeholder="Type a command or search..."
                onKeyDown={(e) => { if (e.key === 'Escape') setShowCmd(false) }}
              />
            </div>
            <div className="cmd-list">
              <div className="cmd-item" onClick={() => { handleShare(); setShowCmd(false); }}>
                <Share2 size={16} /> Copy Share Link
              </div>
              <div className="cmd-item" onClick={() => { onBack(); setShowCmd(false); }}>
                <ChevronLeft size={16} /> Back to Documents
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(30, 34, 53, 0.95)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'var(--text-main)',
          padding: '12px 20px',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 500,
          zIndex: 200,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          animation: 'slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}