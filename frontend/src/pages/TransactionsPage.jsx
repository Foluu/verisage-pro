
import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { formatNGN, formatDate } from '../utils/format';
import StatusBadge from '../components/shared/StatusBadge';
import { RefreshCw, Search, RotateCcw, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';



const STATUSES = ['', 'pending', 'processing', 'posted', 'failed', 'dead'];




export default function TransactionsPage() {
  const [data,        setData]        = useState([]);
  const [pagination,  setPagination]  = useState({ page: 1, total: 0, pages: 1 });
  const [loading,     setLoading]     = useState(true);
  const [retrying,    setRetrying]    = useState(null);
  const [search,      setSearch]      = useState('');
  const [status,      setStatus]      = useState('');
  const [page,        setPage]        = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (status) params.append('status', status);
      if (search) params.append('search', search);
      const { data: res } = await api.get(`/transactions?${params}`);
      setData(res.data);
      setPagination(res.pagination);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRetry = async (id) => {
    setRetrying(id);
    try {
      await api.post(`/transactions/${id}/retry`);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div>
      {/* Filters */}
      <div className="filters-row">
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Search registrar, CoCCA ref, domain…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <select className="select" style={{ width: 'auto' }} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Loading transactions…</span></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><AlertTriangle size={28} /><p>No transactions match your filters.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>CoCCA Ref</th>
                  <th>Registrar</th>
                  <th>Amount (NGN)</th>
                  <th>VAT</th>
                  <th>Method</th>
                  <th>Domain</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>SAGE Ref</th>
                  <th>Retries</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map(tx => (
                  <tr key={tx.id}>
                    <td className="mono" style={{ color: 'var(--text-3)', fontSize: 11 }}>{tx.id}</td>
                    <td className="mono" style={{ color: 'var(--text-1)', fontSize: 11 }}>{tx.cocca_transaction_ref}</td>
                    <td style={{ color: 'var(--text-1)', fontWeight: 500 }}>{tx.registrar_name}</td>
                    <td className="mono" style={{ color: 'var(--amber)' }}>{formatNGN(tx.amount)}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{formatNGN(tx.vat_amount)}</td>
                    <td style={{ textTransform: 'capitalize', fontSize: 12 }}>{tx.payment_method?.replace('_', ' ')}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{tx.domain_name || '—'}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{formatDate(tx.top_up_date)}</td>
                    <td><StatusBadge status={tx.sync_status} /></td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{tx.sage_transaction_ref || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>{tx.retry_count}</td>
                    <td>
                      {(tx.sync_status === 'failed' || tx.sync_status === 'dead') && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRetry(tx.id)}
                          disabled={retrying === tx.id}
                        >
                          {retrying === tx.id
                            ? <><div className="spinner" style={{ width: 11, height: 11 }} /> Retrying</>
                            : <><RotateCcw size={11} /> Retry</>}
                        </button>
                      )}
                      {tx.last_error && tx.sync_status !== 'posted' && (
                        <div title={tx.last_error} style={{ cursor: 'help', marginTop: 2 }}>
                          <AlertTriangle size={12} color="var(--red)" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="pagination">
            <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(pagination.pages, 7) }, (_, i) => i + 1).map(p => (
              <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === pagination.pages}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}