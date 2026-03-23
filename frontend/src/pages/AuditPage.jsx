
import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { formatDate } from '../utils/format';
import { RefreshCw, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';




const EVENT_COLORS = {
  TRANSACTION_RECEIVED:  'var(--blue)',
  SAGE_POST_SUCCESS:     'var(--green)',
  SAGE_POST_FAILED:      'var(--red)',
  RETRY_TRIGGERED:       'var(--yellow)',
  MAPPING_CREATED:       'var(--amber)',
  MAPPING_UPDATED:       'var(--amber)',
  INCOME_RECOGNIZED:     'var(--green)',
  USER_LOGIN:            'var(--text-2)',
  USER_LOGIN_FAILED:     'var(--red)',
  USER_CREATED:          'var(--amber)',
};

const EVENT_TYPES = Object.keys(EVENT_COLORS);



export default function AuditPage() {
  const [logs,       setLogs]       = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [event,      setEvent]      = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (event) params.append('event', event);
      const { data } = await api.get(`/reports/audit-logs?${params}`);
      setLogs(data.data);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }, [page, event]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div>
      <div className="filters-row">
        <select className="select" style={{ width: 'auto' }} value={event} onChange={e => { setEvent(e.target.value); setPage(1); }}>
          <option value="">All event types</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={13} /> Refresh
        </button>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
          {pagination.total.toLocaleString()} total entries
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Loading audit log…</span></div>
        ) : logs.length === 0 ? (
          <div className="empty-state"><ScrollText size={28} /><p>No audit log entries.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>Performed By</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        color: EVENT_COLORS[log.event_type] || 'var(--text-2)',
                        whiteSpace: 'nowrap',
                      }}>
                        {log.event_type}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {log.entity_type ? `${log.entity_type}#${log.entity_id}` : '—'}
                    </td>
                    <td style={{ fontSize: 12.5, maxWidth: 360, color: 'var(--text-2)' }}>{log.description}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{log.performed_by || '—'}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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