import { Bone } from './Skeleton';

// Placeholders shaped like My Room while my_room.php loads, so the page does
// not jump when the content arrives. Decoration only: the wrapper announces
// "Loading" once to screen readers.

export function HouseholdSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Bone className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Bone className="h-5 w-32" />
            <Bone className="h-4 w-full max-w-sm" />
          </div>
        </div>
        <Bone className="h-11 w-36 rounded-xl hidden sm:block" />
      </div>
      <Bone className="h-2 w-full rounded-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
            <Bone className="w-11 h-11 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BillSkeleton() {
  return (
    <div aria-hidden="true" className="mt-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="space-y-2">
        <Bone className="h-8 w-40" />
        <Bone className="h-4 w-56" />
      </div>
      <Bone className="h-11 w-36 rounded-xl" />
    </div>
  );
}

export default function MyRoomSkeleton() {
  return (
    <div role="status" aria-busy="true" className="my-room-root w-full min-h-[calc(100vh-76px)] flex flex-col items-center box-border py-8 sm:py-10 px-4 md:px-12 animate-fade-in">
      <span className="sr-only">Loading your room…</span>
      <div className="w-full max-w-5xl flex flex-col gap-8">
        <div className="space-y-3">
          <Bone className="h-10 w-full max-w-sm" />
          <Bone className="h-4 w-48" />
        </div>

        <div aria-hidden="true" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <Bone className="h-5 w-40" />
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-1/3" />
                <Bone className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 items-start">
          <div aria-hidden="true" className="rounded-t-[72px] rounded-b-3xl bg-slate-100 px-6 pt-14 pb-6 space-y-4 ring-1 ring-slate-200">
            <Bone className="h-24 w-24 mx-auto rounded-2xl" />
            <Bone className="h-4 w-32 mx-auto" />
            <div className="pt-4 space-y-3">
              <Bone className="h-4 w-full" />
              <Bone className="h-4 w-full" />
            </div>
            <Bone className="h-6 w-28 rounded-full" />
          </div>
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
              <Bone className="h-4 w-28" />
              <BillSkeleton />
            </div>
            <div aria-hidden="true" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
              <Bone className="h-4 w-32" />
              <Bone className="h-2.5 w-full rounded-full" />
              <Bone className="h-4 w-full" />
            </div>
            <div aria-hidden="true" className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => <Bone key={i} className="h-[52px] rounded-xl" />)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <HouseholdSkeleton />
          <div aria-hidden="true" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
            <Bone className="h-6 w-32" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {[0, 1, 2, 3].map((i) => <Bone key={i} className="h-4 w-full" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
