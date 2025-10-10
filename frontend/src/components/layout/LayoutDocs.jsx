// DocsLayout.jsx
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/layout/sidebar';
import GlobalSearch from '../components/common/GlobalSearch';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function DocsLayout() {
  const location = useLocation();
  const [queryParam, setQueryParam] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    setQueryParam(q);
  }, [location.search]);

  const handleSelect = item => {
    // Handle sidebar selection
  };

  // Don't show search on downloads page
  const isDownloadsPage = location.pathname === '/downloads';

  return (
    <div className="flex min-h-screen bg-white overflow-hidden">
      <Sidebar onSelect={handleSelect} highlight={queryParam} />

      <main className="flex-1 px-8 py-6 overflow-y-auto">
        {!isDownloadsPage && (
          <div className="flex justify-end mb-6">
            <GlobalSearch />
          </div>
        )}

        <Outlet />
      </main>
    </div>
  );
}
