import React from 'react';
import { Link } from 'react-router-dom';

const Header = () => {
  return (
    <header className="bg-blue-800 text-white shadow-md">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-2xl font-bold">
            <Link to="/" className="text-white hover:text-blue-200">
              LICITOMETRO
            </Link>
          </h1>
          <span className="ml-2 text-sm bg-yellow-500 text-blue-900 px-2 py-1 rounded-md">
            BETA
          </span>
        </div>
        <nav>
          <ul className="flex space-x-6">
            <li>
              <Link to="/" className="text-white hover:text-blue-200">
                Inicio
              </Link>
            </li>
            <li>
              <Link to="/licitaciones" className="text-white hover:text-blue-200">
                Licitaciones
              </Link>
            </li>
            <li>
              <Link to="/admin" className="text-white hover:text-blue-200">
                Admin
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
