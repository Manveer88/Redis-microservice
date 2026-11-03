import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Mail, Lock, LogIn, AlertCircle } from "lucide-react";
import useAuth from "../hooks/useAuth";
import { getErrorMessage } from "../utils/errors";

const loginErrorMessage = (err) => {
    const status = err.response?.status;

    if (status === 401) {
        return "Invalid email or password";
    }

    if (status === 429) {
        return "Too many login attempts. Please wait 15 minutes and try again.";
    }

    return getErrorMessage(err, "Unable to sign in. Please try again.");
};

function Login() {
    const { user, login } = useAuth();
    const location = useLocation();
    const [form, setForm] = useState({ email: "", password: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const from = location.state?.from;
    const target = from && from.pathname !== "/login"
        ? `${from.pathname}${from.search || ""}`
        : "/";

    if (user) {
        return <Navigate to={target} replace />;
    }

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");

        try {
            await login(form.email.trim(), form.password);
        } catch (err) {
            setError(loginErrorMessage(err));
            setBusy(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="sidebar-logo login-logo">
                    <div className="logo-icon">R</div>
                    <div>
                        <h2>RadiusPro</h2>
                        <span>Management System</span>
                    </div>
                </div>

                <h1>Sign in</h1>
                <p className="login-subtitle">Use your administrator account to continue.</p>

                <form className="form-grid" onSubmit={handleSubmit}>
                    <label className="field">
                        <span>Email</span>
                        <div className="input-icon">
                            <Mail size={16} />
                            <input
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                autoComplete="username"
                                placeholder="admin@example.com"
                                autoFocus
                                required
                            />
                        </div>
                    </label>

                    <label className="field">
                        <span>Password</span>
                        <div className="input-icon">
                            <Lock size={16} />
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                autoComplete="current-password"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </label>

                    {error && (
                        <div className="form-error">
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    <button type="submit" className="primary-button block" disabled={busy}>
                        <LogIn size={16} />
                        {busy ? "Signing in..." : "Sign in"}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
