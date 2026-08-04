export const JOURNEYS = [
  { id: 1, name: "Shailesh Bahadur Singh", code: "NI-24817", role: "Production Supervisor", dept: "Manufacturing", joiningDate: "04 Aug", status: "IN_PROGRESS", progress: 72, manager: "Rakesh Menon", location: "Vapi Plant", mode: "OFFICE", slaBreached: false },
  { id: 2, name: "Priya Nair", code: "NI-24818", role: "Financial Analyst", dept: "Finance", joiningDate: "04 Aug", status: "IN_PROGRESS", progress: 88, manager: "Anita Deshpande", location: "Mumbai HQ", mode: "HYBRID", slaBreached: false },
  { id: 3, name: "Arjun Rathore", code: "NI-24819", role: "QA Engineer", dept: "Quality", joiningDate: "05 Aug", status: "PRE_BOARDING", progress: 34, manager: "Rakesh Menon", location: "Vapi Plant", mode: "OFFICE", slaBreached: true },
  { id: 4, name: "Fatima Sheikh", code: "NI-24820", role: "HR Executive", dept: "Human Resources", joiningDate: "05 Aug", status: "PRE_BOARDING", progress: 41, manager: "Meera Kulkarni", location: "Mumbai HQ", mode: "OFFICE", slaBreached: false },
  { id: 5, name: "Vikram Iyer", code: "NI-24821", role: "Software Engineer", dept: "Information Tech", joiningDate: "06 Aug", status: "PRE_BOARDING", progress: 19, manager: "Sana Qureshi", location: "Remote", mode: "REMOTE", slaBreached: true },
  { id: 6, name: "Ananya Bose", code: "NI-24822", role: "Logistics Coordinator", dept: "Supply Chain", joiningDate: "07 Aug", status: "PRE_BOARDING", progress: 12, manager: "Deepak Shah", location: "Silvassa", mode: "OFFICE", slaBreached: false },
  { id: 7, name: "Rohit Chauhan", code: "NI-24815", role: "Maintenance Technician", dept: "Manufacturing", joiningDate: "01 Aug", status: "PROBATION", progress: 100, manager: "Rakesh Menon", location: "Vapi Plant", mode: "OFFICE", slaBreached: false },
  { id: 8, name: "Kavya Reddy", code: "NI-24816", role: "Compliance Officer", dept: "Legal", joiningDate: "01 Aug", status: "PROBATION", progress: 100, manager: "Anita Deshpande", location: "Mumbai HQ", mode: "HYBRID", slaBreached: false },
];

export const DOCUMENTS = [
  { id: 1, type: "Aadhaar", owner: "Shailesh Bahadur Singh", status: "VERIFIED", uploadedAt: "02 Aug", kind: "ID", summary: "•••• •••• 8793" },
  { id: 2, type: "PAN Card", owner: "Shailesh Bahadur Singh", status: "VERIFIED", uploadedAt: "02 Aug", kind: "ID", summary: "ABCDE1234F" },
  { id: 3, type: "Cancelled Cheque", owner: "Priya Nair", status: "PENDING", uploadedAt: "03 Aug", kind: "BANK", summary: "HDFC ••••4471" },
  { id: 4, type: "Degree Certificate", owner: "Arjun Rathore", status: "REJECTED", uploadedAt: "01 Aug", kind: "EDU", summary: "B.Tech Mechanical" },
  { id: 5, type: "Experience Letter", owner: "Fatima Sheikh", status: "PENDING", uploadedAt: "03 Aug", kind: "EXP", summary: "2 yrs · Godrej" },
  { id: 6, type: "Passport", owner: "Vikram Iyer", status: "EXPIRING", uploadedAt: "28 Jul", kind: "ID", summary: "Expires 12 Sep" },
  { id: 7, type: "UAN Declaration", owner: "Ananya Bose", status: "MISSING", uploadedAt: "—", kind: "STAT", summary: "Form 11" },
  { id: 8, type: "Photograph", owner: "Priya Nair", status: "VERIFIED", uploadedAt: "02 Aug", kind: "ID", summary: "JPEG · 240 KB" },
];

