// A grey placeholder bar with the shimmer (animations.user.css; toned down on
// Dark and Glass), for tenant-page skeletons. Decoration only: the skeleton's
// wrapper carries role="status" and a hidden "Loading…" label.
export function Bone({ className = '' }) {
  // rounded-lg unless the caller picks a rounding (two would fight in the CSS).
  const round = /(^|\s)rounded(-|\s|$)/.test(className) ? '' : 'rounded-lg ';
  return <span aria-hidden="true" className={`block ${round}bg-slate-200 skeleton-shimmer ${className}`} />;
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

// Ready-made shapes, so every tenant page loads the same way. With a `label`
// each is its own SkeletonGroup (the text screen readers hear, e.g. "Loading
// announcements…"); without one it is plain decoration, for use inside a
// SkeletonPage or another group that already announces.
function Wrap({ label, className, children }) {
  return label
    ? <SkeletonGroup label={label} className={className}>{children}</SkeletonGroup>
    : <div aria-hidden="true" className={`animate-fade-in ${className}`}>{children}</div>;
}

// A page heading: eyebrow, title and one line under it.
export function SkeletonHeading({ className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      <Bone className="h-4 w-28 rounded-full" />
      <Bone className="h-9 w-64 max-w-full rounded-xl" />
      <Bone className="h-4 w-96 max-w-full" />
    </div>
  );
}

// Rows of cards with an icon circle and two or three lines (notifications,
// announcements, requests, readings).
export function SkeletonList({ label, count = 4, className = '' }) {
  return (
    <Wrap label={label} className={`space-y-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <Bone className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <Bone className={`h-4 ${['w-1/2', 'w-2/5', 'w-3/5'][i % 3]}`} />
              <Bone className="h-5 w-16 rounded-full" />
            </div>
            <Bone className="h-3 w-full" />
            <Bone className={`h-3 ${['w-3/4', 'w-2/3', 'w-5/6'][i % 3]}`} />
          </div>
        </div>
      ))}
    </Wrap>
  );
}

// Cards in a grid: an image or icon block on top, then text lines and a footer
// (rooms, services). `className` sets the grid columns.
export function SkeletonGrid({ label, count = 6, image = 'h-40', className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5' }) {
  return (
    <Wrap label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <Bone className={`${image} w-full rounded-none`} />
          <div className="space-y-3 p-5">
            <Bone className="h-5 w-1/2" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-3/4" />
            <div className="flex items-center justify-between pt-2">
              <Bone className="h-4 w-20" />
              <Bone className="h-9 w-24 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </Wrap>
  );
}

// A form card: label + field pairs and a button.
export function SkeletonForm({ label, fields = 4, className = '' }) {
  return (
    <Wrap label={label} className={`rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6 ${className}`}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Bone className="h-4 w-32" />
            <Bone className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
      <Bone className="h-28 w-full rounded-2xl" />
      <div className="flex justify-end"><Bone className="h-12 w-40 rounded-xl" /></div>
    </Wrap>
  );
}

// A whole page while it loads: the page's own background and width, a heading,
// then `children` (or a form card).
export function SkeletonPage({ label, maxWidth = 'max-w-5xl', children }) {
  return (
    <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-8 sm:py-10 px-4 md:px-12 box-border flex justify-center">
      <SkeletonGroup label={label} className={`w-full ${maxWidth} space-y-8`}>
        <SkeletonHeading />
        {children ?? <SkeletonForm />}
      </SkeletonGroup>
    </div>
  );
}
