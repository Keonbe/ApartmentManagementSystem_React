import { MapPin } from 'lucide-react';

// The text block at the top of the Home panel: badge, heading, location and
// description. A null item is hidden (the admin switched it off in Other
// Settings → Home Page). Shared with that tab's preview, which passes
// `compact` for its smaller frame.
export default function HomeIntro({ badge, heading, location, description, compact = false }) {
    const headingSize = compact ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl md:text-6xl';
    return (
        <>
            {badge && (
                <span className="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 inline-flex items-center space-x-2 shadow-sm max-w-full">
                    <span className="relative flex h-2 w-2 shrink-0">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400"></span>
                    </span>
                    <span className="min-w-0 break-words">{badge}</span>
                </span>
            )}

            {(heading || location) && (
                <div className="space-y-2">
                    {heading && (
                        <h1 className={`home-heading ${headingSize} font-sans font-black m-0 text-white tracking-tight leading-tight drop-shadow-md break-words`}>
                            {heading}
                        </h1>
                    )}
                    {location && (
                        <p className="text-indigo-300 font-semibold text-lg flex items-center space-x-2 m-0">
                            <MapPin className="w-5 h-5 shrink-0" />
                            <span className="min-w-0 break-words">{location}</span>
                        </p>
                    )}
                </div>
            )}

            {description && (
                <p className="text-slate-300 text-sm md:text-base m-0 leading-relaxed font-medium break-words">
                    {description}
                </p>
            )}
        </>
    );
}
