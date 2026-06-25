import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { RgaDocument } from '@crdt-text-editor/crdt';
import { Share2, ChevronLeft } from 'lucide-react';
const COLORS = ['#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#3b82f6'];
export function Editor({ documentId, token, userId, documentTitle, onBack }) {
    const [doc, setDoc] = useState(null);
    const [socket, setSocket] = useState(null);
    const [connectedUsers, setConnectedUsers] = useState(new Map());
    const [isConnected, setIsConnected] = useState(false);
    const [status, setStatus] = useState('connecting');
    const [title, setTitle] = useState(documentTitle);
    const [showCmd, setShowCmd] = useState(false);
    const editorRef = useRef(null);
    const containerRef = useRef(null);
    const isApplyingRemote = useRef(false);
    const lastCursorPosition = useRef(0);
    // Initialize CRDT document and WebSocket
    useEffect(() => {
        const crdtDoc = new RgaDocument(userId);
        setDoc(crdtDoc);
        const newSocket = io('http://localhost:3002', {
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
        newSocket.on('initial-state', (data) => {
            if (data.snapshot) {
                data.snapshot.forEach((node) => crdtDoc.applyRemoteOp(node));
            }
            if (data.operations) {
                data.operations.forEach((node) => crdtDoc.applyRemoteOp(node));
            }
            renderEditorContent(crdtDoc);
            setDoc(crdtDoc);
        });
        newSocket.on('presence-sync', (users) => {
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
        newSocket.on('user-joined', (user) => {
            setConnectedUsers(prev => {
                const next = new Map(prev);
                next.set(user.clientId, { ...user, color: COLORS[user.clientId % COLORS.length] });
                return next;
            });
        });
        newSocket.on('user-left', (user) => {
            setConnectedUsers(prev => {
                const next = new Map(prev);
                next.delete(user.clientId);
                return next;
            });
        });
        newSocket.on('crdt-op', (data) => {
            if (data.fromClientId === userId)
                return;
            isApplyingRemote.current = true;
            lastCursorPosition.current = getCursorPosition();
            crdtDoc.applyRemoteOp(data.op);
            renderEditorContent(crdtDoc, true);
            isApplyingRemote.current = false;
        });
        newSocket.on('cursor-update', (data) => {
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
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setShowCmd(prev => !prev);
            }
            else if (e.key === 'Escape') {
                setShowCmd(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    const renderEditorContent = useCallback((crdtDoc, preserveCursor = false) => {
        if (!editorRef.current)
            return;
        const text = crdtDoc.toString();
        const currentText = editorRef.current.textContent || '';
        if (text !== currentText) {
            editorRef.current.textContent = text;
            if (preserveCursor && lastCursorPosition.current !== null) {
                setTimeout(() => setCursorPosition(Math.min(lastCursorPosition.current, text.length)), 0);
            }
        }
    }, []);
    const getCursorPosition = () => {
        const selection = window.getSelection();
        if (!selection || !editorRef.current)
            return 0;
        if (selection.rangeCount === 0)
            return 0;
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editorRef.current);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    };
    const setCursorPosition = (position) => {
        if (!editorRef.current)
            return;
        const selection = window.getSelection();
        if (!selection)
            return;
        const range = document.createRange();
        let currentPos = 0;
        const nodeStack = [editorRef.current];
        while (nodeStack.length > 0) {
            const node = nodeStack.pop();
            if (node.nodeType === Node.TEXT_NODE) {
                const textNode = node;
                const nodeLength = textNode.length;
                if (currentPos + nodeLength >= position) {
                    range.setStart(textNode, position - currentPos);
                    range.setEnd(textNode, position - currentPos);
                    break;
                }
                currentPos += nodeLength;
            }
            else {
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
    const handleInput = useCallback((e) => {
        if (!doc || !socket || isApplyingRemote.current)
            return;
        const newText = (e.currentTarget.textContent || '');
        const currentText = doc.toString();
        if (newText === currentText)
            return;
        let i = 0;
        while (i < currentText.length && i < newText.length && currentText[i] === newText[i])
            i++;
        if (newText.length > currentText.length) {
            const charsToInsert = newText.slice(i);
            for (let j = 0; j < charsToInsert.length; j++) {
                const node = doc.insert(i + j, charsToInsert[j]);
                socket.emit('crdt-op', { documentId, op: node });
            }
        }
        else if (newText.length < currentText.length) {
            const deleteCount = currentText.length - newText.length;
            for (let j = 0; j < deleteCount; j++) {
                const deletedNode = doc.delete(i);
                if (deletedNode)
                    socket.emit('crdt-op', { documentId, op: deletedNode });
            }
        }
        setDoc(doc);
        emitCursorMove();
    }, [doc, socket, documentId, emitCursorMove]);
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (doc && socket) {
                const pos = getCursorPosition();
                const node = doc.insert(pos, '\n');
                socket.emit('crdt-op', { documentId, op: node });
                renderEditorContent(doc);
                emitCursorMove();
            }
        }
        else if (e.key.startsWith('Arrow')) {
            setTimeout(emitCursorMove, 10);
        }
    };
    const handleShare = () => {
        const url = new URL(window.location.href);
        url.searchParams.set('room', documentId);
        navigator.clipboard.writeText(url.toString());
        alert('Link copied to clipboard!');
    };
    // Helper to render remote cursors
    const renderRemoteCursors = () => {
        if (!editorRef.current || !containerRef.current)
            return null;
        const textContent = editorRef.current.textContent || '';
        return Array.from(connectedUsers.values()).map(user => {
            if (user.offset === undefined)
                return null;
            // Calculate coordinates (approximation for contenteditable without spans)
            // We create a temporary range to find the rect.
            const range = document.createRange();
            let pos = Math.min(user.offset, textContent.length);
            let currentPos = 0;
            let targetNode = null;
            let targetOffset = 0;
            const nodeStack = [editorRef.current];
            while (nodeStack.length > 0) {
                const node = nodeStack.pop();
                if (node.nodeType === Node.TEXT_NODE) {
                    const textNode = node;
                    const nodeLength = textNode.length;
                    if (currentPos + nodeLength >= pos) {
                        targetNode = textNode;
                        targetOffset = pos - currentPos;
                        break;
                    }
                    currentPos += nodeLength;
                }
                else {
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
                const editorRect = containerRef.current.getBoundingClientRect();
                if (rects.length > 0) {
                    top = rects[0].top - editorRect.top;
                    left = rects[0].left - editorRect.left;
                }
                else {
                    // Fallback to start of editor
                    top = 32; // padding
                    left = 32;
                }
            }
            if (top === 0 && left === 0)
                return null;
            return (_jsx("div", { className: "remote-cursor active", style: { top, left, backgroundColor: user.color }, children: _jsxs("div", { className: "remote-cursor-label", style: { backgroundColor: user.color }, children: ["User ", user.clientId] }) }, user.clientId));
        });
    };
    return (_jsxs("div", { className: "editor-layout", children: [_jsxs("div", { className: "top-toolbar", children: [_jsxs("div", { className: "toolbar-left", children: [_jsx("button", { onClick: onBack, className: "secondary", style: { padding: '8px', width: 'auto' }, children: _jsx(ChevronLeft, { size: 18 }) }), _jsx("input", { type: "text", className: "doc-title", value: title, onChange: (e) => setTitle(e.target.value), spellCheck: false }), _jsxs("div", { className: "sync-status", children: [_jsx("div", { className: `status-dot ${status}` }), status === 'connected' ? 'Synced' : status === 'offline' ? 'Offline' : 'Connecting...'] })] }), _jsxs("div", { className: "toolbar-right", children: [_jsx("div", { className: "avatar-stack", children: Array.from(connectedUsers.values()).map(user => (_jsx("div", { className: "avatar", style: { backgroundColor: user.color }, title: `User ${user.clientId}`, children: user.clientId.toString().slice(-1) }, user.clientId))) }), _jsxs("button", { className: "share-btn", onClick: handleShare, children: [_jsx(Share2, { size: 16 }), "Share"] })] })] }), _jsxs("div", { className: "editor-container", ref: containerRef, onClick: () => editorRef.current?.focus(), children: [renderRemoteCursors(), _jsx("div", { ref: editorRef, id: "editor", contentEditable: true, onInput: handleInput, onKeyDown: handleKeyDown, onClick: emitCursorMove, onKeyUp: emitCursorMove, suppressContentEditableWarning: true })] }), showCmd && (_jsx("div", { className: "cmd-palette-overlay", onClick: (e) => { if (e.target === e.currentTarget)
                    setShowCmd(false); }, children: _jsxs("div", { className: "cmd-palette", children: [_jsx("input", { autoFocus: true, className: "cmd-input", placeholder: "Type a command or search...", onKeyDown: (e) => { if (e.key === 'Escape')
                                setShowCmd(false); } }), _jsxs("div", { className: "cmd-list", children: [_jsxs("div", { className: "cmd-item", onClick: () => { handleShare(); setShowCmd(false); }, children: [_jsx(Share2, { size: 16 }), " Copy Share Link"] }), _jsxs("div", { className: "cmd-item", onClick: () => { onBack(); setShowCmd(false); }, children: [_jsx(ChevronLeft, { size: 16 }), " Back to Documents"] })] })] }) }))] }));
}
