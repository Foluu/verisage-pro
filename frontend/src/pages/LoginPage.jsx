
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Zap, Loader } from 'lucide-react';



export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo">
          <div className="mark">
            <img 
              src="../src/images/verisage-logo.png" 
              style={{ width: "36px", height: "36px" }}
              alt="VeriSage Logo"
              className="logo-img"
            />
          </div>
          <div className="wordmark">Veri<span>Sage</span> Pro</div>
        </div>

        <div className="login-tagline">NiRA · CoCCA–SAGE Integration Portal</div>

        <form className="login-fields" onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email address</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@nira.org.ng"
              autoComplete="email"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 4 }}
          >
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Signing in…</> : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center' }}>
          Secured with JWT · Internal access only
        </p>
      </div>
    </div>
  );

  
}