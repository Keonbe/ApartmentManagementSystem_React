import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faEye,
    faWrench,
    faCheck,
    faUserPlus,
    faClock,
    faUser,
    faSlidersH,
    faLayerGroup,
    faBath,
    faBed,
    faUtensils,
    faDoorOpen,
    faArrowUp,
    faArrowDown,
} from '@fortawesome/free-solid-svg-icons';

export default function FloorPlanView({
    units = [],
    onSelectUnit,
    onSetMaintenance,
    onCompleteMaintenance,
    onAssignTenant,
}) {
    // Current floor selection: '1F' | '2F' | '3F' | 'ALL'
    const [selectedFloor, setSelectedFloor] = useState('1F');

    // Customization states
    const [customization, setCustomization] = useState(() => {
        const saved = localStorage.getItem('ams_floorplan_customization');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                // fallback
            }
        }
        return {
            theme: 'modern', // 'modern' | 'blueprint'
            showInteriorRooms: true,
            showTenantInfo: true,
            showPricing: true,
            showDimensions: true,
        };
    });

    const [showSettings, setShowSettings] = useState(false);

    const updateCustomization = (key, value) => {
        const next = { ...customization, [key]: value };
        setCustomization(next);
        localStorage.setItem('ams_floorplan_customization', JSON.stringify(next));
    };

    // Helper to find unit by id
    const getUnit = (id) => units.find((u) => u.id.toUpperCase() === id.toUpperCase());

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount);
    };

    const formatDate = (val) => {
        if (!val) return '';
        return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const daysRemaining = (leaseEnd) => {
        if (!leaseEnd) return null;
        const diff = new Date(leaseEnd) - new Date();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    // Blueprint vs Modern styling tokens
    const isBlueprint = customization.theme === 'blueprint';

    const theme = {
        containerBg: isBlueprint ? 'bg-[#081528] text-cyan-200' : 'bg-slate-50/70 text-slate-800',
        floorBoardBg: isBlueprint ? 'bg-[#0c1d36] border-cyan-900/80 shadow-2xl' : 'bg-white border-slate-200 shadow-md',
        wallColor: isBlueprint ? 'border-cyan-500/80' : 'border-slate-800',
        innerWall: isBlueprint ? 'border-cyan-800/60' : 'border-slate-300',
        hallwayBg: isBlueprint ? 'bg-[#0a182c] border-cyan-900 text-cyan-400' : 'bg-slate-100 border-slate-200 text-slate-500',
        dimensionColor: isBlueprint ? 'text-cyan-400/80 border-cyan-700/60' : 'text-slate-400 border-slate-300',
        stairsBg: isBlueprint ? 'bg-[#0d223f] border-cyan-800 text-cyan-300' : 'bg-slate-100 border-slate-300 text-slate-600',
        cardBase: isBlueprint ? 'bg-[#0a1930] hover:border-cyan-400' : 'bg-white hover:border-indigo-400',
    };

    // Render an individual unit room inside the floor plan
    const renderUnitCard = (unitId, defaultSubrooms, isTopRow = false) => {
        const unit = getUnit(unitId);

        if (!unit) {
            return (
                <div className={`flex-1 min-h-[190px] border-2 border-dashed ${isBlueprint ? 'border-cyan-900/80 text-cyan-600' : 'border-slate-200 text-slate-300'} rounded-xl flex items-center justify-center text-xs font-semibold`}>
                    Unit {unitId} (Not Configured)
                </div>
            );
        }

        const isOccupied = unit.status === 'occupied';
        const isMaintenance = unit.maintenanceFlag;
        const isReserved = unit.status === 'reserved';
        const remaining = daysRemaining(unit.leaseEnd);

        // Status badge configuration
        let badgeBg = isBlueprint ? 'bg-cyan-950 text-cyan-300 border-cyan-700' : 'bg-slate-100 text-slate-700 border-slate-200';
        let badgeLabel = 'Available';

        if (isOccupied) {
            badgeBg = isBlueprint ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
            badgeLabel = 'Occupied';
        } else if (isMaintenance) {
            badgeBg = isBlueprint ? 'bg-amber-950/80 text-amber-300 border-amber-700' : 'bg-amber-50 text-amber-800 border-amber-200';
            badgeLabel = 'Under Maintenance';
        } else if (isReserved) {
            badgeBg = isBlueprint ? 'bg-purple-950/80 text-purple-300 border-purple-700' : 'bg-purple-50 text-purple-700 border-purple-200';
            badgeLabel = 'Reserved';
        }

        return (
            <div
                key={unitId}
                onClick={() => onSelectUnit && onSelectUnit(unit)}
                className={`relative flex-1 min-h-[200px] sm:min-h-[220px] rounded-xl border-2 p-3 sm:p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer group shadow-xs hover:shadow-lg hover:-translate-y-1 ${
                    isMaintenance
                        ? isBlueprint ? 'border-amber-500/80 bg-[#161c18]' : 'border-amber-300 bg-amber-50/20'
                        : isOccupied
                        ? isBlueprint ? 'border-emerald-600/70 bg-[#0b1f24]' : 'border-emerald-200 bg-emerald-50/10'
                        : isBlueprint ? 'border-cyan-800/80 bg-[#0d223c]' : 'border-slate-200 bg-white'
                }`}
            >
                {/* Door Swing Indicator pointing to hallway */}
                <div
                    className={`absolute ${isTopRow ? '-bottom-2' : '-top-2'} right-8 px-2 py-0.5 rounded-full text-[9px] font-bold z-10 flex items-center gap-1 shadow-2xs ${
                        isBlueprint ? 'bg-cyan-900 text-cyan-200 border border-cyan-700' : 'bg-slate-800 text-white'
                    }`}
                    title="Main Entrance Door"
                >
                    <FontAwesomeIcon icon={faDoorOpen} className="text-[8px]" />
                    <span>DOOR</span>
                </div>

                {/* Card Top: Unit ID & Status Badge */}
                <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                            <span className="text-base sm:text-lg font-black tracking-tight flex items-center gap-1.5">
                                <span className={isBlueprint ? 'text-cyan-300' : 'text-slate-900'}>Unit {unit.id}</span>
                                <span className="text-[11px] font-normal opacity-60">({unit.type})</span>
                            </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${badgeBg}`}>
                            {badgeLabel}
                        </span>
                    </div>

                    {/* Interior Architectural Sub-Zones (Visual blueprint detail) */}
                    {customization.showInteriorRooms && (
                        <div className={`grid grid-cols-3 gap-1.5 my-2 p-1.5 rounded-lg border text-[10px] ${isBlueprint ? 'bg-[#081526]/80 border-cyan-950 text-cyan-400' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                            <div className="flex items-center gap-1 truncate" title="Bedroom zone">
                                <FontAwesomeIcon icon={faBed} className="text-[9px] opacity-70" />
                                <span className="truncate">Bedroom</span>
                            </div>
                            <div className="flex items-center gap-1 truncate" title="Kitchenette zone">
                                <FontAwesomeIcon icon={faUtensils} className="text-[9px] opacity-70" />
                                <span className="truncate">Living/Kit</span>
                            </div>
                            <div className="flex items-center gap-1 truncate" title="Bathroom zone">
                                <FontAwesomeIcon icon={faBath} className="text-[9px] opacity-70" />
                                <span className="truncate">Bathroom</span>
                            </div>
                        </div>
                    )}

                    {/* Status Details */}
                    <div className="space-y-1 mt-1 text-xs">
                        {isOccupied ? (
                            <>
                                {customization.showTenantInfo && (
                                    <div className="flex items-center gap-1.5 font-semibold truncate">
                                        <FontAwesomeIcon icon={faUser} className="text-[10px] opacity-60" />
                                        <span className="truncate">{unit.tenant}</span>
                                    </div>
                                )}
                                {remaining !== null && (
                                    <div className={`text-[11px] flex items-center gap-1 ${remaining <= 30 ? 'text-rose-500 font-bold' : 'opacity-70'}`}>
                                        <FontAwesomeIcon icon={faClock} className="text-[9px]" />
                                        <span>{remaining > 0 ? `${remaining} days remaining` : 'Lease ended'}</span>
                                    </div>
                                )}
                            </>
                        ) : isMaintenance ? (
                            <div className="space-y-0.5">
                                <div className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                                    <FontAwesomeIcon icon={faWrench} className="text-[10px]" />
                                    <span>Work in Progress</span>
                                </div>
                                {unit.availableDate && (
                                    <div className="text-[11px] font-semibold text-sky-600">
                                        Coming Soon: <strong>{formatDate(unit.availableDate)}</strong>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[11px] text-emerald-600 font-semibold">
                                Ready for Move-In
                            </div>
                        )}
                    </div>
                </div>

                {/* Card Bottom: Rent & Quick Action Buttons */}
                <div className={`pt-2.5 mt-2 border-t flex items-center justify-between gap-2 ${isBlueprint ? 'border-cyan-900/60' : 'border-slate-100'}`}>
                    <div>
                        {customization.showPricing && (
                            <span className="text-xs font-bold text-indigo-600">
                                {formatCurrency(unit.rent)}<span className="text-[10px] opacity-60 font-normal">/mo</span>
                            </span>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {/* Maintenance actions */}
                        {isMaintenance ? (
                            <button
                                type="button"
                                onClick={() => onCompleteMaintenance && onCompleteMaintenance(unit)}
                                title="Mark Maintenance as Completed"
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-0 cursor-pointer transition-colors flex items-center gap-1"
                            >
                                <FontAwesomeIcon icon={faCheck} className="text-[9px]" />
                                <span className="hidden sm:inline">Complete</span>
                            </button>
                        ) : !isOccupied ? (
                            <button
                                type="button"
                                onClick={() => onSetMaintenance && onSetMaintenance(unit)}
                                title="Set Unit Under Maintenance (Coming Soon)"
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white border-0 cursor-pointer transition-colors flex items-center gap-1"
                            >
                                <FontAwesomeIcon icon={faWrench} className="text-[9px]" />
                                <span className="hidden sm:inline">Maintain</span>
                            </button>
                        ) : null}

                        {/* Assign tenant if vacant */}
                        {!isOccupied && !isMaintenance && onAssignTenant && (
                            <button
                                type="button"
                                onClick={() => onAssignTenant(unit)}
                                title="Assign Tenant to Unit"
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white border-0 cursor-pointer transition-colors flex items-center gap-1"
                            >
                                <FontAwesomeIcon icon={faUserPlus} className="text-[9px]" />
                                <span className="hidden sm:inline">Assign</span>
                            </button>
                        )}

                        {/* View full details */}
                        <button
                            type="button"
                            onClick={() => onSelectUnit && onSelectUnit(unit)}
                            title="View Full Unit Profile"
                            className={`p-1.5 rounded-md text-xs border-0 cursor-pointer transition-colors ${
                                isBlueprint ? 'bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                        >
                            <FontAwesomeIcon icon={faEye} />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Staircase block on the east end of the floor
    const renderStairs = (direction = 'UP') => (
        <div
            className={`w-28 sm:w-36 rounded-xl border-2 p-3 flex flex-col justify-between items-center text-center ${theme.stairsBg} ${theme.wallColor}`}
            title="Building Staircase Access"
        >
            <div className="text-[10px] font-bold tracking-wider uppercase opacity-75">
                Staircase
            </div>
            {/* Stair treads illustration */}
            <div className="w-full space-y-1.5 my-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className={`h-1.5 w-full rounded-xs ${isBlueprint ? 'bg-cyan-800/80' : 'bg-slate-300'}`} />
                ))}
            </div>
            <div className="flex items-center gap-1 text-[11px] font-black">
                {direction.includes('UP') && <FontAwesomeIcon icon={faArrowUp} className="text-amber-500" />}
                {direction.includes('DN') && <FontAwesomeIcon icon={faArrowDown} className="text-sky-500" />}
                <span>{direction}</span>
            </div>
        </div>
    );

    // Floor 1 Layout: Unit D, C (North), Unit B, A (South), Stairs UP
    const renderFloor1 = () => (
        <div className={`rounded-2xl border-2 p-4 sm:p-6 space-y-4 ${theme.floorBoardBg} ${theme.wallColor}`}>
            {/* Top architectural dimensions */}
            {customization.showDimensions && (
                <div className={`flex justify-between items-center text-[10px] font-mono pb-2 border-b border-dashed ${theme.dimensionColor}`}>
                    <span>(1) 2400 mm</span>
                    <span>3100 mm</span>
                    <span>(2) 5500 mm</span>
                    <span>(3) 1500 mm (Stairs)</span>
                </div>
            )}

            <div className="flex gap-4 items-stretch">
                {/* Main units block */}
                <div className="flex-1 space-y-4">
                    {/* North Units: D (West), C (East) */}
                    <div className="flex gap-4">
                        {renderUnitCard('D', {}, true)}
                        {renderUnitCard('C', {}, true)}
                    </div>

                    {/* Central Hallway */}
                    <div className={`h-14 sm:h-16 rounded-xl border-2 flex items-center justify-center font-bold tracking-widest text-xs uppercase shadow-inner ${theme.hallwayBg}`}>
                        <span>H A L L W A Y &nbsp; (1800 mm)</span>
                    </div>

                    {/* South Units: B (West), A (East) */}
                    <div className="flex gap-4">
                        {renderUnitCard('B', {})}
                        {renderUnitCard('A', {})}
                    </div>
                </div>

                {/* Right Staircase */}
                <div className="flex flex-col justify-stretch">
                    {renderStairs('UP')}
                </div>
            </div>

            {/* Bottom Title Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200 text-xs font-semibold">
                <span className="uppercase tracking-wider">A2 TYPICAL FLOOR PLAN — FIRST FLOOR</span>
                <span className="opacity-60 font-mono">SCALE 1:100mm • 4 UNITS</span>
            </div>
        </div>
    );

    // Floor 2 Layout: Unit H, G (North), Unit F, E (South), Stairs UP/DN
    const renderFloor2 = () => (
        <div className={`rounded-2xl border-2 p-4 sm:p-6 space-y-4 ${theme.floorBoardBg} ${theme.wallColor}`}>
            {customization.showDimensions && (
                <div className={`flex justify-between items-center text-[10px] font-mono pb-2 border-b border-dashed ${theme.dimensionColor}`}>
                    <span>(1) 2400 mm</span>
                    <span>3100 mm</span>
                    <span>(2) 5500 mm</span>
                    <span>(3) 1500 mm (Stairs)</span>
                </div>
            )}

            <div className="flex gap-4 items-stretch">
                <div className="flex-1 space-y-4">
                    {/* North Units: H (West), G (East) */}
                    <div className="flex gap-4">
                        {renderUnitCard('H', {}, true)}
                        {renderUnitCard('G', {}, true)}
                    </div>

                    {/* Central Hallway */}
                    <div className={`h-14 sm:h-16 rounded-xl border-2 flex items-center justify-center font-bold tracking-widest text-xs uppercase shadow-inner ${theme.hallwayBg}`}>
                        <span>H A L L W A Y &nbsp; (1800 mm)</span>
                    </div>

                    {/* South Units: F (West), E (East) */}
                    <div className="flex gap-4">
                        {renderUnitCard('F', {})}
                        {renderUnitCard('E', {})}
                    </div>
                </div>

                {/* Right Staircase */}
                <div className="flex flex-col justify-stretch">
                    {renderStairs('UP / DN')}
                </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200 text-xs font-semibold">
                <span className="uppercase tracking-wider">A2 TYPICAL FLOOR PLAN — SECOND FLOOR</span>
                <span className="opacity-60 font-mono">SCALE 1:100mm • 4 UNITS</span>
            </div>
        </div>
    );

    // Floor 3 Layout: Unit N, M, L (North), Unit K, J, I (South), Stairs DN
    const renderFloor3 = () => (
        <div className={`rounded-2xl border-2 p-4 sm:p-6 space-y-4 ${theme.floorBoardBg} ${theme.wallColor}`}>
            {customization.showDimensions && (
                <div className={`flex justify-between items-center text-[10px] font-mono pb-2 border-b border-dashed ${theme.dimensionColor}`}>
                    <span>(1) 3660 mm</span>
                    <span>(2) 3660 mm</span>
                    <span>(3) 3660 mm</span>
                    <span>(4) 1500 mm (Stairs)</span>
                </div>
            )}

            <div className="flex gap-4 items-stretch">
                <div className="flex-1 space-y-4">
                    {/* North Units: N, M, L */}
                    <div className="flex gap-3 sm:gap-4">
                        {renderUnitCard('N', {}, true)}
                        {renderUnitCard('M', {}, true)}
                        {renderUnitCard('L', {}, true)}
                    </div>

                    {/* Central Hallway */}
                    <div className={`h-14 sm:h-16 rounded-xl border-2 flex items-center justify-center font-bold tracking-widest text-xs uppercase shadow-inner ${theme.hallwayBg}`}>
                        <span>H A L L W A Y &nbsp; (1800 mm)</span>
                    </div>

                    {/* South Units: K, J, I */}
                    <div className="flex gap-3 sm:gap-4">
                        {renderUnitCard('K', {})}
                        {renderUnitCard('J', {})}
                        {renderUnitCard('I', {})}
                    </div>
                </div>

                {/* Right Staircase */}
                <div className="flex flex-col justify-stretch">
                    {renderStairs('DN')}
                </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200 text-xs font-semibold">
                <span className="uppercase tracking-wider">A2 TYPICAL FLOOR PLAN — THIRD FLOOR</span>
                <span className="opacity-60 font-mono">SCALE 1:100mm • 6 UNITS</span>
            </div>
        </div>
    );

    return (
        <div className={`rounded-2xl p-4 sm:p-6 space-y-6 transition-colors ${theme.containerBg}`}>
            {/* Top Toolbar: Floor Selector & Customization Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                {/* Floor Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                    {[
                        { id: '1F', label: '1st Floor', count: 'Units A–D' },
                        { id: '2F', label: '2nd Floor', count: 'Units E–H' },
                        { id: '3F', label: '3rd Floor', count: 'Units I–N' },
                        { id: 'ALL', label: 'All Floors', count: 'Overview' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedFloor(tab.id)}
                            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border cursor-pointer flex items-center gap-2 ${
                                selectedFloor === tab.id
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20'
                                    : isBlueprint
                                    ? 'bg-[#0c1d36] text-cyan-200 border-cyan-800 hover:bg-cyan-900/40'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <FontAwesomeIcon icon={faLayerGroup} className="text-xs" />
                            <span>{tab.label}</span>
                            <span className="text-[10px] opacity-75 font-normal">({tab.count})</span>
                        </button>
                    ))}
                </div>

                {/* Customization Options Bar */}
                <div className="flex items-center gap-3">
                    {/* Toggle Settings Drawer */}
                    <button
                        type="button"
                        onClick={() => setShowSettings(!showSettings)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                            showSettings
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : isBlueprint
                                ? 'bg-[#0c1d36] text-cyan-300 border-cyan-800 hover:bg-cyan-900/40'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        <FontAwesomeIcon icon={faSlidersH} className="text-xs" />
                        <span>Customize View</span>
                    </button>

                    {/* Legend Quick Preview */}
                    <div className="hidden sm:flex items-center gap-3 text-[11px] font-semibold">
                        <span className="flex items-center gap-1.5 text-emerald-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Occupied
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Available
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Under Maintenance
                        </span>
                    </div>
                </div>
            </div>

            {/* Customization Settings Panel (Expandable) */}
            {showSettings && (
                <div className={`p-4 rounded-xl border space-y-4 animate-fadeIn ${isBlueprint ? 'bg-[#0c1d36] border-cyan-800 text-cyan-100' : 'bg-white border-slate-200 text-slate-800'}`}>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                        <span className="text-xs font-bold uppercase tracking-wider">Floor Plan Customization Settings</span>
                        <span className="text-[11px] opacity-60">Preferences are saved automatically</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        {/* Theme Toggle */}
                        <div>
                            <label className="block font-bold mb-1.5">Visual Aesthetic</label>
                            <select
                                value={customization.theme}
                                onChange={(e) => updateCustomization('theme', e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="modern">Modern Clean (SaaS)</option>
                                <option value="blueprint">Architectural Blueprint (Dark Cyan)</option>
                            </select>
                        </div>

                        {/* Interior Rooms */}
                        <div className="flex items-center gap-2 pt-4">
                            <input
                                type="checkbox"
                                id="chk-rooms"
                                checked={customization.showInteriorRooms}
                                onChange={(e) => updateCustomization('showInteriorRooms', e.target.checked)}
                                className="rounded text-indigo-600 cursor-pointer"
                            />
                            <label htmlFor="chk-rooms" className="cursor-pointer font-medium select-none">
                                Show Room Sub-Zones (Bed/Bath/Kit)
                            </label>
                        </div>

                        {/* Pricing */}
                        <div className="flex items-center gap-2 pt-4">
                            <input
                                type="checkbox"
                                id="chk-price"
                                checked={customization.showPricing}
                                onChange={(e) => updateCustomization('showPricing', e.target.checked)}
                                className="rounded text-indigo-600 cursor-pointer"
                            />
                            <label htmlFor="chk-price" className="cursor-pointer font-medium select-none">
                                Show Monthly Rent
                            </label>
                        </div>

                        {/* Tenant Info */}
                        <div className="flex items-center gap-2 pt-4">
                            <input
                                type="checkbox"
                                id="chk-tenant"
                                checked={customization.showTenantInfo}
                                onChange={(e) => updateCustomization('showTenantInfo', e.target.checked)}
                                className="rounded text-indigo-600 cursor-pointer"
                            />
                            <label htmlFor="chk-tenant" className="cursor-pointer font-medium select-none">
                                Show Tenant & Lease Info
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Floor Plan Renderers */}
            <div className="space-y-8 overflow-x-auto pb-4">
                {(selectedFloor === '1F' || selectedFloor === 'ALL') && renderFloor1()}
                {(selectedFloor === '2F' || selectedFloor === 'ALL') && renderFloor2()}
                {(selectedFloor === '3F' || selectedFloor === 'ALL') && renderFloor3()}
            </div>
        </div>
    );
}

