import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { useModuleAvailability } from "../../hooks/useModuleAvailability";
import { hasStoredAadhaar } from "../../utils/aadhaar";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Receipt,
  UserCircle,
  FileText,
  ClipboardList,
  Plus,
  Calendar,
  Briefcase,
  ShieldCheck,
  Ticket,
} from "lucide-react";

function getAdminNav(companyId, user, isAllCompanies, isModuleAvailable = () => true) {
  const rawRole = user?.rawRole;
  const permissions = user?.permissions;

  const hasAccess = (key) => {
    if (rawRole === 0) return true;
    if (user?.authorization?.permissions?.[key]) return user.authorization.permissions[key].allowed;
    if (!permissions) return false;
    return permissions[key] !== "no_access";
  };

  const pagePermission = {
    dashboard: "ui.admin.dashboard.view", appointments: "ui.admin.appointments.view",
    trial_form: "recruitment.trial_form.read", employees: "ui.admin.employees.view",
    salary: "ui.admin.salary.view", attendance: "ui.admin.attendance.view",
    tds: "ui.admin.tds.view", form16: "ui.admin.form16.view",
  };
  const canPage = (legacyKey) => hasAccess(pagePermission[legacyKey] || legacyKey) || (!user?.authorization && hasAccess(legacyKey));

  const nav = [
    ...(canPage("dashboard") ? [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true }] : []),
    ...(canPage("appointments") || (canPage("trial_form") && (companyId === "nidhi-impex" || isAllCompanies)) ? [{
      label: "Forms",
      icon: ClipboardList,
      subItems: [
        ...(canPage("appointments") ? [{ to: "/admin/appointments", label: "Appointment Form" }] : []),
        ...((canPage("trial_form") && (companyId === "nidhi-impex" || isAllCompanies))
          ? [{ to: "/admin/trial-form", label: "Trial Form" }]
          : []),
      ]
    }] : []),
    ...(canPage("employees") ? [{
      label: "Employees",
      icon: Users,
      subItems: [
        { to: "/admin/employees/add", label: "Employee Master" },
        { to: "/admin/employees", label: "View Employees", end: true }
      ]
    }] : []),
    ...(canPage("salary") ? [{
      label: "Salary",
      icon: DollarSign,
      subItems: [
        { to: "/admin/salary", label: "Month & Batch Details", end: true },
        { to: "/admin/salary/upload", label: "Salary Upload" }
      ]
    }] : []),
    ...(canPage("attendance") ? [{
      label: "Attendance",
      icon: Calendar,
      subItems: [
        { to: "/admin/attendance", label: "View Attendance", end: true },
        ...(hasAccess("hr.shift.read") ? [{ to: "/admin/attendance/shift", label: "Shift" }] : []),
      ]
    }] : []),
  ];

  const tdsSubItems = [
    ...(canPage("tds") ? [{ to: "/admin/tds/calculation", label: "TDS Calculation" }] : []),
    ...(canPage("form16") ? [{ to: "/admin/form16", label: "Form 16" }] : []),
  ];
  if (tdsSubItems.length > 0) {
    nav.push({
      label: "TDS",
      icon: Receipt,
      subItems: tdsSubItems
    });
  }

  // Permission is not enough here. The HR tables are not in every deployment,
  // and the same argument the Access Control block makes below applies: a menu
  // item that can only return "being set up" turns "not migrated yet" into
  // "looks broken", and an administrator cannot tell which it is.
  if ((rawRole === 0 || hasAccess("hr.dashboard.read")) && isModuleAvailable("hr")) {
    nav.push({
      label: "HR",
      icon: Briefcase,
      subItems: [
        { to: "/admin/hr", label: "HR Dashboard", end: true },
        { to: "/admin/hr/hiring", label: "Hiring" },
        { to: "/admin/hr/onboarding", label: "Onboarding" },

        { to: "/admin/hr/assets", label: "Asset Allocation" },
        { to: "/admin/hr/performance", label: "Performance Matrix" },
        { to: "/admin/hr/exit", label: "Exit Management" },
        { to: "/admin/hr/reports", label: "HR Reports" },
        { to: "/admin/hr/settings", label: "HR Settings" },
      ],
    });
  }

  /*
   * Support tickets. Gated on the module probe as well as the permission, for
   * the reason the HR block gives above: before the ticket migration lands,
   * every route under /tickets answers 503, and a permanently "being set up"
   * menu item is indistinguishable from a broken one.
   */
  if ((rawRole === 0 || hasAccess("support.ticket.read")) && isModuleAvailable("tickets")) {
    if (rawRole === 0 || user?.role === "super_admin" || user?.role === "owner") {
      nav.push({ to: "/admin/tickets/control-center", label: "Ticket Control Center", icon: Ticket });
    } else {
      nav.push({ to: "/admin/tickets", label: "Tickets", icon: Ticket });
    }
  }

  /*
   * Access Control.
   *
   * Gated on the module probe as well as the permission, for the reason the HR
   * block gives above: the matrix is built from the authorization catalog, so
   * before that schema is migrated the screen can only fail. Only the entries
   * with a working API behind them appear — the rest of the console
   * (policies, access requests, delegations, reviews) is added as each one
   * gains its endpoints, rather than shipped now as menu items that lead
   * nowhere.
   */
  if ((rawRole === 0 || hasAccess("admin.role.read") || hasAccess("admin.user.read")) && isModuleAvailable("authorization")) {
    nav.push({
      label: "Access Control",
      icon: ShieldCheck,
      subItems: [
        ...(hasAccess("admin.user.read") || rawRole === 0
          ? [{ to: "/admin/access-control/users", label: "Users" }] : []),
        ...(hasAccess("admin.role.read") || rawRole === 0
          ? [{ to: "/admin/access-control/roles", label: "Roles" }] : []),
        ...(hasAccess("admin.role.read") || rawRole === 0
          ? [{ to: "/admin/access-control/permission-matrix", label: "Permission Matrix" }] : []),
        ...(hasAccess("admin.policy.read") || rawRole === 0
          ? [{ to: "/admin/access-control/policies", label: "Policies" }] : []),
        ...(hasAccess("admin.access_request.read") || rawRole === 0
          ? [{ to: "/admin/access-control/access-requests", label: "Access Requests" }] : []),
        ...(hasAccess("admin.delegation.manage") || rawRole === 0
          ? [{ to: "/admin/access-control/delegations", label: "Delegations" }] : []),
        ...(hasAccess("admin.emergency_access.approve") || rawRole === 0
          ? [{ to: "/admin/access-control/emergency-access", label: "Emergency Access" }] : []),
      ],
    });
  }

  nav.push({ to: "/admin/profile", label: "Profile", icon: UserCircle });

  return nav;
}

