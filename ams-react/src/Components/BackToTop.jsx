import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { useLang } from '../config/i18n';

// Floating "back to top" button for the tenant pages (BaseAppLayout in App.jsx).
// Shows once the page is scrolled about 1.5 screens down. It sits just left of
// the chat button, or in the corner when there is none; positions and the
// brand / glass colours are in themes.user.css (.back-to-top).
export default function BackToTop() {
    const { t } = useLang();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let frame = 0;
        const check = () => {
            frame = 0;
            setVisible(window.scrollY > window.innerHeight * 1.5);
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(check);
        };
        check();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    const scrollUp = () => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    };

    return (
        <button
            type="button"
            onClick={scrollUp}
            aria-label={t('common.backToTop')}
            title={t('common.backToTop')}
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            className={`back-to-top ${visible ? 'is-visible' : ''} fixed z-50 w-11 h-11 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center border-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400`}
        >
            <FontAwesomeIcon icon={faArrowUp} className="text-base" aria-hidden="true" />
        </button>
    );
}
