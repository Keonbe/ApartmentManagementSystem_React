export default function Footer() {
    return (
        <footer className="w-full bg-[#3b4276] py-5 px-20 text-center select-none shrink-0 border-t border-white/10">
            <p className="m-0 text-white/80 text-xs font-medium">
                &copy; {new Date().getFullYear()} Apartment Management System. All Rights Reserved.
            </p>
        </footer>
    );
}