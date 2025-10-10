import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useMemo } from 'react';

const Sidebar = ({ onSelect, highlight }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);

  // Filter sections based on search query
  const filteredSections = useMemo(() => {
    if (!highlight || highlight.trim() === '') {
      return allSections;
    }

    const searchLower = highlight.toLowerCase();

    return allSections
      .map(section => ({
        ...section,
        items: section.items.filter(item =>
          item.label.toLowerCase().includes(searchLower),
        ),
      }))
      .filter(section => section.items.length > 0);
  }, [highlight]);

  // Extract current section and filename from URL
  const match = location.pathname.match(/\/docs\/([^/]+)\/([^/]+)/);
  const currentSection = match ? match[1] : null;
  const currentFile = match ? match[2] : null;

  const handleItemClick = item => {
    onSelect(item);
    const cleanFile = item.file.replace(/\.pdf$/i, '').replace(/\.md$/i, '');
    navigate(
      `/docs/${item.section}/${cleanFile}${highlight ? `?q=${highlight}` : ''}`,
    );
  };

  // Highlight text helper with proper regex escaping
  const highlightText = text => {
    if (!highlight || highlight.trim() === '') return text;
    // Escape special regex characters
    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    return text.replace(
      regex,
      "<mark class='bg-yellow-300 text-black font-semibold px-1 py-0.5 rounded'>$1</mark>",
    );
  };

  // Scroll to first highlighted match in sidebar
  useEffect(() => {
    if (highlight) {
      const firstMatch = sidebarRef.current?.querySelector('mark');
      if (firstMatch) {
        setTimeout(() => {
          firstMatch.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 100);
      }
    }
  }, [highlight, filteredSections]);

  return (
    <aside
      ref={sidebarRef}
      className="w-72 bg-white border-r border-gray-200 shadow-sm h-screen overflow-y-auto"
    >
      <div className="p-5">
        <h2 className="text-xl font-bold text-primary mb-6">Documentation</h2>

        {/* Search results count */}
        {highlight && (
          <div className="mb-4 text-sm text-gray-600">
            {filteredSections.reduce(
              (acc, section) => acc + section.items.length,
              0,
            )}{' '}
            result(s) for "{highlight}"
          </div>
        )}

        {/* Show message if no results */}
        {highlight && filteredSections.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-8">
            No documents found matching "{highlight}"
          </div>
        )}

        <nav className="space-y-4">
          {filteredSections.map((section, idx) =>
            section.isStatic ? (
              <div key={idx} className="mt-6">
                <button
                  onClick={() => navigate(section.path)}
                  className={`block w-full text-left px-3 py-2 rounded-md text-sm font-medium transition ${
                    location.pathname === section.path
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {section.title}
                </button>
              </div>
            ) : (
              <div key={idx}>
                <p className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">
                  {section.title}
                </p>
                <ul className="space-y-1">
                  {section.items.map(item => {
                    const cleanFile = item.file
                      .replace(/\.pdf$/i, '')
                      .replace(/\.md$/i, '');
                    const isActive = location.pathname.includes(
                      `/docs/${section.section}/${cleanFile}`,
                    );

                    return (
                      <li key={item.id}>
                        <button
                          onClick={() =>
                            handleItemClick({
                              ...item,
                              section: section.section,
                              title: section.title,
                            })
                          }
                          className={`block w-full text-left px-3 py-2 rounded-md text-sm transition ${
                            isActive
                              ? 'bg-primary text-white font-medium'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <span
                            dangerouslySetInnerHTML={{
                              __html: highlightText(item.label),
                            }}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          )}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
