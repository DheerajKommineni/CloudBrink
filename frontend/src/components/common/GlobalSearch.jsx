import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X } from 'lucide-react';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const wrapperRef = useRef();

  // Initialize query from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    setQuery(q);
  }, [location.search]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update URL with query parameter as user types
  //   useEffect(() => {
  //     const delayDebounce = setTimeout(() => {
  //       const params = new URLSearchParams(location.search);

  //       if (query.trim()) {
  //         params.set('q', query);
  //       } else {
  //         params.delete('q');
  //       }

  //       const newSearch = params.toString();
  //       const newUrl = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;

  //       // Only navigate if URL actually changed
  //       if (newUrl !== `${location.pathname}${location.search}`) {
  //         navigate(newUrl, { replace: true });
  //       }
  //     }, 300);

  //     return () => clearTimeout(delayDebounce);
  //   }, [query, location.pathname]);

  // Fetch search results (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();

        // Escape special regex characters
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // highlight matches in snippet
        const highlighted = data.map(r => {
          const safeSnippet = r.snippet.replace(/[<>]/g, ''); // sanitize
          const regex = new RegExp(`(${escapedQuery})`, 'gi');
          const highlightedSnippet = safeSnippet.replace(
            regex,
            `<mark class="bg-yellow-200 text-black font-semibold px-1 rounded">$1</mark>`,
          );
          return { ...r, highlightedSnippet, code: r.code };
        });

        setResults(highlighted);
        setOpen(true);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    // Clear URL parameter
    navigate(location.pathname, { replace: true });
  };

  return (
    <div ref={wrapperRef} className="relative w-96">
      {/* Search Input */}
      <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary">
        <Search className="h-5 w-5 text-gray-500 mr-2" />
        <input
          type="text"
          placeholder="Search documentation..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full outline-none text-sm text-gray-700"
        />
        {query && (
          <button
            onClick={handleClear}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {results.map((r, idx) => (
            <button
              key={idx}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-100 last:border-b-0"
              onClick={() => {
                const cleanFile = r.file
                  .replace(/\.md$/, '')
                  .replace(/\.pdf$/, '');
                setOpen(false);
                // Navigate WITHOUT query parameter - no highlights
                navigate(`/docs/${r.code}/${cleanFile}`);
                // Clear input
                setTimeout(() => setQuery(''), 100);
              }}
            >
              <p className="font-semibold text-gray-800 text-sm mb-1">
                {r.title}
              </p>
              <p
                className="text-gray-600 text-xs line-clamp-2 [&>mark]:bg-yellow-200 [&>mark]:text-black [&>mark]:font-semibold [&>mark]:px-1 [&>mark]:rounded"
                dangerouslySetInnerHTML={{ __html: r.highlightedSnippet }}
              />
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {open && query && results.length === 0 && (
        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm text-gray-500 text-center">
          No results found for "{query}"
        </div>
      )}
    </div>
  );
}
