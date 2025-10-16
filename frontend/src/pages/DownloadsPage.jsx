import { useEffect, useState } from 'react';
import Sidebar from '../components/layout/sidebar';
import GlobalSearch from '../components/common/GlobalSearch';

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState([]);

  useEffect(() => {
    document.title = 'Downloads - Cloudbrink Docs';

    // Fetch from backend
    fetch('/api/downloads')
      .then(res => res.json())
      .then(data => setDownloads(data))
      .catch(err => console.error('Failed to load downloads:', err));
  }, []);

  const handleSelect = () => {};

  return (
    <div className="flex min-h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar onSelect={handleSelect} highlight="" />

      {/* Main Content */}
      <main className="flex-1 px-8 py-6 overflow-y-auto ml-64">
        <div className="flex justify-end mb-6">
          <GlobalSearch />
        </div>

        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold text-darkText mb-8">Downloads</h1>
          <p className="text-lg text-gray-700 mb-10">
            Please select the agent that matches your operating system
          </p>

          {/* Download Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {downloads.map(item => (
              <div
                key={item.os_name}
                className="flex flex-col items-center p-6 border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition"
              >
                <h3 className="text-xl font-semibold mb-3 text-gray-900 capitalize">
                  {item.os_name}
                </h3>
                <p className="text-gray-700 text-sm text-center mb-6">
                  {item.description}
                </p>

                <a
                  href={item.download_url}
                  className="bg-primary text-white text-sm font-semibold rounded-full px-8 py-3 hover:bg-primary/90 transition inline-flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download Now
                </a>

                <p className="text-xs text-gray-500 mt-3">
                  Version {item.version}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
