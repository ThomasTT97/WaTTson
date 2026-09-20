import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { loginWithGoogle, logoutUser } from '../services/firebase';
import { Cloud, CheckCircle2, RefreshCw, AlertCircle, LogOut, ShieldCheck, ExternalLink, Copy, Check } from 'lucide-react';

interface FirebaseAuthCardProps {
  currentUser: User | null;
  cloudSyncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: Date | null;
  onAuthSuccess?: (user: User) => void;
  compact?: boolean;
}

export const FirebaseAuthCard: React.FC<FirebaseAuthCardProps> = ({
  currentUser,
  cloudSyncStatus,
  lastSyncedAt,
  onAuthSuccess,
  compact = false
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    setUnauthorizedDomain(null);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('wattson_explicit_login', 'true');
      }
      const user = await loginWithGoogle();
      if (onAuthSuccess) {
        onAuthSuccess(user);
      }
    } catch (err: any) {
      console.error("Sign in failed:", err);
      const isUnauthorizedDomain = 
        err.code === 'auth/unauthorized-domain' || 
        (err.message && err.message.includes('auth/unauthorized-domain'));

      if (isUnauthorizedDomain) {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'your-domain';
        setUnauthorizedDomain(currentHost);
      } else if (err.code === 'auth/popup-closed-by-user') {
        setErrorMsg("Sign-in cancelled. Please try again.");
      } else if (err.code === 'auth/popup-blocked') {
        setErrorMsg("Pop-up blocked by your browser. Please allow pop-ups for this site.");
      } else {
        setErrorMsg(err.message || "Failed to sign in with Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('wattson_auth_user_id');
        sessionStorage.removeItem('wattson_explicit_login');
      }
      await logoutUser();
    } catch (err: any) {
      console.error("Sign out failed:", err);
      setErrorMsg(err.message || "Failed to sign out.");
    } finally {
      setLoading(false);
    }
  };

  if (currentUser) {
    if (compact) {
      return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2.5 min-w-0">
            {currentUser.photoURL ? (
              <img 
                src={currentUser.photoURL} 
                alt={currentUser.displayName || 'Rider'} 
                className="w-7 h-7 rounded-full border border-emerald-400/40 object-cover flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs flex-shrink-0">
                {(currentUser.displayName || currentUser.email || 'R')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white truncate leading-tight">
                {currentUser.displayName || currentUser.email}
              </p>
              <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-medium">
                <Cloud size={10} className="stroke-[2.5]" />
                <span>Cloud Synced</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="text-[10px] text-slate-400 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors uppercase font-bold tracking-wider"
          >
            Sign Out
          </button>
        </div>
      );
    }

    return (
      <div className="glass-card p-4 rounded-[1.3rem] border border-emerald-500/20 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {currentUser.photoURL ? (
              <img 
                src={currentUser.photoURL} 
                alt={currentUser.displayName || 'Rider'} 
                className="w-10 h-10 rounded-xl border border-emerald-400/40 object-cover shadow-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-sm border border-emerald-500/30">
                {(currentUser.displayName || currentUser.email || 'R')[0].toUpperCase()}
              </div>
            )}
            <div className="text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-black text-white uppercase tracking-wider truncate">
                  {currentUser.displayName || 'Authenticated Rider'}
                </p>
                <ShieldCheck size={13} className="text-emerald-400 flex-shrink-0" />
              </div>
              <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                {currentUser.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-rose-400 px-2.5 py-1.5 rounded-xl border border-white/5 hover:border-rose-500/20 hover:bg-rose-500/10 transition-all uppercase tracking-wider"
            title="Sign out of Firebase"
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5">
            {cloudSyncStatus === 'syncing' ? (
              <>
                <RefreshCw size={11} className="text-amber-400 animate-spin" />
                <span className="text-amber-400 font-medium">Syncing with Firestore...</span>
              </>
            ) : cloudSyncStatus === 'error' ? (
              <>
                <AlertCircle size={11} className="text-rose-400" />
                <span className="text-rose-400 font-medium">Sync error</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={11} className="text-emerald-400" />
                <span className="text-emerald-400 font-medium">Goal, chat history & preferences synced</span>
              </>
            )}
          </div>
          <span className="text-[9px] text-slate-500 font-mono">
            {lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Firebase Connected'}
          </span>
        </div>
      </div>
    );
  }

  // Logged out state
  return (
    <div className={`glass-card ${compact ? 'p-3' : 'p-4'} rounded-[1.3rem] border border-white/10 shadow-sm relative overflow-hidden`}>
      <div className="flex flex-col gap-3">
        {!compact && (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0 border border-blue-500/20">
              <Cloud size={18} />
            </div>
            <div>
              <p className="text-[12px] font-black text-white uppercase tracking-wider">
                Cross-Device Cloud Sync
              </p>
              <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">
                Sign in with Google to sync your goal, chat history with waTTson, training preferences, and training plan across all your devices.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 font-medium flex items-center gap-2">
            <AlertCircle size={13} className="flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {unauthorizedDomain && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-left space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-bold text-amber-300">Firebase Domain Authorization Required</p>
                <p className="text-[10px] text-slate-300 mt-0.5 leading-relaxed">
                  Firebase Authentication restricts logins to verified domains for security.
                </p>
              </div>
            </div>

            <div className="p-2 bg-black/50 rounded-xl border border-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[8.5px] text-slate-400 block uppercase font-mono tracking-wider">Domain to add:</span>
                <code className="text-[11px] text-emerald-400 font-mono font-bold truncate block">{unauthorizedDomain}</code>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(unauthorizedDomain);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-[10px] font-bold text-white rounded-lg transition-all flex items-center gap-1 shrink-0"
              >
                {copied ? (
                  <>
                    <Check size={11} className="text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-1 text-[9.5px] text-slate-300 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
              <p className="font-bold text-amber-200 uppercase tracking-wider text-[8.5px]">Steps to enable:</p>
              <ol className="list-decimal list-inside space-y-1 leading-normal">
                <li>Go to Firebase Console Settings</li>
                <li>Under <strong>Authorized domains</strong>, click <strong>Add domain</strong></li>
                <li>Paste <span className="text-emerald-300 font-mono font-semibold">{unauthorizedDomain}</span> and click Save</li>
              </ol>
            </div>

            <a
              href="https://console.firebase.google.com/project/gen-lang-client-0917341144/authentication/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-amber-300 hover:text-amber-200 transition-colors pt-0.5"
            >
              <span>Open Firebase Auth Settings</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black py-2.5 px-4 rounded-xl text-[11px] uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] shadow-md disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw size={14} className="animate-spin text-slate-700" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>{loading ? "Connecting..." : "Sign in with Google"}</span>
        </button>
      </div>
    </div>
  );
};
