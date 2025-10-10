import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useMemo, useState } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

const Sidebar = ({ onSelect, highlight }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);
  const [allSections, setAllSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({});

  // Fetch all documents from backend on mount
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await fetch('/api/docs');
        const data = await res.json();

        console.log('📦 Raw data from API:', data);

        // Add static Downloads section at the end
        const sectionsWithDownloads = [
          ...data,
          {
            title: 'Downloads',
            section: 'downloads',
            isStatic: true,
            items: [],
          },
        ];

        console.log('📦 Sections with downloads:', sectionsWithDownloads);
        setAllSections(sectionsWithDownloads);

        // Initially collapse all sections (start with empty object = all false)
        setExpandedSections({});
      } catch (error) {
        console.error('Failed to fetch documents:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDocs();
  }, []);

  // Filter sections based on search query
  const filteredSections = useMemo(() => {
    // Always include all sections with their original index
    const sectionsWithIndex = allSections.map((section, idx) => ({
      ...section,
      originalIndex: idx,
    }));

    if (!highlight || highlight.trim() === '') {
      return sectionsWithIndex;
    }

    const searchLower = highlight.toLowerCase();

    // Mark sections that have at least one matching item
    return sectionsWithIndex.map(section => {
      // Keep static sections always visible
      if (section.isStatic) {
        return { ...section, hasMatch: false };
      }

      return {
        ...section,
        hasMatch: section.items.some(item =>
          item.label.toLowerCase().includes(searchLower),
        ),
      };
    });
  }, [highlight, allSections]);

  // Auto-expand only sections that have matches when searching
  useEffect(() => {
    if (highlight && highlight.trim() !== '') {
      const newExpandedSections = {};
      filteredSections.forEach(section => {
        // Only expand sections that have at least one match
        if (section.hasMatch) {
          newExpandedSections[section.originalIndex] = true;
        }
      });
      setExpandedSections(newExpandedSections);
    } else {
      // Collapse all when search is cleared
      setExpandedSections({});
    }
  }, [highlight, filteredSections]);

  // Extract current section and filename from URL
  const match = location.pathname.match(/\/docs\/([^/]+)\/([^/]+)/);
  const currentSection = match ? match[1] : null;
  const currentFile = match ? match[2] : null;

  const handleItemClick = item => {
    console.log('code', item.code);
    onSelect(item);
    const cleanFile = item.file.replace(/\.pdf$/i, '').replace(/\.md$/i, '');
    navigate(
      `/docs/${item.code}/${cleanFile}${highlight ? `?q=${highlight}` : ''}`,
    );
  };

  const toggleSection = idx => {
    setExpandedSections(prev => ({
      ...prev,
      [idx]: !prev[idx],
    }));
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

  // Scroll to first highlighted match in sidebar only after navigation
  // useEffect(() => {
  //   if (highlight && highlight.trim() !== '' && currentFile) {
  //     // Only scroll if we're on a specific document page
  //     setTimeout(() => {
  //       const firstMatch = sidebarRef.current?.querySelector('mark');
  //       if (firstMatch) {
  //         firstMatch.scrollIntoView({
  //           behavior: 'smooth',
  //           block: 'center',
  //         });
  //       }
  //     }, 300);
  //   }
  // }, [currentFile]); // Only trigger on file change, not on highlight change

  useEffect(() => {
    if (currentSection && currentFile) {
      // Find which section contains the current file
      filteredSections.forEach((section, idx) => {
        if (
          section.code === currentSection ||
          section.section === currentSection
        ) {
          setExpandedSections(prev => ({
            ...prev,
            [section.originalIndex]: true,
          }));
        }
      });
    }
  }, [currentSection, currentFile, filteredSections]);

  if (loading) {
    return (
      <aside className="w-60 flex-shrink-0 bg-white h-screen overflow-y-auto px-3">
        <div className="px-4 py-5">
          <h2 className="text-xl font-bold text-primary mb-6">Documentation</h2>
          <p className="text-sm text-gray-500">Loading documents...</p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      ref={sidebarRef}
      className="w-64 flex-shrink-0 bg-white h-screen overflow-y-auto px-3"
    >
      <div className="px-4 py-5">
        <h2 className="text-xl font-bold text-primary mb-6">Documentation</h2>

        {highlight && (
          <div className="mb-4 text-sm text-gray-600">
            {filteredSections.reduce((acc, section) => {
              if (section.hasMatch) {
                const matchCount = section.items.filter(item =>
                  item.label.toLowerCase().includes(highlight.toLowerCase()),
                ).length;
                return acc + matchCount;
              }
              return acc;
            }, 0)}{' '}
            result(s) for "{highlight}"
          </div>
        )}

        {highlight && !filteredSections.some(s => s.hasMatch) && (
          <div className="text-sm text-gray-500 text-center py-8">
            No documents found matching "{highlight}"
          </div>
        )}

        <nav className="space-y-2">
          {['Admin Guides', 'How-to Guides', 'Release Notes'].map(
            (sectionTitle, index) => {
              // Find the section from filteredSections instead of allSections
              const section = filteredSections.find(
                s => s.title === sectionTitle,
              ) || {
                title: sectionTitle,
                section: sectionTitle,
                items: [],
                originalIndex: index,
              };

              // Use the section's originalIndex for expansion state
              const isExpanded = expandedSections[section.originalIndex];

              return (
                <div
                  key={sectionTitle}
                  className="border-b border-gray-100 last:border-b-0"
                >
                  {/* Section Header */}
                  <button
                    onClick={() =>
                      setExpandedSections(prev => ({
                        ...prev,
                        [section.originalIndex]: !prev[section.originalIndex],
                      }))
                    }
                    className="flex items-center w-full text-left py-2 hover:bg-gray-50 rounded transition group"
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-gray-700 text-sm">
                      {sectionTitle}
                    </span>
                  </button>

                  {/* Section Items */}
                  {isExpanded && (
                    <ul className="ml-6 space-y-1 mt-1 mb-3 animate-fadeIn">
                      {section.items && section.items.length > 0 ? (
                        [...section.items].reverse().map(item => {
                          const cleanFile = item.file
                            .replace(/\.pdf$/i, '')
                            .replace(/\.md$/i, '');
                          const isActive =
                            currentSection === (item.code || section.code) &&
                            currentFile === cleanFile;

                          return (
                            <li key={item.id}>
                              <button
                                onClick={() =>
                                  handleItemClick({
                                    ...item,
                                    section: section.section,
                                    title: section.title,
                                    code: item.code || section.code,
                                  })
                                }
                                className={`relative block w-full text-left px-3 py-2 rounded-lg text-sm transition overflow-visible ${
                                  isActive
                                    ? 'bg-primary text-white font-medium shadow-sm ring-1 ring-primary/30'
                                    : 'text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {highlight && highlight.trim() !== '' ? (
                                  <span
                                    className={`block text-left text-[13px] leading-snug font-medium break-words whitespace-normal [&>mark]:bg-yellow-300 [&>mark]:text-black [&>mark]:font-semibold [&>mark]:px-1 [&>mark]:py-0.5 [&>mark]:rounded ${
                                      isActive ? 'text-white' : 'text-gray-700'
                                    }`}
                                    style={{
                                      wordBreak: 'break-word',
                                      overflowWrap: 'break-word',
                                    }}
                                    dangerouslySetInnerHTML={{
                                      __html: highlightText(
                                        item.label.replace(/_/g, ' '),
                                      ),
                                    }}
                                  />
                                ) : (
                                  <span
                                    className={`block text-left text-[13px] leading-snug font-medium ${
                                      isActive ? 'text-white' : 'text-gray-700'
                                    } break-words whitespace-normal`}
                                    style={{
                                      wordBreak: 'break-word',
                                      overflowWrap: 'break-word',
                                    }}
                                  >
                                    {item.label.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })
                      ) : (
                        <li className="text-xs text-gray-400 px-3 py-2 italic">
                          No documents in this section
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            },
          )}

          {/* 📁 Divider before Downloads */}
          <div className="mt-4 border-t border-gray-200 pt-4">
            <button
              onClick={() => navigate('/downloads')}
              className={`block w-full text-left px-3 py-2 rounded-md text-sm font-semibold transition ${
                location.pathname === '/downloads'
                  ? 'bg-primary text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Downloads
            </button>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