const employeeNav = [
  { to: "/employee", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/employee/payslips", label: "Payslips", icon: FileText },
  { to: "/employee/form16", label: "Form 16", icon: Receipt },
  { to: "/employee/tickets", label: "My Tickets", icon: Ticket },
  { to: "/employee/profile", label: "Profile", icon: UserCircle },
  { to: "/employee/appointment", label: "Appointment Form", icon: ClipboardList },
];

const agentNav = [
  { to: "/agent", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/agent/trial-forms", label: "Trial Form", icon: FileText, company: "nidhi-impex" },
  { to: "/agent/appointments", label: "Appointment Form", icon: Plus },
];

/**
 * The single source of navigation for every shell.
 *
 * Both the mobile drawer and the desktop icon rail read from here, so the
 * permission gating in getAdminNav applies identically to both and cannot drift
 * between them.
 */
export function useNavItems() {
  const { user } = useAuth();
  const { companyId, isAllCompanies } = useCompany();
  const { isAvailable: isModuleAvailable } = useModuleAvailability();

  const nav = (() => {
    if (user?.role === "admin") {
      return getAdminNav(companyId, user, isAllCompanies, isModuleAvailable);
    }

    if (user?.role === "agent") {
      const baseNav = agentNav.filter(item => {
        if (!item.company) return true;
        if (user?.company_code === 'all-companies') return true;
        if (user?.company_code?.includes(item.company)) return true;
        return false;
      });

      const keyMap = {
        "/agent": "agent_dashboard",
        "/agent/trial-forms": "agent_trial_form",
        "/agent/appointments": "agent_appointment_form",
      };

      return baseNav.filter(item => {
        const key = keyMap[item.to];
        if (!key) return true;
        if (!user?.permissions) return true;
        return user.permissions[key] !== "no_access";
      });
    }

    const fields = [
      "name", "email", "phone", "dob", "address", "city", "district", "state", "pin",
      "aadhar_card_no", "pan_card_no", "bank_name", "bank_ifsc_code", "bank_account_no",
      "gender", "department", "designation", "joining_date"
    ];
    const source = {
      ...user,
      phone: user?.mobile_number || user?.mobile_no || user?.phone,
      // Presence only — this is a completeness percentage, not a display.
      aadhar_card_no: hasStoredAadhaar(user) ? "stored" : ""
    };
    let filled = 0;
    fields.forEach(f => {
      if (source[f] !== undefined && source[f] !== null && String(source[f]).trim() !== "") {
        filled++;
      }
    });
    const isProfileComplete = (filled === fields.length);
    const baseNav = (isProfileComplete
      ? employeeNav
      : employeeNav.filter(item => item.to === "/employee/profile")
    // Same module probe the admin side applies: without the ticket tables the
    // pages behind these two entries can only fail.
    ).filter(item => item.label !== "Tickets" || isModuleAvailable("tickets"));

    const keyMap = {
      "/employee": "employee_dashboard",
      "/employee/payslips": "employee_payslips",
      "/employee/form16": "employee_form16",
      "/employee/profile": "employee_profile",
      "/employee/appointment": "employee_appointment",
    };

    return baseNav.filter(item => {
      const key = keyMap[item.to];
      if (!key) return true;
      if (!user?.permissions) return true;
      return user.permissions[key] !== "no_access";
    });
  })();

  return nav;
}

export function dashboardPathFor(user) {
  return user?.role === "admin" ? "/admin" : user?.role === "agent" ? "/agent" : "/employee";
}
