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
import LicitacionDetailPage from "./pages/LicitacionDetailPage";
import FavoritosPage from "./pages/FavoritosPage";
import StatsPage from "./pages/StatsPage";
import AdminPage from "./pages/AdminPage";
import ScraperFormPage from "./pages/ScraperFormPage";
import OfferTemplatesPage from "./pages/OfferTemplatesPage";
import NodosPage from "./pages/NodosPage";
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
    } catch {
      setAuthState(false);
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
