import React, { useEffect, useState } from 'react';

interface Document {
  id: string;
  title: string;
  updated_at: string;
}

interface DocumentListProps {
  token: string;
  onOpenDocument: (doc: Document) => void;
}

export function DocumentList({ token, onOpenDocument }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
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
    } catch (err) {
      console.error('Failed to fetch documents', err);
    } finally {
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
    } catch (err) {
      console.error('Failed to create document', err);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading documents...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '28px', margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>Your Documents</h2>
        <button onClick={createNewDocument} disabled={creating} style={{ width: 'auto', padding: '12px 24px', borderRadius: '100px' }}>
          {creating ? 'Creating...' : '+ New Document'}
        </button>
      </div>

      {documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
          <p style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--text-main)' }}>No documents yet</p>
          Create your first one to start collaborating!
        </div>
      ) : (
        <div className="doc-list">
          {documents.map((doc) => (
            <div 
              key={doc.id} 
              className="doc-card"
              onClick={() => onOpenDocument(doc)}
            >
              <h3>{doc.title}</h3>
              <div className="doc-meta">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Last updated: {new Date(doc.updated_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}