import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export function DocumentList({ token, onOpenDocument }) {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const fetchDocuments = async () => {
        try {
            const res = await fetch('http://localhost:3002/documents', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        }
        catch (err) {
            console.error('Failed to fetch documents', err);
        }
        finally {
            setLoading(false);
        }
    };
    const createNewDocument = async () => {
        setCreating(true);
        try {
            const res = await fetch('http://localhost:3002/documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ title: 'Untitled Document' }),
            });
            if (res.ok) {
                const newDoc = await res.json();
                await fetchDocuments();
                onOpenDocument(newDoc);
            }
        }
        catch (err) {
            console.error('Failed to create document', err);
        }
        finally {
            setCreating(false);
        }
    };
    useEffect(() => {
        fetchDocuments();
    }, []);
    if (loading)
        return _jsx("div", { style: { textAlign: 'center', padding: '40px' }, children: "Loading documents..." });
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }, children: [_jsx("h2", { children: "Your Documents" }), _jsx("button", { onClick: createNewDocument, disabled: creating, style: { width: 'auto', padding: '10px 20px' }, children: creating ? 'Creating...' : '+ New Document' })] }), documents.length === 0 ? (_jsx("div", { style: { textAlign: 'center', padding: '60px 20px', color: '#64748b' }, children: "No documents yet. Create your first one!" })) : (_jsx("div", { className: "doc-list", children: documents.map((doc) => (_jsxs("div", { className: "doc-card", onClick: () => onOpenDocument(doc), children: [_jsx("h3", { style: { margin: '0 0 8px 0', fontSize: '18px' }, children: doc.title }), _jsxs("div", { style: { fontSize: '13px', color: '#64748b' }, children: ["Last updated: ", new Date(doc.updated_at).toLocaleDateString()] })] }, doc.id))) }))] }));
}
