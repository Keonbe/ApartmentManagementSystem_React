import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSpinner, faTimes, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings, saveSystemSettings } from '../config/systemSettings';
import api from '../api/axiosConfig';
import {
  OTHER_SETTINGS_TABS,
  OTHER_SETTINGS_TAB_IDS,
  OTHER_SETTINGS_GROUPS,
  SELF_SAVING_TAB_IDS,
} from './settings/tabs';
import LeasingPanel from './settings/LeasingPanel';
import ParkingPanel from './settings/ParkingPanel';
import NotificationsPanel from './settings/NotificationsPanel';
import MaintenancePanel from './settings/MaintenancePanel';
import HouseRulesPanel from './settings/HouseRulesPanel';
import FloorRentPanel from './settings/FloorRentPanel';
import UtilityTypesPanel from './settings/UtilityTypesPanel';
import MinorsPanel from './settings/MinorsPanel';
import GlassModePanel from './settings/GlassModePanel';
import HomePagePanel from './settings/HomePagePanel';
import ContractEndPanel from './settings/ContractEndPanel';
import PreviewPagePanel from './settings/PreviewPagePanel';

const SETTINGS_FORM_ID = 'other-system-settings-form';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const tabMap = new Map(OTHER_SETTINGS_TABS.map((t) => [t.id, t]));

