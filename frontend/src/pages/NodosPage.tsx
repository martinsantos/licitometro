import React, { useState, useCallback } from 'react';
import { useNodos } from '../hooks/useNodos';
import NodoCard from '../components/nodos/NodoCard';
import NodoForm from '../components/nodos/NodoForm';
import type { Nodo } from '../types/licitacion';

const API_URL = process.env.REACT_APP_API_URL || '';

const NodosPage: React.FC = () => {
  const { nodos, loading, refetch } = useNodos();
  const [showForm, setShowForm] = useState(false);
  const [editingNodo, setEditingNodo] = useState<Nodo | null>(null);
  const [rematchStatus, setRematchStatus] = useState<Record<string, string>>({});

  const handleSave = useCallback(async (data: any) => {
    try {
      if (editingNodo) {
        await fetch(`${API_URL}/api/nodos/${editingNodo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      } else {
        await fetch(`${API_URL}/api/nodos/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      }
      setShowForm(false);
      setEditingNodo(null);
      refetch();
    } catch (err) {
      alert('Error al guardar nodo');
    }
  }, [editingNodo, refetch]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Eliminar este nodo? Se eliminará de todas las licitaciones.')) return;
    try {
      await fetch(`${API_URL}/api/nodos/${id}`, { method: 'DELETE', credentials: 'include' });
      refetch();
    } catch {
      alert('Error al eliminar');
    }
  }, [refetch]);

  const handleRematch = useCallback(async (id: string) => {
    setRematchStatus(prev => ({ ...prev, [id]: 'Procesando...' }));
    try {
      const resp = await fetch(`${API_URL}/api/nodos/${id}/rematch`, { method: 'POST', credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        setRematchStatus(prev => ({ ...prev, [id]: `${data.matched} matches` }));
        refetch();
      } else {
        setRematchStatus(prev => ({ ...prev, [id]: 'Error' }));
      }
    } catch {
      setRematchStatus(prev => ({ ...prev, [id]: 'Error' }));
    }
    setTimeout(() => setRematchStatus(prev => { const copy = { ...prev }; delete copy[id]; return copy; }), 3000);
  }, [refetch]);

  const handleEdit = useCallback((nodo: Nodo) => {
    setEditingNodo(nodo);
    setShowForm(true);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingNodo(null);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Nodos</h1>
          <p className="text-sm text-gray-500">Mapas semánticos de búsqueda — agrupa licitaciones por nubes de keywords</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditingNodo(null); setShowForm(true); }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition-colors"
          >
            + Nuevo Nodo
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6">
          <NodoForm nodo={editingNodo} onSave={handleSave} onCancel={handleCancel} />
        </div>
      )}

      {loading && !nodos.length && (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {nodos.map(nodo => (
          <div key={nodo.id} className="relative">
            <NodoCard nodo={nodo} onEdit={handleEdit} onDelete={handleDelete} onRematch={handleRematch} />
            {rematchStatus[nodo.id] && (
              <div className="absolute top-2 right-2 px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-lg animate-pulse">
                {rematchStatus[nodo.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && nodos.length === 0 && !showForm && (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">No hay nodos configurados</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold"
          >
            Crear primer nodo
          </button>
        </div>
      )}
    </div>
  );
};

export default NodosPage;
