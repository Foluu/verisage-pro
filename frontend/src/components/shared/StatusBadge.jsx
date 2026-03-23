
const DOT = { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor' };

export default function StatusBadge({ status }) {
  return (
    <span className={`badge ${status}`}>
      <span style={DOT} />
      {status}
    </span>
  );
}