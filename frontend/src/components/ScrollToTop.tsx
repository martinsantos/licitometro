import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    // Skip if returning to list with saved scroll position
    if (pathname === '/licitaciones' && sessionStorage.getItem('licitacion_scrollY')) {
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

export default ScrollToTop;
