
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { formatNGN, formatDate } from '../utils/format';
import StatusBadge from '../components/shared/StatusBadge';
import { ArrowUpRight, CheckCircle2, Clock, AlertCircle, XCircle, Zap } from 'lucide-react';



function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}


export default function DashboardPage() {
  const [stats,  setStats]  = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/transactions/stats'),
      api.get('/transactions?limit=8'),
    ]).then(([s, t]) => {
      setStats(s.data.data);
      setRecent(t.data.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner" /><span>Loading dashboard…</span></div>;

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid">
        <StatCard label="Total Transactions" value={stats?.total ?? '—'} sub={`NGN ${formatNGN(stats?.total_amount)} total`} accent="amber" />
        <StatCard label="Posted to SAGE"     value={stats?.posted ?? '—'} sub={formatNGN(stats?.total_posted_amount)} accent="green" />
        <StatCard label="Pending / Processing" value={(stats?.pending ?? 0) + (stats?.processing ?? 0)} sub="Awaiting SAGE sync" accent="blue" />
        <StatCard label="Failed"             value={stats?.failed ?? '—'} sub={stats?.dead ? `${stats.dead} unrecoverable` : 'Eligible for retry'} accent="red" />
        <StatCard label="Today"              value={stats?.today_count ?? '—'} sub={formatNGN(stats?.today_amount)} accent="amber" />
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Transactions</div>
          <Link to="/transactions" className="btn btn-ghost btn-sm">
            View all <ArrowUpRight size={12} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state">
            <Zap size={28} />
            <p>No transactions received yet.<br />Waiting for CoCCA webhook…</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CoCCA Ref</th>
                  <th>Registrar</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>SAGE Ref</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(tx => (
                  <tr key={tx.id}>
                    <td className="mono" style={{ color: 'var(--text-1)', fontSize: 12 }}>{tx.cocca_transaction_ref}</td>
                    <td style={{ color: 'var(--text-1)' }}>{tx.registrar_name}</td>
                    <td className="mono" style={{ color: 'var(--amber)' }}>{formatNGN(tx.amount)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{tx.payment_method?.replace('_', ' ')}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{formatDate(tx.top_up_date)}</td>
                    <td><StatusBadge status={tx.sync_status} /></td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{tx.sage_transaction_ref || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}