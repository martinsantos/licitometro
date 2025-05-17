import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-gray-100 py-6 border-t border-gray-200 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-gray-600 text-sm">
              &copy; {new Date().getFullYear()} Licitometro - Sistema de Análisis de Licitaciones
            </p>
          </div>
          <div>
            <ul className="flex space-x-4">
              <li>
                <a href="#" className="text-gray-600 hover:text-blue-800 text-sm">
                  Términos y Condiciones
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-600 hover:text-blue-800 text-sm">
                  Privacidad
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-600 hover:text-blue-800 text-sm">
                  Contacto
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
