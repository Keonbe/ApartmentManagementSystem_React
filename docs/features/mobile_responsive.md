# Mobile Responsiveness Specification & System Prompt

This document provides a structured prompt and implementation guidelines tailored for the **Apartment Management System (AMS)** stack (React 19 + Vite + Tailwind CSS + Modular CSS Custom Properties). It is organized by domain scopes to keep responsive rules isolated and maintainable.

---

## 📁 Responsive Stylesheet Structure

To ensure modularity and clean separation of concerns, do not dump all responsive overrides into a single file. Organize responsive stylesheets by domain:

```text
ams-react/src/assets/styles/
├── index.css
└── responsive/
    ├── admin/
    │   ├── admin-dashboard.responsive.css
    │   ├── admin-sidebar.responsive.css
    │   └── ...
    ├── user/
    │   ├── user-portal.responsive.css
    │   ├── payments.responsive.css
    │   └── ...
    └── components/
        ├── modals.responsive.css
        ├── tables.responsive.css
        └── navbar.responsive.css

```

---

## 📱 The Mobile Responsiveness Prompt

Copy and use the following system prompt block when prompting an AI model or configuring an agent to build/refactor UI components:

```markdown
You are an expert Frontend Engineer tasked with implementing full mobile responsiveness for the Apartment Management System (AMS) React SPA.

### Tech Stack Constraints
- **Core UI**: React 19 + Tailwind CSS 4 (used as base/layout styling).
- **Domain-Scoped Responsive CSS**: Do not write monolithic CSS or excessively complex inline breakpoint utilities for fine-tuned layout corrections. Place responsive media queries in their corresponding domain folder under `src/assets/styles/responsive/`:
  - **Admin Views & Workflows**: `src/assets/styles/responsive/admin/`
  - **User/Resident Views & Portals**: `src/assets/styles/responsive/user/`
  - **Shared Reusable UI**: `src/assets/styles/responsive/components/`
- **Base CSS Tokens**: Core design tokens and custom variables are defined in `src/index.css`.
- **No Extra Dependencies**: Avoid adding external libraries unless explicitly requested.

### Key Mobile Responsiveness Rules

1. **Modular Stylesheet Assignment**
   - When refactoring or creating a component, determine its domain scope (Admin, User, or Shared Component) and add or update its dedicated `.responsive.css` file in the appropriate directory.
   - Import the respective responsive stylesheet inside the component or its domain index file.

2. **Fluid Layouts & Grid Systems**
   - Do NOT use fixed pixel widths (e.g., `w-[1200px]`, `w-96` on page containers).
   - Use dynamic container widths: `w-full`, `max-w-7xl`, `mx-auto`, and gutter padding (`px-4 sm:px-6 lg:px-8`).
   - Use flexbox directions: `flex flex-col md:flex-row`.

3. **Fluid & Scalable Typography**
   - Scale text sizes dynamically. For major headers requiring fine control, declare responsive rules in their corresponding domain `.responsive.css` file.
   - Use standard relative units (`rem`, `em`) or viewport scaling (`clamp()`) rather than hardcoded pixel measurements.

4. **Touch Targets & Clickables**
   - Mobile buttons, dropdown items, and navigation links must meet a minimum touch target size of **48px x 48px** for accessibility.
   - Add sufficient spacing (`gap-4` or `space-y-4`) to prevent accidental mis-taps.

5. **Responsive Navigation & Sidebars**
   - Layouts containing sidebars (such as `AdminSidebar.jsx` or user dashboard menus) must collapse to a hamburger-activated drawer, bottom navigation bar, or scrollable horizontal menu on screens below `md` (768px).
   - Use CSS state transitions: `transition-all duration-300 ease-in-out` for showing/hiding side drawers.

6. **Responsive Tables & Modals**
   - Shared responsive table behaviors belong in `src/assets/styles/responsive/components/tables.responsive.css`.
   - Tables with multi-column data must scroll horizontally on small screens (`overflow-x-auto`) or convert into stacked cards using responsive utility classes.
   - Modals must scale to full-width/bottom-sheet on mobile (`w-full h-full sm:h-auto sm:max-w-lg`) with accessible close buttons.

7. **Viewport & Sizing Utilities**
   - Use `min-h-screen` or `min-h-svh` / `min-h-dvh` to handle mobile browser address bar resizing.
   - Ensure `overflow-x-hidden` on main wrapper containers to prevent horizontal jitter and page breakouts.

Please refactor/create components adhering strictly to these domain-scoped guidelines.

```

---

## 🎨 Best Practices for AMS Components

**1. Modular Admin Sidebar (`admin/admin-sidebar.responsive.css`)**
Use dynamic drawer triggers for mobile screens and leave desktop layouts persistent:

```jsx
const [isSidebarOpen, setIsSidebarOpen] = useState(false);

return (
  <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
    {/* Mobile Header Bar */}
    <div className="flex md:hidden items-center justify-between p-4 bg-slate-900 text-white">
      <span className="text-xl font-bold italic">AMS</span>
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
        className="p-2 min-h-[48px] min-w-[48px] flex items-center justify-center focus:outline-none"
        aria-label="Toggle Navigation"
      >
        {/* SVG Hamburger Icon */}
      </button>
    </div>

    {/* Sidebar drawer wrapper */}
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-300 ease-in-out
      md:relative md:translate-x-0
      ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      <Sidebar />
    </aside>

    {/* Mobile Backdrop */}
    {isSidebarOpen && (
      <div 
        onClick={() => setIsSidebarOpen(false)}
        className="fixed inset-0 z-40 bg-black/50 md:hidden"
      />
    )}

    {/* Main Content */}
    <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
      {/* View Content */}
    </main>
  </div>
);

```

**2. Form Layouts**
Multi-column forms should always collapse down to single columns on small viewports:

```jsx
{/* Responsive Grid Form */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <input className="w-full min-h-[48px] px-3 py-2 border rounded" placeholder="First Name" />
  <input className="w-full min-h-[48px] px-3 py-2 border rounded" placeholder="Last Name" />
</div>

```

---

## 📏 CSS Breakpoints Reference

| Breakpoint | Minimum Width | Target Device |
| --- | --- | --- |
| **`sm`** | `640px` | Mobile landscape, small tablets |
| **`md`** | `768px` | Tablets in portrait |
| **`lg`** | `1024px` | Tablets in landscape, small laptops |
| **`xl`** | `1280px` | Standard desktop displays |
| **`2xl`** | `1536px` | Wide screen displays |