export const TRAINING = [
  { id: 1, title: "Workplace Safety & Hazard Control", category: "Mandatory", enrolled: 45, completed: 38, percent: 84, due: "08 Aug" },
  { id: 2, title: "POSH — Prevention of Sexual Harassment", category: "Compliance", enrolled: 45, completed: 41, percent: 91, due: "08 Aug" },
  { id: 3, title: "Information Security Essentials", category: "Compliance", enrolled: 45, completed: 29, percent: 64, due: "12 Aug" },
  { id: 4, title: "Quality Management System (ISO 9001)", category: "Department", enrolled: 18, completed: 9, percent: 50, due: "15 Aug" },
  { id: 5, title: "HRMS Self-Service Walkthrough", category: "Orientation", enrolled: 45, completed: 44, percent: 98, due: "06 Aug" },
  { id: 6, title: "Product Line Induction — Polymers", category: "Product", enrolled: 12, completed: 3, percent: 25, due: "20 Aug" },
];

export const ASSETS = [
  { id: 1, name: "Laptop — Dell Latitude 5450", tag: "NI-LAP-2291", owner: "Priya Nair", status: "ALLOCATED", date: "03 Aug" },
  { id: 2, name: "Access Card — Mumbai HQ", tag: "NI-ACC-8842", owner: "Priya Nair", status: "ALLOCATED", date: "03 Aug" },
  { id: 3, name: "Safety Kit — Helmet + Boots", tag: "NI-SFT-1130", owner: "Shailesh Bahadur Singh", status: "ACKNOWLEDGED", date: "02 Aug" },
  { id: 4, name: "Mobile — Samsung A15", tag: "NI-MOB-0473", owner: "Arjun Rathore", status: "PENDING", date: "—" },
  { id: 5, name: "Microsoft 365 E3 Licence", tag: "M365-E3-1182", owner: "Vikram Iyer", status: "PROVISIONING", date: "04 Aug" },
  { id: 6, name: "VPN Access — Site-to-Site", tag: "VPN-0091", owner: "Vikram Iyer", status: "PENDING", date: "—" },
  { id: 7, name: 'Monitor — LG 24" FHD', tag: "NI-MON-3320", owner: "Fatima Sheikh", status: "PENDING", date: "—" },
];

export const POLICIES = [
  { id: 1, title: "Employee Handbook", version: "v4.2", accepted: 38, total: 45, mandatory: true },
  { id: 2, title: "Code of Conduct", version: "v2.1", accepted: 41, total: 45, mandatory: true },
  { id: 3, title: "Information Security Policy", version: "v3.0", accepted: 33, total: 45, mandatory: true },
  { id: 4, title: "POSH Policy", version: "v2.0", accepted: 44, total: 45, mandatory: true },
  { id: 5, title: "Data Privacy & DPDP Compliance", version: "v1.3", accepted: 29, total: 45, mandatory: true },
  { id: 6, title: "IT Acceptable Use", version: "v2.4", accepted: 36, total: 45, mandatory: true },
  { id: 7, title: "Work From Home Policy", version: "v1.1", accepted: 12, total: 18, mandatory: false },
  { id: 8, title: "Travel & Expense Policy", version: "v3.1", accepted: 22, total: 45, mandatory: false },
];

export const CHECKLIST_COLUMNS = [
  { key: "PENDING", title: "Pending", tasks: [
    { id: 1, title: "Collect cancelled cheque", person: "Priya Nair", owner: "Finance" },
    { id: 2, title: "Order safety boots", person: "Arjun Rathore", owner: "Admin" },
    { id: 3, title: "Raise VPN request", person: "Vikram Iyer", owner: "IT" },
    { id: 4, title: "Book induction slot", person: "Ananya Bose", owner: "HR" },
  ] },
  { key: "IN_PROGRESS", title: "In progress", tasks: [
    { id: 5, title: "Verify degree certificate", person: "Arjun Rathore", owner: "HR" },
    { id: 6, title: "Provision Microsoft 365", person: "Vikram Iyer", owner: "IT" },
    { id: 7, title: "Desk allocation", person: "Fatima Sheikh", owner: "Admin" },
  ] },
  { key: "AWAITING_APPROVAL", title: "Awaiting approval", tasks: [
    { id: 8, title: "PF enrolment", person: "Shailesh Bahadur Singh", owner: "Finance" },
    { id: 9, title: "Bank account validation", person: "Priya Nair", owner: "Finance" },
  ] },
  { key: "DONE", title: "Done", tasks: [
    { id: 10, title: "Issue employee code", person: "Shailesh Bahadur Singh", owner: "HR" },
    { id: 11, title: "Safety kit handover", person: "Shailesh Bahadur Singh", owner: "Admin" },
    { id: 12, title: "Welcome email", person: "All joiners", owner: "HR" },
  ] },
];

