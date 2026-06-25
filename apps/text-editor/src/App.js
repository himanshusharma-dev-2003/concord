import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { AuthForm } from './components/AuthForm';
import { DocumentList } from './components/DocumentList';
import { Editor } from './components/Editor';
import { LogOut } from 'lucide-react';
export default function App() {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [currentDoc, setCurrentDoc] = useState(null);
    // Check URL params for auto-joining a room
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room && user && token && !currentDoc) {
            setCurrentDoc({ id: room, title: `Document ${room.substring(0, 4)}...` });
        }
    }, [user, token, currentDoc]);
    const handleLogin = (userData, jwt) => {
        setUser(userData);
        setToken(jwt);
    };
    const handleLogout = () => {
        setUser(null);
        setToken(null);
        setCurrentDoc(null);
    };
    if (!user || !token) {
        return _jsx(AuthForm, { onLogin: handleLogin });
    }
    return (_jsxs("div", { className: "app-container", children: [!currentDoc && (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }, children: [_jsxs("div", { children: [_jsx("h1", { style: { margin: 0, fontSize: '24px', fontWeight: 600 }, children: "CRDT Editor" }), _jsxs("span", { style: { color: 'var(--text-muted)', fontSize: '14px' }, children: ["Logged in as ", user.email] })] }), _jsxs("button", { onClick: handleLogout, className: "secondary", style: { width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx(LogOut, { size: 16 }), "Logout"] })] })), !currentDoc ? (_jsx(DocumentList, { token: token, onOpenDocument: (doc) => setCurrentDoc(doc) })) : (_jsx(Editor, { documentId: currentDoc.id, token: token, userId: user.id, documentTitle: currentDoc.title, onBack: () => {
                    setCurrentDoc(null);
                    // Clear URL param if present
                    window.history.replaceState({}, '', window.location.pathname);
                } }))] }));
}
