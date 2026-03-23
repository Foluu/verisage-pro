
import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../services/api';
import { formatNGN } from '../utils/format';




const COLORS = ['#F5A623', '#3B82F6', '#22C55E', '#EF4444', '#A855F7', '#14B8A6'];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--ink-soft)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-1)' }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.value > 1000 ? formatNGN(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}



export default function IncomePage() {
  const [report,    setReport]    = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [year,      setYear]      = useState(new Date().getFullYear());
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('report'); // 'report' | 'charts'

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/reports/income?year=${year}`),
      api.get(`/reports/analytics?year=${year}`),
    ]).then(([r, a]) => {
      setReport(r.data.data);
      setAnalytics(a.data.data);
    }).finally(() => setLoading(false));
  }, [year]);

  const totalRecognized = report.reduce((s, r) => s + parseFloat(r.recognized_amount || 0), 0);

  return (
    <div>
      {/* Controls */}
      <div className="filters-row" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['report', 'charts'].map(t => (
            <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              style={{ textTransform: 'capitalize' }} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <select className="select" style={{ width: 'auto' }} value={year} onChange={e => setYear(e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--amber)' }}>
          YTD Recognized: {formatNGN(totalRecognized)}
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /><span>Loading income data…</span></div>
      ) : tab === 'report' ? (
        /* ── Report Table ─────────────────────────────────────────────────── */
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ padding: '16px 20px' }}>
            <div className="card-title">Monthly Income Recognition Report · {year}</div>
          </div>
          {report.length === 0 ? (
            <div className="empty-state"><p>No recognized income for {year}.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Registrar ID</th>
                    <th>Package</th>
                    <th>Entries</th>
                    <th>Recognized (NGN)</th>
                    <th>Cumulative YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((row, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ color: 'var(--text-1)', fontWeight: 600 }}>{row.period}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{row.registrar_id}</td>
                      <td style={{ fontSize: 12 }}>{row.package_name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{row.entry_count}</td>
                      <td className="mono" style={{ color: 'var(--green)' }}>{formatNGN(row.recognized_amount)}</td>
                      <td className="mono" style={{ color: 'var(--amber)' }}>{formatNGN(row.cumulative_ytd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ── Analytics Charts ─────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Monthly Trend */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Monthly Revenue Trend (Last 12 Months)</div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={analytics?.trend || []} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
                  tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="amount" name="Recognized" fill="var(--amber)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="page-grid-2">
            {/* By Registrar */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Revenue by Registrar</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={analytics?.byRegistrar || []} layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
                    tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="registrar_name" width={100}
                    tick={{ fontSize: 10, fill: 'var(--text-2)', fontFamily: 'var(--font-body)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total_recognized" name="Total" fill="var(--blue)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* By Package */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Revenue by Package</div>
              </div>
              {(analytics?.byPackage || []).length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}><p>No data</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={analytics.byPackage}
                      dataKey="total_recognized"
                      nameKey="package_name"
                      cx="50%" cy="50%"
                      outerRadius={75}
                      label={({ package_name, percent }) =>
                        `${(package_name || 'Other').slice(0, 12)} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {analytics.byPackage.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}