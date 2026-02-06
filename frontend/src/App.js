import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

// Components
import Header from "./components/Header";
import Footer from "./components/Footer";

// Pages
import HomePage from "./pages/HomePage";
import LicitacionesPage from "./pages/LicitacionesPage";
import LicitacionDetailPage from "./pages/LicitacionDetailPage";
import FavoritosPage from "./pages/FavoritosPage";
import StatsPage from "./pages/StatsPage";
import AdminPage from "./pages/AdminPage";
import ScraperFormPage from "./pages/ScraperFormPage";
import OfferTemplatesPage from "./pages/OfferTemplatesPage";
import LoginPage from "./pages/LoginPage";

// Set up global backend URL
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
axios.defaults.baseURL = BACKEND_URL;
axios.defaults.withCredentials = true;

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

  return (
    <div className="App flex flex-col min-h-screen">
      <BrowserRouter>
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
            <Route path="/admin/scraper/:id" element={<ScraperFormPage />} />
            <Route path="/templates" element={<OfferTemplatesPage />} />
          </Routes>
        </main>
        <Footer />
      </BrowserRouter>
    </div>
  );
}

export default App;
