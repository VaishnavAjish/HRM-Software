const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'agent', 'AgentDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('const [viewCandidate, setViewCandidate] = useState(null);')) {
  content = content.replace(
    'const [formOpen, setFormOpen] = useState(false);',
    'const [formOpen, setFormOpen] = useState(false);\n  const [viewCandidate, setViewCandidate] = useState(null);'
  );
}

content = content.replace(
  'import { ClipboardList, Plus, FileText, CheckCircle2, Clock, Printer, Download, Loader2 } from "lucide-react";',
  'import { ClipboardList, Plus, FileText, CheckCircle2, Clock, Printer, Download, Loader2, Eye } from "lucide-react";'
);

const oldActions =                       <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDownloadPDF(c)}
                          disabled={pdfLoading === c.id}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          {pdfLoading === c.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                          Print
                        </button>
                      </td>;

const newActions =                       <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewCandidate(c)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-900/20 dark:hover:bg-brand-900/40 dark:text-brand-300 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Eye size={14} />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(c)}
                            disabled={pdfLoading === c.id}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {pdfLoading === c.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                            Print
                          </button>
                        </div>
                      </td>;

content = content.replace(oldActions, newActions);

const oldModal = <AppointmentModal 
        isOpen={formOpen} 
        onClose={handleModalClose} 
        initialData={{ addedBy: user?.id }}
      />;

const newModal = <AppointmentModal 
        isOpen={formOpen || !!viewCandidate} 
        onClose={() => {
          if (viewCandidate) {
            setViewCandidate(null);
            fetchCandidates();
          } else {
            handleModalClose(true); // Always refresh just in case
          }
        }} 
        initialData={viewCandidate || { addedBy: user?.id }}
      />;

content = content.replace(oldModal, newModal);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched AgentDashboard.jsx');
