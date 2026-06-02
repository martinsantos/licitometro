import React, { useState } from "react";
import { ApiError, api } from "../services/api";

interface LoginPageProps {
  onLogin: (role: string, email: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post<{ role: string; email: string }>("/api/auth/login", { email, password });
      onLogin(res.role, res.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.body : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="codex-page min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="codex-panel p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Licitometro</h1>
            <p className="text-gray-500 mt-2">Ingrese sus credenciales para acceder</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-lg"
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-lg"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="codex-button codex-button--primary w-full h-12 text-lg disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
