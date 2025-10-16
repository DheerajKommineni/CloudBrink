import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/sidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import GlobalSearch from '../components/common/GlobalSearch.jsx';

export default function Docs() {
  const { code, filename } = useParams();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [queryParam, setQueryParam] = useState('');

  const [selectedItem, setSelectedItem] = useState(null);
  const [mdText, setMdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveSearchQuery, setLiveSearchQuery] = useState('');
  const searchRef = useRef();

  // Get query param (?q=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    setQueryParam(q);
  }, [location.search]);

  // Handles clicks in Sidebar and updates URL
  const handleSelect = item => {
    setSelectedItem(item);
    if (searchRef.current) {
      searchRef.current.clearSearch();
    }
    const cleanFile = item.file.replace(/\.pdf$/i, '').replace(/\.md$/i, '');
    navigate(`/docs/${item.code}/${cleanFile}`, { replace: true });
  };

  const handleSearchChange = query => {
    setLiveSearchQuery(query);
  };

  // Fetches markdown when route changes
  useEffect(() => {
    if (!code || !filename) return;

    const fetchMarkdown = async () => {
      setLoading(true);
      try {
        const mdFile = `${filename}.md`;
        const res = await fetch(`/api/docs/${code}/${mdFile}`);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        // Apply highlighting if there's a query
        let processedText = text;
        if (queryParam) {
          const escapedQuery = queryParam.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&',
          );
          const regex = new RegExp(`(${escapedQuery})`, 'gi');
          processedText = processedText.replace(
            regex,
            '<mark class="bg-yellow-200 text-black font-semibold">$1</mark>',
          );
        }

        setMdText(processedText);

        // Set selected item correctly
        setSelectedItem({
          code,
          file: mdFile,
          label: filename.replace(/_/g, ' '),
          title: code.replace(/([A-Z])/g, ' $1'),
        });
      } catch (error) {
        console.error('Error fetching Markdown:', error);
        setMdText('⚠️ Failed to load content.');
      } finally {
        setLoading(false);
      }
    };

    fetchMarkdown();
  }, [code, filename, queryParam]);

  // Update page title when document changes
  useEffect(() => {
    if (selectedItem?.label) {
      document.title = `${selectedItem.label} - CloudBrink Docs`;
    } else {
      document.title = 'CloudBrink Docs';
    }

    // Cleanup: reset title when component unmounts
    return () => {
      document.title = 'CloudBrink Docs';
    };
  }, [selectedItem]);

  // Show/hide scroll to top button
  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    const handleScroll = () => {
      setShowScrollTop(mainElement.scrollTop > 300);
    };

    mainElement.addEventListener('scroll', handleScroll);
    return () => mainElement.removeEventListener('scroll', handleScroll);
  }, [mdText]); // Add mdText as dependency so it re-attaches after content loads

  // Scroll to top function
  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Scroll to first match when content loads with query
  // Scroll to first match only when content first loads
  //   useEffect(() => {
  //     if (queryParam && mdText) {
  //       const firstMark = document.querySelector('mark');
  //       if (firstMark) {
  //         setTimeout(
  //           () =>
  //             firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' }),
  //           300,
  //         );
  //       }
  //     }
  //   }, [mdText]); // Only trigger when content changes, not when query changes

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar - Fixed position */}
      <Sidebar onSelect={handleSelect} highlight={liveSearchQuery} />

      {/* Right content area - Takes remaining space with left margin for sidebar */}
      <main
        ref={mainRef}
        className="flex-1 min-w-0 px-8 py-6 overflow-y-auto h-screen ml-64"
      >
        {/* Global Search Bar */}
        <div className="flex justify-end mb-6">
          <GlobalSearch ref={searchRef} onSearchChange={handleSearchChange} />
        </div>

        {selectedItem && (
          <div className="flex justify-end mb-6">
            <button
              onClick={() => {
                const pdfFile = selectedItem.file.replace(/\.md$/i, '.pdf');
                const url = `/api/download/${pdfFile}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = pdfFile;
                a.click();
              }}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary/90 shadow-sm transition"
            >
              ⬇️ Download PDF
            </button>
          </div>
        )}

        {/* Markdown Renderer */}
        <div className="max-w-5xl">
          {loading ? (
            <p className="text-gray-500 italic text-center">Loading...</p>
          ) : mdText ? (
            <div
              style={{ position: 'relative', bottom: '60px' }}
              className="prose prose-lg prose-gray max-w-none [&_mark]:bg-yellow-200 [&_mark]:text-black [&_mark]:font-semibold [&_mark]:px-1 [&_mark]:rounded"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: ({ node, ...props }) => (
                    <h1
                      className="text-3xl font-bold mt-8 mb-4 text-gray-900 border-b pb-2"
                      {...props}
                    />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2
                      className="text-2xl font-semibold mt-6 mb-3 text-gray-900"
                      {...props}
                    />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3
                      className="text-xl font-semibold mt-5 mb-2 text-gray-800"
                      {...props}
                    />
                  ),
                  p: ({ node, ...props }) => (
                    <p
                      className="leading-relaxed mb-4 text-gray-800"
                      {...props}
                    />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc ml-6 mb-4 space-y-2" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol
                      className="list-decimal ml-6 mb-4 space-y-2"
                      {...props}
                    />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="text-gray-800" {...props} />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong className="font-bold text-gray-900" {...props} />
                  ),
                  em: ({ node, ...props }) => (
                    <em className="italic" {...props} />
                  ),
                  a: ({ node, ...props }) => (
                    <a
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    />
                  ),
                  blockquote: ({ node, ...props }) => (
                    <blockquote
                      className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-700"
                      {...props}
                    />
                  ),
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneLight}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-lg my-4 border"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-red-600"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-4">
                      <table
                        className="min-w-full border-collapse border border-gray-300"
                        {...props}
                      />
                    </div>
                  ),
                  th: ({ node, ...props }) => (
                    <th
                      className="border border-gray-300 px-4 py-2 bg-gray-100 font-semibold text-left"
                      {...props}
                    />
                  ),
                  td: ({ node, ...props }) => (
                    <td
                      className="border border-gray-300 px-4 py-2"
                      {...props}
                    />
                  ),
                }}
              >
                {mdText}
              </ReactMarkdown>
            </div>
          ) : (
            <p
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
              }}
              className="text-gray-500 text-center"
            >
              Select a guide from the sidebar to view its content.
            </p>
          )}
        </div>
        {/* Scroll to Top Button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 bg-primary text-white p-3 rounded-full shadow-lg hover:bg-primary/90 transition-all duration-300 z-50"
            aria-label="Scroll to top"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </button>
        )}
      </main>
    </div>
  );
}
