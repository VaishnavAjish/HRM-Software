import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Briefcase, Building2, Layers, Award, Users, FileText, ListTodo, ClipboardList, BarChart2, FolderKanban } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import { useSearchParams } from "react-router-dom";

const STAT_CARDS = [
  { title: "Job Functions", icon: Building2, path: "/admin/workforce/job-functions", permission: "workforce.job_function.read", color: "bg-blue-500", description: "Functional classification (HR, Finance, IT, etc.)" },
  { title: "Job Categories", icon: Layers, path: "/admin/workforce/job-categories", permission: "workforce.job_category.read", color: "bg-purple-500", description: "Management, Professional, Technical, etc." },
  { title: "Job Levels", icon: Award, path: "/admin/workforce/job-levels", permission: "workforce.job_level.read", color: "bg-green-500", description: "Hierarchical levels (L1-L6+)" },
  { title: "Job Grades", icon: BarChart2, path: "/admin/workforce/job-grades", permission: "workforce.job_grade.read", color: "bg-amber-500", description: "Compensation grades with salary ranges" },
  { title: "Job Families", icon: Users, path: "/admin/workforce/job-families", permission: "workforce.job_family.read", color: "bg-indigo-500", description: "Groups within functions (Software Eng, Data, etc.)" },
  { title: "Designations", icon: Briefcase, path: "/admin/workforce/designations", permission: "workforce.designation.read", color: "bg-pink-500", description: "Formal titles linked to family/level/grade" },
  { title: "Jobs", icon: FileText, path: "/admin/workforce/jobs", permission: "workforce.job.read", color: "bg-red-500", description: "Core job master with codes and titles" },
  { title: "Job Descriptions", icon: ClipboardList, path: "/admin/workforce/job-descriptions", permission: "workforce.job_description.read", color: "bg-teal-500", description: "Versioned structured descriptions" },
  { title: "Responsibilities", icon: ListTodo, path: "/admin/workforce/job-responsibilities", permission: "workforce.job_responsibility.read", color: "bg-orange-500", description: "Structured responsibilities with KPI/KRA" },
  { title: "Requirements", icon: FolderKanban, path: "/admin/workforce/job-requirements", permission: "workforce.job_requirement.read", color: "bg-cyan-500", description: "Education, experience, skills, certifications" },
  { title: "Evaluations", icon: Award, path: "/admin/workforce/job-evaluations", permission: "workforce.job_evaluation.read", color: "bg-violet-500", description: "Configurable factor-based evaluations" },
  { title: "Classifications", icon: Building2, path: "/admin/workforce/job-classifications", permission: "workforce.job_classification.read", color: "bg-slate-500", description: "Compliance and regulatory classifications" },
];

export default function WorkforceDashboard() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [visibleCards, setVisibleCards] = useState(STAT_CARDS);

  useEffect(() => {
    const filtered = STAT_CARDS.filter(card => can(card.permission));
    setVisibleCards(filtered);
  }, [can]);

  if (visibleCards.length === 0) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workforce Foundation</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Job Architecture, Position Management, Headcount Control, and Workforce Types
          </p>
        </header>
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">
              You don't have access to any workforce management features.
              Contact your administrator for permissions.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workforce Foundation</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Job Architecture, Position Management, Headcount Control, and Workforce Types
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleCards.map((card) => (
          <Card
            key={card.title}
            className="group hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate(card.path)}
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${card.color} text-white`}>
                <card.icon size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {card.title}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {card.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => navigate("/admin/workforce/jobs")}
            disabled={!can("workforce.job.create")}
          >
            <FileText size={16} className="mr-2" /> Create Job
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/admin/workforce/job-families")}
            disabled={!can("workforce.job_family.create")}
          >
            <Users size={16} className="mr-2" /> Create Job Family
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/admin/workforce/designations")}
            disabled={!can("workforce.designation.create")}
          >
            <Briefcase size={16} className="mr-2" /> Create Designation
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/admin/workforce/job-grades")}
            disabled={!can("workforce.job_grade.create")}
          >
            <BarChart2 size={16} className="mr-2" /> Create Job Grade
          </Button>
        </div>
      </Card>
    </div>
  );
}