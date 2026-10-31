import { useLang } from '../config/i18n';

export default function Footer() {
    const { t } = useLang();
    return (
        <footer className="w-full bg-brand py-5 px-20 text-center select-none shrink-0 border-t border-white/10">
            <p className="m-0 text-white/80 text-xs font-medium">
                {t('footer.copyright', { year: new Date().getFullYear() })}
            </p>
        </footer>
    );
}