const AdminOtherSettings = () => {
  const [settings, setSettings] = useState(null);
  const [savedSettings, setSavedSettings] = useState(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const [testingChannel, setTestingChannel] = useState(null);
  const [smsBalance, setSmsBalance] = useState(null);
  const [checkingBalance, setCheckingBalance] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = OTHER_SETTINGS_TAB_IDS.includes(requestedTab) ? requestedTab : 'leasing';
  const scrollRef = useRef(null);
  const invalidHandled = useRef(false);

  const selectTab = (id) => {
    setSearchParams(id === 'leasing' ? {} : { tab: id });
    scrollRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    const loadSettings = async () => {
      const data = await getSystemSettings();
      setSettings(data);
      setSavedSettings(data);
    };
    loadSettings();
  }, []);

  const dirtyTabs = useMemo(() => {
    if (!settings || !savedSettings) return new Set();
    return new Set(
      OTHER_SETTINGS_TABS
        .filter((t) => t.keys?.some((k) => !same(settings[k], savedSettings[k])))
        .map((t) => t.id)
    );
  }, [settings, savedSettings]);
  const isDirty = dirtyTabs.size > 0;

  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleTestNotification = async (channel) => {
    setTestingChannel(channel);
    try {
      const res = await api.post('send_test_notification.php', { channel });
      const data = res.data;

      const outcomes = Object.entries(data.results || {});
      const failed = outcomes.filter(([, r]) => r.status !== 'sent');
      if (!outcomes.length) {
        showToast('error', 'Nothing Sent', 'No channel was eligible. Check the SMS and Email switches.');
      } else if (failed.length) {
        showToast('error', 'Test Incomplete', failed.map(([ch, r]) => `${ch}: ${r.reason || r.status}`).join(' · '));
      } else {
        showToast('success', data.dry_run ? 'Test Sent (Dry Run)' : 'Test Sent', `${outcomes.map(([ch]) => ch).join(' and ')} delivered.`);
      }
    } catch (err) {
      showToast('error', 'Test Failed', err?.response?.data?.message || err.message || 'Could not send the test notification.');
    } finally {
      setTestingChannel(null);
    }
  };

  const handleCheckBalance = async () => {
    setCheckingBalance(true);
    try {
      const res = await api.get('get_sms_balance.php');
      setSmsBalance(res.data.success
        ? {
            credits: res.data.credit_balance,
            account: res.data.account_name,
            status: res.data.account_status,
            cached: !!res.data.cached,
            checkedAt: res.data.checked_at,
          }
        : { error: res.data.message || 'Could not read the balance.' });
    } catch (err) {
      setSmsBalance({ error: err?.response?.data?.message || err.message || 'Could not read the balance.' });
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleSettingsSave = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await saveSystemSettings(settings);
      setSavedSettings(settings);
      showToast('success', 'Settings Saved', 'Your changes are saved and apply across the system.');
    } catch (error) {
      console.error('Failed to save settings:', error);
      showToast('error', 'Save Failed', error?.response?.data?.message || error?.message || 'Failed to save system settings. Please try again.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDiscard = () => setSettings(savedSettings);

  const handleInvalid = (e) => {
    if (invalidHandled.current) return;
    invalidHandled.current = true;
    setTimeout(() => { invalidHandled.current = false; }, 0);

    const field = e.target;
    const tabId = field.closest('[data-tab]')?.dataset.tab;
    if (tabId && tabId !== activeTab) {
      selectTab(tabId);
      setTimeout(() => field.reportValidity(), 50);
    }
  };

  const panelProps = { settings, updateSetting };
  const showSaveBar = isDirty;

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Other Settings" />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 m-0">Other Settings</h2>
              <p className="text-sm text-slate-500 m-0 mt-1">
                Configure leasing policies, contract end, parking, notifications, maintenance, the Home and Preview pages and Glass theme, floor rates, and building rules.
              </p>
            </div>

            {/* Structured Category Navigation Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Settings Modules
                </span>
                {isDirty && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    Unsaved changes in {dirtyTabs.size} section{dirtyTabs.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 lg:gap-6">
                {OTHER_SETTINGS_GROUPS.map((group, idx) => {
                  // Leasing (4 tabs), Operations & Tenant Site (4), Rules (3): two buttons a row in the first two.
                  const colSpan = ['lg:col-span-4', 'lg:col-span-5', 'lg:col-span-3'][idx] || 'lg:col-span-4';
                  const borderClass = idx > 0 ? 'lg:border-l lg:border-slate-100 lg:pl-6' : '';

                  return (
                    <div key={group.key} className={`${colSpan} ${borderClass} space-y-2.5`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${group.accentDot}`} />
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 m-0">
                          {group.title}
                        </h4>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {group.tabIds.map((tabId) => {
                          const tab = tabMap.get(tabId);
                          if (!tab) return null;
                          const isActive = tab.id === activeTab;
                          const tabDirty = dirtyTabs.has(tab.id);

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => selectTab(tab.id)}
                              className={`btn-interactive flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer border ${
                                isActive
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30'
                                  : 'bg-slate-50 hover:bg-indigo-50/70 text-slate-700 hover:text-indigo-600 border-slate-200/80 hover:border-indigo-200'
                              }`}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <FontAwesomeIcon
                                icon={tab.icon}
                                className={`text-xs ${isActive ? 'text-white' : 'text-slate-400'}`}
                              />
                              <span>{tab.label}</span>
                              {tabDirty && (
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-amber-300' : 'bg-amber-500'}`}
                                  title="Unsaved changes"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tab Content Panels */}
            {activeTab === 'house-rules' && <HouseRulesPanel />}
            {activeTab === 'floor-rent' && <FloorRentPanel />}
            {activeTab === 'utility-types' && <UtilityTypesPanel />}
            {activeTab === 'parking-rules' && <HouseRulesPanel scope="parking" />}
            {activeTab === 'minors' && <MinorsPanel />}

            {!SELF_SAVING_TAB_IDS.includes(activeTab) && !settings && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Loading settings…
              </div>
            )}

            {settings && !SELF_SAVING_TAB_IDS.includes(activeTab) && (
              <form
                id={SETTINGS_FORM_ID}
                onSubmit={handleSettingsSave}
                onInvalidCapture={handleInvalid}
              >
                <div data-tab="leasing" hidden={activeTab !== 'leasing'} className="space-y-6">
                  <LeasingPanel {...panelProps} />
                </div>
                <div data-tab="parking" hidden={activeTab !== 'parking'} className="space-y-6">
                  <ParkingPanel {...panelProps} />
                </div>
                <div data-tab="notifications" hidden={activeTab !== 'notifications'} className="space-y-6">
                  <NotificationsPanel
                    {...panelProps}
                    isDirty={isDirty}
                    testingChannel={testingChannel}
                    onTest={handleTestNotification}
                    checkingBalance={checkingBalance}
                    smsBalance={smsBalance}
                    onCheckBalance={handleCheckBalance}
                  />
                </div>
                <div data-tab="maintenance" hidden={activeTab !== 'maintenance'} className="space-y-6">
                  <MaintenancePanel {...panelProps} />
                </div>
                <div data-tab="glass-mode" hidden={activeTab !== 'glass-mode'} className="space-y-6">
                  <GlassModePanel {...panelProps} savedBgImage={savedSettings?.glassBgImage ?? ''} />
                </div>
                <div data-tab="home-page" hidden={activeTab !== 'home-page'} className="space-y-6">
                  <HomePagePanel {...panelProps} />
                </div>
                <div data-tab="contract-end" hidden={activeTab !== 'contract-end'} className="space-y-6">
                  <ContractEndPanel {...panelProps} />
                </div>
                <div data-tab="preview-page" hidden={activeTab !== 'preview-page'} className="space-y-6">
                  <PreviewPagePanel {...panelProps} savedImage={savedSettings?.previewHero?.image ?? ''} />
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Save Bar */}
        {showSaveBar && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 md:px-8 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] animate-fadeIn">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Unsaved changes
                {dirtyTabs.size > 1 && (
                  <span className="font-normal text-slate-500">
                    in {OTHER_SETTINGS_TABS.filter((t) => dirtyTabs.has(t.id)).map((t) => t.label).join(', ')}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={isSavingSettings}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-60"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  form={SETTINGS_FORM_ID}
                  disabled={isSavingSettings}
                  className="btn-interactive px-5 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 border-0 cursor-pointer shadow-sm flex items-center gap-2 transition-colors disabled:opacity-70"
                >
                  <FontAwesomeIcon icon={isSavingSettings ? faSpinner : faSave} spin={isSavingSettings} />
                  {isSavingSettings ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toast Notification */}
        {toast && (
          <div className={`fixed top-24 right-6 z-50 max-w-sm w-[calc(100vw-3rem)] sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 p-4 transition-all duration-300 flex items-start gap-3.5 animate-fadeIn`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <FontAwesomeIcon icon={toast.type === 'success' ? faCheckCircle : faExclamationTriangle} className="text-base" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800 m-0 tracking-tight">{toast.title}</h4>
                <button
                  aria-label="Dismiss"
                  type="button"
                  onClick={() => setToast(null)}
                  className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 text-xs"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1 m-0 leading-relaxed font-normal">{toast.message}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminOtherSettings;
