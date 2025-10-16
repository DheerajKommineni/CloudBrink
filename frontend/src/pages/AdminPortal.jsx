import { useEffect, useState, useRef } from 'react';
import {
  Upload,
  Trash2,
  Edit3,
  Save,
  FileText,
  CheckSquare,
  Square,
} from 'lucide-react';
import axios from 'axios';

export default function AdminPortal() {
  const [documents, setDocuments] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);

  const [newDocs, setNewDocs] = useState({
    section: '',
    description: '',
    files: [],
  });
  const [editingDoc, setEditingDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [toast, setToast] = useState(null);

  const sections = ['Admin Guides', 'How-to Guides', 'Release Notes'];
  const fileInputRef = useRef(null);

  // 🎉 Toast notification with auto-dismiss
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 📦 Fetch all uploaded documents
  const fetchDocuments = async () => {
    try {
      const res = await axios.get('/api/admin/uploads');
      const sorted = res.data.sort(
        (a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at),
      );
      setDocuments(sorted);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  useEffect(() => {
    document.title = 'CloudBrink Docs- Admin';
    fetchDocuments();
  }, []);

  // 📤 Upload multiple new documents
  const handleUpload = async e => {
    e.preventDefault();
    if (newDocs.files.length === 0) {
      showToast('Please select at least one PDF file', 'error');
      return;
    }
    if (!newDocs.section) {
      showToast('Please select a category', 'error');
      return;
    }

    const formData = new FormData();
    newDocs.files.forEach(file => formData.append('files', file));
    formData.append('section', newDocs.section);
    formData.append('description', newDocs.description);

    try {
      setUploading(true);
      await axios.post('/api/admin/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('Files uploaded successfully!');
      setNewDocs({ section: '', description: '', files: [] });
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDocuments();
    } catch (err) {
      console.error('Upload failed:', err);
      showToast('Upload failed. Check console for details.', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ✏️ Update metadata
  const handleUpdate = async id => {
    try {
      setLoading(true);
      await axios.put(`/api/admin/update/${id}`, {
        description: editingDoc.description,
        section: editingDoc.section,
      });
      showToast('Updated successfully!');
      setEditingDoc(null);
      fetchDocuments();
    } catch (err) {
      console.error('Update failed:', err);
      showToast('Failed to update document.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 🗑️ Delete single document
  const handleDelete = async id => {
    if (!window.confirm('Are you sure you want to delete this document?'))
      return;
    try {
      await axios.delete(`/api/admin/delete/${id}`);
      showToast('Deleted successfully!');
      fetchDocuments();
      setSelectedDocs(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete document.', 'error');
    }
  };

  // 🗑️ Delete multiple documents
  const handleBulkDelete = async () => {
    if (selectedDocs.size === 0) {
      showToast('No documents selected', 'error');
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedDocs.size} document(s)?`,
      )
    )
      return;

    try {
      setLoading(true);
      await Promise.all(
        Array.from(selectedDocs).map(id =>
          axios.delete(`/api/admin/delete/${id}`),
        ),
      );
      showToast(`${selectedDocs.size} document(s) deleted successfully!`);
      setSelectedDocs(new Set());
      fetchDocuments();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      showToast('Failed to delete some documents.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Toggle selection
  const toggleSelection = id => {
    setSelectionMode(true); // show checkboxes when a selection starts
    setSelectedDocs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);

      // If nothing left selected, exit selection mode
      if (newSet.size === 0) setSelectionMode(false);

      return newSet;
    });
  };

  // Select/Deselect all in category
  const toggleCategorySelection = category => {
    const categoryDocs = groupedDocs[category];
    const categoryIds = categoryDocs.map(d => d.id);
    const allSelected = categoryIds.every(id => selectedDocs.has(id));

    setSelectedDocs(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        categoryIds.forEach(id => newSet.delete(id));
      } else {
        categoryIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const groupedDocs = {
    'Admin Guides': documents.filter(d => d.section === 'Admin Guides'),
    'How-to Guides': documents.filter(d => d.section === 'How-to Guides'),
    'Release Notes': documents.filter(d => d.section === 'Release Notes'),
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 animate-fade-in ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {toast.message}
        </div>
      )}

      <h1 className="text-3xl font-bold text-gray-800 mb-8">
        Cloudbrink Admin Portal
      </h1>

      {/* ================= Upload Section ================= */}
      <div className="bg-white p-6 rounded-xl shadow-md mb-10 max-w-3xl">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" /> Add New Documents
        </h2>

        <form
          onSubmit={handleUpload}
          className="space-y-4 text-sm text-gray-700"
        >
          {/* Category */}
          <div>
            <label className="font-medium">Category</label>
            <select
              className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2"
              value={newDocs.section}
              onChange={e =>
                setNewDocs(prev => ({ ...prev, section: e.target.value }))
              }
              required
            >
              <option value="">Select Category</option>
              {sections.map(sec => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="font-medium">Description</label>
            <textarea
              rows="2"
              className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2"
              placeholder="Short description for these documents"
              value={newDocs.description}
              onChange={e =>
                setNewDocs(prev => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="font-medium">Select PDF(s)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="block mt-2 text-sm"
              onChange={e =>
                setNewDocs(prev => ({
                  ...prev,
                  files: Array.from(e.target.files),
                }))
              }
              required
            />
            {newDocs.files.length > 0 && (
              <div className="mt-3 text-sm text-gray-600 space-y-1">
                {newDocs.files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span>{f.name}</span>
                    <span className="text-gray-400 text-xs">
                      ({(f.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={uploading}
            className="bg-teal-600 text-white px-5 py-2 rounded-lg hover:bg-teal-700 transition mt-2 disabled:opacity-50"
          >
            {uploading
              ? `Uploading ${newDocs.files.length} file(s)...`
              : 'Upload Documents'}
          </button>
        </form>
      </div>

      {/* ================= Documents Grouped ================= */}
      <div className="bg-white p-6 rounded-xl shadow-md mt-10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            📚 Uploaded Documents
          </h2>

          <div className="flex items-center gap-3">
            {selectionMode ? (
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedDocs(new Set());
                }}
                className="bg-white border border-teal-600 text-teal-600 px-4 py-2 rounded-lg hover:bg-teal-50 hover:border-teal-700 transition font-medium shadow-sm"
              >
                Cancel Selection
              </button>
            ) : (
              <button
                onClick={() => setSelectionMode(true)}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition font-medium shadow-sm"
              >
                Select Documents
              </button>
            )}

            {selectedDocs.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={loading}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition flex items-center gap-2 font-medium disabled:opacity-50 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedDocs.size})
              </button>
            )}
          </div>
        </div>

        {['Admin Guides', 'How-to Guides', 'Release Notes'].map(category => (
          <div key={category} className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-lg font-semibold text-primary border-b pb-1 flex-grow">
                {category}
              </h3>
              {groupedDocs[category].length > 0 && (
                <button
                  onClick={() => toggleCategorySelection(category)}
                  className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
                >
                  {groupedDocs[category].every(d => selectedDocs.has(d.id)) ? (
                    <>
                      <CheckSquare className="w-4 h-4" /> Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" /> Select All
                    </>
                  )}
                </button>
              )}
            </div>

            {groupedDocs[category].length > 0 ? (
              <table className="min-w-full text-sm border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    {selectionMode && (
                      <th className="py-2 px-4 border w-12 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={groupedDocs[category].every(d =>
                            selectedDocs.has(d.id),
                          )}
                          onChange={() => toggleCategorySelection(category)}
                        />
                      </th>
                    )}
                    <th className="py-2 px-4 border">Filename</th>
                    <th className="py-2 px-4 border">Description</th>
                    <th className="py-2 px-4 border w-32 text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDocs[category].map(doc => (
                    <tr
                      key={doc.id}
                      className={`border-t ${
                        selectedDocs.has(doc.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      {selectionMode && (
                        <td className="py-2 px-4 border text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={selectedDocs.has(doc.id)}
                            onChange={() => toggleSelection(doc.id)}
                          />
                        </td>
                      )}
                      <td className="py-2 px-4 border break-words max-w-xs">
                        {doc.filename}
                      </td>
                      <td className="py-2 px-4 border">
                        {editingDoc?.id === doc.id ? (
                          <input
                            type="text"
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                            value={editingDoc.description}
                            onChange={e =>
                              setEditingDoc(prev => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          doc.description
                        )}
                      </td>
                      <td className="py-2 px-4 border text-center space-x-2">
                        {editingDoc?.id === doc.id ? (
                          <button
                            onClick={() => handleUpdate(doc.id)}
                            className="text-green-600 hover:text-green-800"
                            disabled={loading}
                          >
                            <Save className="w-4 h-4 inline-block" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingDoc(doc)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit3 className="w-4 h-4 inline-block" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4 inline-block" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-400 italic ml-2">
                No documents in this category.
              </p>
            )}
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
