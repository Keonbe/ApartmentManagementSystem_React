import { MapPin, CheckCircle2 } from 'lucide-react';
import ApartmentPic from '../assets/Apartment_Pic.webp';
import { publicAssetUrl } from '../api/fileUrl';

// The banner at the top of the Preview page: photo, badge, title, location and
// feature chips. A null text is hidden (Other Settings → Preview Page); `image`
// is a stored site_assets path or '' for the built-in photo. Shared with that
// tab's live preview. Drawn on the brand colour in every theme (ut-native).
export default function PreviewHero({ image, badge, title, location, features = [], className = '' }) {
    const src = image ? publicAssetUrl(image) : ApartmentPic;
    return (
        <div className={`preview-hero-banner ut-native relative rounded-[2rem] overflow-hidden shadow-xl bg-brand flex flex-col sm:flex-row items-stretch flex-shrink-0 w-full group ${className}`}>
            {/* Stretches to the banner's full height (no max height: a taller text side
                used to leave the photo short of the bottom). */}
            <div className="preview-hero-image w-full sm:w-2/5 overflow-hidden relative min-h-[160px] sm:min-h-[190px] self-stretch">
                <img
                    key={src}
                    src={src}
                    alt=""
                    className="w-full h-full absolute inset-0 object-cover object-center transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => {
                        // A removed upload falls back to the built-in photo.
                        if (e.currentTarget.src !== new URL(ApartmentPic, window.location.href).href) e.currentTarget.src = ApartmentPic;
                    }}
                />
            </div>

            <div className="preview-hero-content p-5 md:p-6 text-white flex flex-col justify-center flex-grow relative z-10 space-y-2 w-full sm:w-3/5 min-w-0">
                <div className="min-w-0">
                    {badge && (
                        <span className="text-[10px] sm:text-xs tracking-widest uppercase font-bold px-3 py-1.5 rounded-full bg-white/20 border border-white/30 text-white backdrop-blur-md inline-flex items-center space-x-1.5 mb-2 max-w-full">
                            <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-white"></span>
                            <span className="min-w-0 truncate">{badge}</span>
                        </span>
                    )}
                    {title && <h2 className="text-2xl sm:text-3xl font-black text-white m-0 tracking-tight leading-tight break-words">{title}</h2>}
                    {location && (
                        <p className="text-indigo-100 text-sm sm:text-base m-0 font-medium flex items-center space-x-2 mt-2">
                            <MapPin className="w-4 h-4 shrink-0" />
                            <span className="min-w-0 break-words">{location}</span>
                        </p>
                    )}
                </div>
                {features.length > 0 && (
                    <ul className="m-0 p-0 list-none flex flex-wrap gap-2 text-xs">
                        {features.map((feature, i) => (
                            <li key={`${i}-${feature}`} className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-md font-medium border border-white/20 flex items-center gap-1 text-white min-w-0">
                                <CheckCircle2 aria-hidden="true" className="w-3 h-3 shrink-0 text-white" />
                                <span className="min-w-0 break-words">{feature}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
