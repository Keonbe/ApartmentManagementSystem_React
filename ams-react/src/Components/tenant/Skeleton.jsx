// A grey placeholder bar with the shimmer (animations.user.css; toned down on
// Dark and Glass), for tenant-page skeletons. Decoration only: the skeleton's
// wrapper carries role="status" and a hidden "Loading…" label.
export function Bone({ className = '' }) {
  return <span aria-hidden="true" className={`block rounded-lg bg-slate-200 skeleton-shimmer ${className}`} />;
}

// The wrapper: announces `label` once to screen readers, fades in.
export function SkeletonGroup({ label, className = '', children }) {
  return (
    <div role="status" aria-busy="true" className={`animate-fade-in ${className}`}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
