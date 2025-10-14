import Docs from './pages/Docs';
import Home from './pages/Home';
import DownloadsPage from './pages/DownloadsPage';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminPortal from './pages/AdminPortal';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Docs />} />
        <Route path="/admin" element={<AdminPortal />} />

        {/* Markdown-based documentation */}
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/:code/:filename" element={<Docs />} />

        {/* Downloads page with sidebar */}
        <Route path="/downloads" element={<DownloadsPage />} />

        {/* 404 fallback */}
        <Route
          path="*"
          element={
            <div className="p-8 text-center text-gray-500">
              404 — Page Not Found
            </div>
          }
        />
      </Routes>
    </Router>
  );
}
