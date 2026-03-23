
import { useState, useEffect } from 'react';
import api from '../services/api';
import { formatDate } from '../utils/format';
import { Plus, Pencil, CheckCircle2, XCircle, Search } from 'lucide-react';



function MappingModal({ mapping, sageAccounts, onSave, onClose }) {
  const isEdit = !!mapping;
  const [form, setForm] = useState({
    cocca_id:           mapping?.cocca_id           || '',
    cocca_name:         mapping?.cocca_name         || '',
    sage_account_id:    mapping?.sage_account_id    || '',
    sage_account_name:  mapping?.sage_account_name  || '',
    is_active:          mapping?.is_active != null ? mapping.is_active : true,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSageChange = (e) => {
    const acct = sageAccounts.find(a => String(a.id) === e.target.value);
    setForm(f => ({ ...f, sage_account_id: acct?.id || '', sage_account_name: acct?.name || '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await api.put(`/mappings/${mapping.id}`, form);
      } else {
        await api.post('/mappings', form);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{isEdit ? 'Edit Registrar Mapping' : 'New Registrar Mapping'}</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="page-grid-2">
            <div className="input-group">
              <label className="input-label">CoCCA Registrar ID *</label>
              <input className="input" value={form.cocca_id} onChange={e => setForm(f => ({ ...f, cocca_id: e.target.value }))}
                placeholder="e.g. REG-001" required disabled={isEdit} />
            </div>
            <div className="input-group">
              <label className="input-label">Registrar Name *</label>
              <input className="input" value={form.cocca_name} onChange={e => setForm(f => ({ ...f, cocca_name: e.target.value }))}
                placeholder="e.g. Acme Domains Ltd" required />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">SAGE 200 Account *</label>
            <select className="select" value={String(form.sage_account_id)} onChange={handleSageChange} required>
              <option value="">— Select SAGE account —</option>
              {sageAccounts.map(a => (
                <option key={a.id} value={String(a.id)}>{a.name} {a.code ? `(${a.code})` : ''}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="input-group">
              <label className="input-label">Status</label>
              <select className="select" value={form.is_active ? '1' : '0'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === '1' }))}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Saving…</> : 'Save Mapping'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MappingsPage() {
  const [mappings,      setMappings]     = useState([]);
  const [sageAccounts,  setSageAccounts] = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [showModal,     setShowModal]    = useState(false);
  const [editing,       setEditing]      = useState(null);
  const [search,        setSearch]       = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        api.get('/mappings'),
        api.get('/mappings/sage-accounts'),
      ]);
      setMappings(m.data.data);
      setSageAccounts(s.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit   = (m) => { setEditing(m);   setShowModal(true); };
  const onSave     = ()  => { setShowModal(false); fetchAll(); };

  const filtered = mappings.filter(m =>
    !search || m.cocca_name.toLowerCase().includes(search.toLowerCase()) ||
    m.cocca_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="filters-row">
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Search registrar name or ID…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> New Mapping</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Loading mappings…</span></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Search size={28} />
            <p>{search ? 'No mappings match your search.' : 'No registrar mappings yet. Create one to start syncing.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CoCCA ID</th>
                  <th>Registrar Name</th>
                  <th>SAGE Account ID</th>
                  <th>SAGE Account Name</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td className="mono" style={{ color: 'var(--text-1)', fontSize: 12 }}>{m.cocca_id}</td>
                    <td style={{ color: 'var(--text-1)', fontWeight: 500 }}>{m.cocca_name}</td>
                    <td className="mono">{m.sage_account_id}</td>
                    <td>{m.sage_account_name}</td>
                    <td>
                      {m.is_active
                        ? <span className="badge posted"><CheckCircle2 size={10} /> Active</span>
                        : <span className="badge dead"><XCircle size={10} /> Inactive</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDate(m.created_at)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>
                        <Pencil size={11} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <MappingModal
          mapping={editing}
          sageAccounts={sageAccounts}
          onSave={onSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}