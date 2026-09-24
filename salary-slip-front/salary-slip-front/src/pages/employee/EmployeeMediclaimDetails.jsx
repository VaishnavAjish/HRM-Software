import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { salaryApi } from "../../utils/api";
import { mediclaimApi } from "../../features/mediclaim/services/mediclaimApi";
import EmployeesTab from "../../features/mediclaim/pages/admin/tabs/EmployeesTab";
import { ShieldAlert } from "lucide-react";

function extractList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.data)) return res.data.data;
  if (Array.isArray(res.data?.employees)) return res.data.employees;
  if (Array.isArray(res.employees)) return res.employees;
  if (Array.isArray(res.team)) return res.team;
  if (Array.isArray(res.result)) return res.result;
  return [];
}

export default function EmployeeMediclaimDetails() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const [loading, setLoading] = useState(true);
  const [teamMediclaimRows, setTeamMediclaimRows] = useState([]);
  const [departmentNames, setDepartmentNames] = useState([]);

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";
  const companyId = companyScope?.companyId;

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    Promise.all([
      salaryApi.getManagerTeam(accessToken, tokenType, { limit: 1000 }).catch(() => ({ data: [] })),
      mediclaimApi.adminEmployees({ page: 1, perPage: 1000, bypass_company_scope: 1 }, accessToken, tokenType).catch(() => ({ data: [] })),
      salaryApi.getDepartments(accessToken, tokenType, companyId).catch(() => ({ data: [] })),
    ])
      .then(([teamRes, mediclaimRes, deptRes]) => {
        if (cancelled) return;

        const rawTeam = extractList(teamRes);
        const mediclaimPayload = mediclaimRes?.data;
        const allMediclaimRows = Array.isArray(mediclaimPayload?.data)
          ? mediclaimPayload.data
          : Array.isArray(mediclaimPayload)
          ? mediclaimPayload
          : [];

        // Build quick lookup maps for mediclaim employees
        const idMap = new Map();
        const codeMap = new Map();
        const emailMap = new Map();

        allMediclaimRows.forEach((mRow) => {
          if (mRow.id !== undefined && mRow.id !== null) {
            idMap.set(String(mRow.id).trim(), mRow);
          }
          const cCode = String(mRow.empCode || mRow.emp_code || "").trim();
          if (cCode) {
            codeMap.set(cCode, mRow);
            codeMap.set(cCode.toLowerCase(), mRow);
            const unpadded = cCode.replace(/^0+/, "");
            if (unpadded) codeMap.set(unpadded, mRow);
          }
          const cEmail = String(mRow.email || "").trim().toLowerCase();
          if (cEmail) {
            emailMap.set(cEmail, mRow);
          }
        });

        // Filter out currently logged-in user from team list
        const filteredTeam = rawTeam.filter((e) => {
          const eId = String(e.id || e.user_id || e.employee_id || "").trim();
          const eCode = String(e.empCode || e.emp_code || e.employee_code || "").trim();
          const eEmail = String(e.email || "").trim().toLowerCase();

          if (user?.id && eId === String(user.id).trim()) return false;
          if (user?.empCode && (eCode === String(user.empCode).trim() || (eCode.replace(/^0+/, "") && eCode.replace(/^0+/, "") === String(user.empCode).trim().replace(/^0+/, "")))) return false;
          if (user?.email && eEmail === String(user.email).trim().toLowerCase()) return false;
          return true;
        });

        // Map management employees to their corresponding mediclaim details
        const mappedRows = filteredTeam.map((mEmp) => {
          const mId = String(mEmp.id || mEmp.user_id || mEmp.employee_id || "").trim();
          const mCode = String(mEmp.empCode || mEmp.emp_code || mEmp.employee_code || "").trim();
          const mCodeUnpadded = mCode.replace(/^0+/, "");
          const mEmail = String(mEmp.email || "").trim().toLowerCase();

          const foundMed =
            (mId && idMap.get(mId)) ||
            (mCode && codeMap.get(mCode)) ||
            (mCodeUnpadded && codeMap.get(mCodeUnpadded)) ||
            (mEmail && emailMap.get(mEmail));

          if (foundMed) {
            return {
              ...foundMed,
              name: mEmp.name || mEmp.full_name || foundMed.name,
              empCode: mEmp.empCode || mEmp.emp_code || foundMed.empCode,
              department: mEmp.department || mEmp.organization_unit_name || foundMed.department,
              designation: mEmp.designation || foundMed.designation,
            };
          }

          // Fallback if employee is in Management section but not in Mediclaim table yet
          return {
            id: mEmp.id || mEmp.user_id || mId,
            name: mEmp.name || mEmp.full_name || "Employee",
            empCode: mCode,
            email: mEmail,
            department: mEmp.department || mEmp.organization_unit_name || "N/A",
            designation: mEmp.designation || "N/A",
            joiningDate: mEmp.joining_date || mEmp.joiningDate || null,
            dob: mEmp.dob || null,
            gender: mEmp.gender || null,
            mobileNumber: mEmp.mobile_number || mEmp.mobileNo || null,
            photo: mEmp.photo || null,
            eligibility: { eligible: true },
            enrollment: null,
            floater: { limit: 300000, used: 0, remaining: 300000 },
            activeMembersCount: 0,
            mediclaimStatus: "pending",
          };
        });

        const depts = Array.from(
          new Set(mappedRows.map((r) => r.department).filter(Boolean))
        );

        setTeamMediclaimRows(mappedRows);
        setDepartmentNames(depts);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, tokenType, companyId, user?.id, user?.empCode, user?.email]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading team Mediclaim details...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Mediclaim Administration</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Team Employee Mediclaim coverage, digital ID cards, member details, and claims.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <EmployeesTab
          initialRows={teamMediclaimRows}
          managerDepartmentNames={departmentNames}
          isManagerView={true}
        />
      </div>
    </div>
  );
}
