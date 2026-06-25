import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export function AuthForm({ onLogin }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const handleSubmit = async (e) => {
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
            }
            else {
                // After signup, automatically log in
                const loginRes = await fetch('http://localhost:3002/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const loginData = await loginRes.json();
                onLogin(loginData.user, loginData.token);
            }
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "auth-form", children: [_jsx("h2", { style: { textAlign: 'center', marginBottom: '24px' }, children: isLogin ? 'Sign in' : 'Create account' }), _jsxs("form", { onSubmit: handleSubmit, children: [_jsx("input", { type: "email", placeholder: "Email", value: email, onChange: (e) => setEmail(e.target.value), required: true }), _jsx("input", { type: "password", placeholder: "Password", value: password, onChange: (e) => setPassword(e.target.value), required: true }), _jsx("button", { type: "submit", disabled: loading, children: loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up' })] }), error && (_jsx("div", { style: { color: '#ef4444', fontSize: '14px', textAlign: 'center' }, children: error })), _jsx("div", { style: { textAlign: 'center', marginTop: '16px' }, children: _jsx("button", { onClick: () => setIsLogin(!isLogin), style: { background: 'none', color: '#2563eb', width: 'auto', padding: 0 }, children: isLogin ? 'Need an account? Sign up' : 'Already have an account? Sign in' }) })] }));
}
