import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
const AuthenticatedApp = () => (
  <div className="App flex flex-col min-h-screen">
    <Header />
    <main className="flex-grow">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/licitaciones" element={<LicitacionesPage apiUrl={BACKEND_URL} />} />
        <Route path="/licitaciones/:id" element={<LicitacionDetailPage />} />
        <Route path="/licitacion/:id" element={<LicitacionDetailPage />} />
        <Route path="/favoritos" element={<FavoritosPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/licitacion/:id" element={<LicitacionDetailPage />} />
        <Route path="/admin/scraper/:id" element={<ScraperFormPage />} />
        <Route path="/templates" element={<OfferTemplatesPage />} />
        <Route path="/nodos" element={<NodosPage />} />
      </Routes>
    </main>
    <Footer />
  </div>
);

function AppRouter({ authenticated, setAuthenticated }) {
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
  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Cargando...</div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return <AuthenticatedApp />;
}

function App() {
  const [authenticated, setAuthenticated] = useState(null); // null = loading

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      await axios.get("/api/auth/check");
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
    }
  };

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppRouter authenticated={authenticated} setAuthenticated={setAuthenticated} />
    </BrowserRouter>
  );
}

export default App;