export const DASHBOARD = {
  kpis: [
    { key: "new_joiners", label: "New joiners (MTD)", value: 42, tone: "brand", trend: { dir: "up", label: "+18%" } },
    { key: "pending_onboarding", label: "Pending onboarding", value: 16, tone: "warn", trend: { dir: "down", label: "−4" } },
    { key: "docs_pending", label: "Documents pending", value: 18, tone: "bad", trend: { dir: "up", label: "+3" } },
    { key: "docs_verified", label: "Documents verified", value: 127, tone: "ok", trend: { dir: "up", label: "+22" } },
    { key: "training_pct", label: "Training completion", value: 76, unit: "%", tone: "brand", trend: { dir: "up", label: "+9%" } },
    { key: "training_pending", label: "Pending training", value: 11, tone: "warn", trend: { dir: "flat", label: "0" } },
    { key: "assets_assigned", label: "Assets assigned", value: 34, tone: "ok", trend: { dir: "up", label: "+6" } },
    { key: "assets_pending", label: "Assets pending", value: 7, tone: "warn", trend: { dir: "down", label: "−2" } },
    { key: "checklist_pct", label: "Checklist completion", value: 81, unit: "%", tone: "brand", trend: { dir: "up", label: "+5%" } },
    { key: "policies_accepted", label: "Policies accepted", value: 233, tone: "ok", trend: { dir: "up", label: "+41" } },
    { key: "policies_pending", label: "Pending acceptance", value: 6, tone: "bad", trend: { dir: "down", label: "−9" } },
    { key: "avg_days", label: "Avg onboarding time", value: 6.4, unit: "days", tone: "brand", trend: { dir: "down", label: "−1.2" } },
    { key: "activation_rate", label: "Activation rate", value: 94, unit: "%", tone: "ok", trend: { dir: "up", label: "+2%" } },
    { key: "hr_approvals", label: "HR approvals", value: 9, tone: "warn", trend: { dir: "up", label: "+2" } },
    { key: "it_tasks", label: "IT tasks open", value: 12, tone: "warn", trend: { dir: "down", label: "−5" } },
  ],
  joiningWeek: [
    { label: "Mon 04", caption: "2 joining", state: "done" },
    { label: "Tue 05", caption: "2 joining", state: "now" },
    { label: "Wed 06", caption: "1 joining", state: "" },
    { label: "Thu 07", caption: "1 joining", state: "" },
    { label: "Fri 08", caption: "0 joining", state: "" },
    { label: "Sat 09", caption: "—", state: "" },
    { label: "Sun 10", caption: "—", state: "" },
  ],
  funnel: [
    { label: "Offer accepted", value: 42, tone: "brand" },
    { label: "Pre-boarding", value: 38, tone: "brand" },
    { label: "Documents done", value: 29, tone: "brand" },
    { label: "Training done", value: 24, tone: "warn" },
    { label: "Activated", value: 21, tone: "ok" },
  ],
  byDepartment: [
    { label: "Manufacturing", value: 14 },
    { label: "Information Tech", value: 9 },
    { label: "Finance", value: 7 },
    { label: "Supply Chain", value: 5 },
    { label: "Quality", value: 4 },
    { label: "Human Resources", value: 3 },
  ],
  weekly: [
    { label: "Joiners", value: 42, series: [28, 31, 29, 35, 38, 36, 42] },
    { label: "Documents verified", value: 127, series: [64, 71, 88, 96, 104, 119, 127] },
    { label: "Assets issued", value: 34, series: [19, 22, 26, 25, 30, 31, 34] },
  ],
  activity: [
    { tone: "ok", title: "Aadhaar verified", description: "Shailesh Bahadur Singh · by Meera Kulkarni", at: "12 min ago" },
    { tone: "brand", title: "Laptop allocated", description: "NI-LAP-2291 → Priya Nair", at: "48 min ago" },
    { tone: "bad", title: "Document rejected", description: "Degree certificate · illegible scan", at: "2 h ago" },
    { tone: "warn", title: "SLA breach warning", description: "IT provisioning · Vikram Iyer", at: "3 h ago" },
    { tone: "ok", title: "Policy accepted", description: "POSH Policy v2.0 · Fatima Sheikh", at: "5 h ago" },
    { tone: "ok", title: "Journey completed", description: "Kavya Reddy moved to probation", at: "Yesterday" },
  ],
};
