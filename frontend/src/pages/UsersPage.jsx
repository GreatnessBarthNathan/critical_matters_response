import { FileText, Search, ShieldCheck, UserCheck, UserX, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

export default function UsersPage() {
  const { user } = useAuth(); const [users, setUsers] = useState([]); const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [toast, setToast] = useState(null);
  useEffect(() => { if (user.role === 'pastor') api('/users').then((data) => setUsers(data.users)).catch((err) => setError(err.message)); }, [user.role]);
  const filtered = useMemo(() => users.filter((item) => `${item.firstName} ${item.lastName} ${item.email} ${item.ministry}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  if (user.role !== 'pastor') return <Navigate to="/app" replace />;
  const toggle = async (item) => { try { const data = await api(`/users/${item.id}/status`, { method: 'PATCH', body: { isActive: !item.isActive } }); setUsers((current) => current.map((entry) => entry.id === item.id ? { ...entry, isActive: data.user.isActive } : entry)); setToast({ message: data.message }); } catch (err) { setError(err.message); } };
  return <div className="users-page"><Toast toast={toast} onClose={() => setToast(null)} /><div className="page-intro"><div><h2>Church leaders</h2><p>View the members who can share confidential matters with you.</p></div><span className="privacy-pill"><ShieldCheck size={15} /> Pastor-only view</span></div>{error && <div className="form-error">{error}</div>}
    <div className="filter-bar"><div className="search-field"><Search /><input placeholder="Search leaders by name, email, or ministry..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><strong>{filtered.length} leaders</strong></div>
    <section className="people-grid">{filtered.map((item) => <article className={`panel person-card ${!item.isActive ? 'person-card--inactive' : ''}`} key={item.id}><div className="person-card__top"><span className="avatar" style={{ background: item.avatarColor }}>{item.firstName[0]}{item.lastName[0]}</span><span className={item.isActive ? 'account-active' : 'account-inactive'}>{item.isActive ? 'Active' : 'Inactive'}</span></div><h3>{item.firstName} {item.lastName}</h3><p>{item.ministry || 'Church leader'}</p><a href={`mailto:${item.email}`}>{item.email}</a><div className="person-stats"><span><FileText /> <strong>{item.reportCount}</strong> reports</span><span><UsersRound /> <strong>{item.openCount}</strong> open</span></div><button className="button button--ghost button--small button--full" onClick={() => toggle(item)}>{item.isActive ? <><UserX /> Deactivate account</> : <><UserCheck /> Activate account</>}</button></article>)}</section>
  </div>;
}
