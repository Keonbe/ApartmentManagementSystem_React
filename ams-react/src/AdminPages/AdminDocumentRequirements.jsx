import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import RequirementsPanel from './settings/RequirementsPanel';

const AdminDocumentRequirements = () => {
  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Document Requirements" />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 m-0">Document Requirements</h2>
              <p className="text-sm text-slate-500 m-0 mt-1">
                Configure the verification documents applicants are required to submit when applying for a unit.
              </p>
            </div>

            <RequirementsPanel />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDocumentRequirements;

