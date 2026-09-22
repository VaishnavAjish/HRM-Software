import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { salaryApi } from "../../utils/api";
import RequisitionsTab from "../admin/hr/hiring/RequisitionsTab";
import RequisitionFormModal from "../admin/hr/hiring/RequisitionFormModal";

function isUserManagerOfDept(d, user) {
  if (!d || !user) return false;

  const userId = user.id != null ? String(user.id).trim() : "";
  const userEmpCode = String(user.empCode || user.emp_code || user.employee_code || "").trim();
  const userEmail = String(user.email || "").toLowerCase().trim();
  const userName = String(user.name || "").toLowerCase().trim();

  const matchUser = (idVal, codeVal, emailVal, nameVal) => {
    const sId = idVal != null ? String(idVal).trim() : "";
    const sCode = codeVal != null ? String(codeVal).trim() : "";
    const sEmail = emailVal != null ? String(emailVal).toLowerCase().trim() : "";
    const sName = nameVal != null ? String(nameVal).toLowerCase().trim() : "";

    if (userId && sId && userId === sId) return true;
    if (userEmpCode && sCode && userEmpCode === sCode) return true;
    if (userId && sCode && userId === sCode) return true;
    if (userEmpCode && sId && userEmpCode === sId) return true;
    if (userEmail && sEmail && userEmail === sEmail) return true;
    if (userName && sName && userName === sName) return true;
    return false;
  };

  // Check d.manager_id
  if (d.manager_id) {
    if (matchUser(d.manager_id, d.manager_id, d.manager_id, d.manager_id)) return true;
  }

  // Check d.manager object
  if (d.manager) {
    if (matchUser(d.manager.id, d.manager.emp_code || d.manager.empCode, d.manager.email, d.manager.name)) return true;
  }

  // Check d.managers array
  if (Array.isArray(d.managers)) {
    for (const m of d.managers) {
      if (matchUser(m.id, m.emp_code || m.empCode, m.email, m.name)) return true;
    }
  }

  return false;
}

export default function EmployeeRequisitions() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const [editModalTargetId, setEditModalTargetId] = useState(null);
  const [modalTitleOverride, setModalTitleOverride] = useState(null);
  const [modalExtraFooter, setModalExtraFooter] = useState(null);
  const [requisitionsVersion, setRequisitionsVersion] = useState(0);
  const [departments, setDepartments] = useState([]);

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const companyId = companyScope?.companyId;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    Promise.all([
      salaryApi.getDepartments(accessToken, tokenType, companyId).catch(() => ({ data: [] })),
      salaryApi.getManagerTeam(accessToken, tokenType, { limit: 1000 }).catch(() => ({ data: [] })),
    ]).then(([deptRes, teamRes]) => {
      if (cancelled) return;
      const allDepts = deptRes.data || [];
      const rawTeamList = Array.isArray(teamRes?.data)
        ? teamRes.data
        : (Array.isArray(teamRes?.data?.data) ? teamRes.data.data : []);

      // Extract unique department names from team members in ManagerSection (Employee -> Dept & Management -> Department)
      const teamDeptNames = new Set(
        rawTeamList
          .map((e) => e.department || e.organization_unit_name || e.department_name || "")
          .filter(Boolean)
          .map((n) => String(n).trim().toLowerCase())
      );

      const managedDepts = allDepts.filter((d) => {
        if (isUserManagerOfDept(d, user)) return true;
        const dName = String(d.name || "").trim().toLowerCase();
        if (teamDeptNames.has(dName)) return true;

        const cleanDName = dName.replace(/\s*\([^)]*\)/, "").trim();
        for (const tName of teamDeptNames) {
          const cleanTName = tName.replace(/\s*\([^)]*\)/, "").trim();
          if (cleanDName && cleanTName && (cleanDName === cleanTName || dName.includes(cleanTName) || tName.includes(cleanDName))) {
            return true;
          }
        }
        return false;
      });

      if (managedDepts.length > 0) {
        setDepartments(managedDepts);
      } else {
        setDepartments(allDepts);
      }
    });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, companyId, user]);

  const openRequisitionForm = (id = null, title = null, footer = null) => {
    if (id === false) {
      setEditModalTargetId(null);
    } else {
      setEditModalTargetId(id || "new");
    }
    setModalTitleOverride(title);
    setModalExtraFooter(footer);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Job Requisitions</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Create, view, and manage department hiring requisitions and review statuses.
          </p>
        </div>
      </div>

      <RequisitionsTab
        departments={departments}
        openRequisitionForm={openRequisitionForm}
        refreshKey={requisitionsVersion}
        isEmployeePortal={true}
      />

      {Boolean(editModalTargetId) && (
        <RequisitionFormModal
          targetId={editModalTargetId}
          isOpen={Boolean(editModalTargetId)}
          onClose={() => openRequisitionForm(false)}
          onSuccess={() => setRequisitionsVersion((v) => v + 1)}
          initialDepartments={departments}
          titleOverride={modalTitleOverride}
          extraFooter={modalExtraFooter}
          isEmployeePortal={true}
        />
      )}
    </div>
  );
}
