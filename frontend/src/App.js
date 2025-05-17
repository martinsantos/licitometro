import React from "react";
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
import AdminPage from "./pages/AdminPage";
import ScraperFormPage from "./pages/ScraperFormPage";

// Set up global backend URL
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
axios.defaults.baseURL = BACKEND_URL;

function App() {
  return (
    <div className="App flex flex-col min-h-screen">
      <BrowserRouter>
        <Header />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/licitaciones" element={<LicitacionesPage />} />
            <Route path="/licitaciones/:id" element={<LicitacionDetailPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/scraper/:id" element={<ScraperFormPage />} />
          </Routes>
        </main>
        <Footer />
      </BrowserRouter>
    </div>
  );
}

export default App;
