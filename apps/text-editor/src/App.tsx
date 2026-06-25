import React, { useState, useEffect } from 'react';
import { AuthForm } from './components/AuthForm';
import { DocumentList } from './components/DocumentList';
import { Editor } from './components/Editor';
import { LogOut, ChevronLeft } from 'lucide-react';

interface User {
  id: number;
  email: string;
}

interface Document {
  id: string;
  title: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);

  // Check URL params for auto-joining a room
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && user && token && !currentDoc) {
      setCurrentDoc({ id: room, title: `Document ${room.substring(0, 4)}...` });
    }
  }, [user, token, currentDoc]);

  const handleLogin = (userData: User, jwt: string) => {
    setUser(userData);
    setToken(jwt);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setCurrentDoc(null);
  };

  if (!user || !token) {
    return <AuthForm onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      {!currentDoc && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Concord</h1>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Logged in as {user.email}
            </span>
          </div>
          
          <button 
            onClick={handleLogout}
            className="secondary"
            style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}

      {!currentDoc ? (
        <DocumentList 
          token={token} 
          onOpenDocument={(doc) => setCurrentDoc(doc)} 
        />
      ) : (
        <Editor 
          documentId={currentDoc.id} 
          token={token} 
          userId={user.id}
          documentTitle={currentDoc.title}
          onBack={() => {
            setCurrentDoc(null);
            // Clear URL param if present
            window.history.replaceState({}, '', window.location.pathname);
          }}
        />
      )}
    </div>
  );
}