import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Gauge,
  Lightbulb,
  Lock,
  Mail,
  User,
  WandSparkles,
  X,
} from 'lucide-react';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isPasswordValid =
    hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    if (mode === 'register') {
      if (!name.trim()) {
        toast.error('Please enter your name');
        return;
      }
      if (!isPasswordValid) {
        toast.error('Password does not meet the security requirements');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await register(email, password, name);
        toast.success('Account created! Welcome to ResearchLens.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="brand-mark" aria-label="ResearchLens">
            <span className="brand-orbit orbit-one" />
            <span className="brand-orbit orbit-two" />
            <span className="brand-core" />
          </div>
          <span className="brand-wordmark">
            research<span>lens</span>
          </span>
        </div>

        <div className="auth-hero">
          <h1>
            Make the paper
            <br />
            <em>the easy part.</em>
          </h1>
          <p>
            One calm workspace from first outline to last reviewer note.
          </p>
        </div>

        <div className="auth-features">
          {[
            { icon: <Lightbulb size={20} />, label: 'Guided outline', desc: 'Official IEEE learning & prompts' },
            { icon: <WandSparkles size={20} />, label: 'IEEE builder', desc: 'Notes to conference paper, structured' },
            { icon: <Gauge size={20} />, label: 'Smart analysis', desc: '7-dimension quality score & simulated review' },
            { icon: <BookOpen size={20} />, label: 'Paper chat', desc: 'RAG-powered Q&A with citations' },
          ].map((f) => (
            <div key={f.label} className="auth-feature-item">
              <span className="auth-feature-icon">{f.icon}</span>
              <div>
                <strong>{f.label}</strong>
                <small>{f.desc}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</h2>
            <p>
              {mode === 'login'
                ? 'Welcome back! Sign in to continue your research.'
                : 'Start shaping, analyzing, and publishing better research.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="name">Full Name</label>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input
                    id="name"
                    type="text"
                    placeholder="e.g. Monish Parmar"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input
                  id="email"
                  type="email"
                  placeholder="name@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Create a strong password' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="password-checklist">
                <span className="checklist-title">Password requirements</span>
                <div className="checklist-grid">
                  <div className={cn('check-item', hasMinLength ? 'valid' : 'invalid')}>
                    {hasMinLength ? <Check size={14} className="check-icon" /> : <X size={14} className="cross-icon" />}
                    <span>At least 8 characters</span>
                  </div>
                  <div className={cn('check-item', hasUppercase ? 'valid' : 'invalid')}>
                    {hasUppercase ? <Check size={14} className="check-icon" /> : <X size={14} className="cross-icon" />}
                    <span>1 uppercase letter (A-Z)</span>
                  </div>
                  <div className={cn('check-item', hasLowercase ? 'valid' : 'invalid')}>
                    {hasLowercase ? <Check size={14} className="check-icon" /> : <X size={14} className="cross-icon" />}
                    <span>1 lowercase letter (a-z)</span>
                  </div>
                  <div className={cn('check-item', hasNumber ? 'valid' : 'invalid')}>
                    {hasNumber ? <Check size={14} className="check-icon" /> : <X size={14} className="cross-icon" />}
                    <span>1 number (0-9)</span>
                  </div>
                  <div className={cn('check-item', hasSpecial ? 'valid' : 'invalid')}>
                    {hasSpecial ? <Check size={14} className="check-icon" /> : <X size={14} className="cross-icon" />}
                    <span>1 special character (!@#$)</span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit-button"
              disabled={isSubmitting || (mode === 'register' && !isPasswordValid)}
            >
              <span>{isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-footer">
            {mode === 'login' ? (
              <p>
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => setMode('register')}>
                  Create an account
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button type="button" onClick={() => setMode('login')}>
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
