import React, { useState } from 'react';

interface AuthFormProps {
  onLogin: (user: { id: number; email: string }, token: string) => void;
}

export function AuthForm({ onLogin }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/auth/login' : '/auth/signup';
    const body = { email, password };

    try {
      const res = await fetch(`http://localhost:3002${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (isLogin) {
        onLogin(data.user, data.token);
      } else {
        // After signup, automatically log in
        const loginRes = await fetch('http://localhost:3002/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const loginData = await loginRes.json();
        onLogin(loginData.user, loginData.token);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>
        {isLogin ? 'Welcome back' : 'Create an account'}
      </h2>
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '-24px', marginBottom: '32px', fontSize: '14px' }}>
        {isLogin ? 'Enter your details to access your workspace.' : 'Sign up to start collaborating.'}
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up'}
        </button>
      </form>

      {error && (
        <div style={{ color: 'var(--destructive, #EF4444)', fontSize: '14px', textAlign: 'center', marginTop: '16px' }}>
          {error}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <button
          type="button"
          onClick={() => { setIsLogin(!isLogin); setError(''); }}
          style={{ 
            background: 'none', 
            color: 'var(--text-muted)', 
            width: 'auto', 
            padding: '8px', 
            boxShadow: 'none',
            fontSize: '14px',
            fontWeight: 500
          }}
          onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-main)'}
          onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span style={{ color: 'var(--primary)' }}>
            {isLogin ? "Sign up" : "Sign in"}
          </span>
        </button>
      </div>
    </div>
  );
}