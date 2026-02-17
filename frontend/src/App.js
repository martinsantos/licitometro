import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import axios from "axios";

// Components
import Header from "./components/Header";
import Footer from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";

// Pages
import HomePage from "./pages/HomePage";
import LicitacionesPage from "./pages/LicitacionesPage";
import LicitacionesArgentinaPage from "./pages/LicitacionesArgentinaPage";
import LicitacionDetailPage from "./pages/LicitacionDetailPage";
import FavoritosPage from "./pages/FavoritosPage";
import StatsPage from "./pages/StatsPage";
import AdminPage from "./pages/AdminPage";
import ScraperFormPage from "./pages/ScraperFormPage";
import OfferTemplatesPage from "./pages/OfferTemplatesPage";
import NodosPage from "./pages/NodosPage";
import LicitacionesARPage from "./pages/LicitacionesARPage";
import LoginPage from "./pages/LoginPage";
import PublicLicitacionPage from "./pages/PublicLicitacionPage";
import PublicListPage from "./pages/PublicListPage";

// Set up global backend URL
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
axios.defaults.baseURL = BACKEND_URL;
axios.defaults.withCredentials = true;

// Authenticated app shell with Header/Footer
const AuthenticatedApp = ({ userRole }) => (
  <div className="App flex flex-col min-h-screen">
    <Header userRole={userRole} />
    <main className="flex-grow">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/licitaciones-ar" element={<LicitacionesArgentinaPage apiUrl={BACKEND_URL} />} />
        <Route path="/licitaciones" element={<LicitacionesPage apiUrl={BACKEND_URL} />} />
        <Route path="/licitaciones/:id" element={<LicitacionDetailPage userRole={userRole} />} />
        <Route path="/licitacion/:id" element={<LicitacionDetailPage userRole={userRole} />} />
        <Route path="/favoritos" element={<FavoritosPage />} />
        <Route path="/stats" element={<StatsPage />} />
        {/* Admin-only routes */}
        <Route path="/admin" element={userRole === 'admin' ? <AdminPage /> : <Navigate to="/licitaciones" />} />
        <Route path="/admin/licitacion/:id" element={userRole === 'admin' ? <LicitacionDetailPage userRole={userRole} /> : <Navigate to="/licitaciones" />} />
        <Route path="/admin/scraper/:id" element={userRole === 'admin' ? <ScraperFormPage /> : <Navigate to="/licitaciones" />} />
        <Route path="/templates" element={userRole === 'admin' ? <OfferTemplatesPage /> : <Navigate to="/licitaciones" />} />
        <Route path="/nodos" element={userRole === 'admin' ? <NodosPage /> : <Navigate to="/licitaciones" />} />
      </Routes>
    </main>
    <Footer />
  </div>
);

function AppRouter({ authState, setAuthState }) {
  const location = useLocation();

  // Public routes - no auth required
  if (location.pathname.startsWith("/p/") || location.pathname === "/p") {
    return (
      <Routes>
        <Route path="/p" element={<PublicListPage />} />
        <Route path="/p/:slug" element={<PublicLicitacionPage />} />
      </Routes>
    );
  }

  // Loading state
  if (authState === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Cargando...</div>
      </div>
    );
  }

  // Backend unreachable - show error with retry
  if (authState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4 bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Servicio no disponible</h2>
          <p className="text-gray-500 mb-6">No se pudo conectar con el servidor. Verifique que el servicio backend esté funcionando.</p>
          <button
            onClick={() => { setAuthState(null); window.location.reload(); }}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (authState === false) {
    return (
      <LoginPage
        onLogin={(role, email) => setAuthState({ role, email })}
      />
    );
  }

  return <AuthenticatedApp userRole={authState.role} />;
}

function App() {
  // null = loading, false = not auth, { role, email } = authenticated
  const [authState, setAuthState] = useState(null);

  useEffect(() => {
    handleStartup();
  }, []);

  const handleStartup = async () => {
    // Check for ?token=xxx in URL (public access link from notifications)
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      try {
        await axios.post("/api/auth/token-login", { token });
        // Clean token from URL without reloading
        params.delete("token");
        const cleanUrl = params.toString()
          ? `${window.location.pathname}?${params.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      } catch {
        // Token invalid/expired, continue to normal auth check
      }
    }
    await checkAuth();
  };

  const checkAuth = async () => {
    try {
      const res = await axios.get("/api/auth/check");
      setAuthState({ role: res.data.role, email: res.data.email });
    } catch (err) {
      if (err.response && err.response.status === 401) {
        setAuthState(false); // Not authenticated - show login
      } else {
        // Backend unreachable or server error
        console.error("Backend connection error:", err.message);
        setAuthState('error');
      }
    }
  };

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppRouter authState={authState} setAuthState={setAuthState} />
    </BrowserRouter>
  );
}

export default App;
