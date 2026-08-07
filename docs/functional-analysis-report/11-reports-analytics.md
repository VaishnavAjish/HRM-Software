# 12. Reports & Analytics

## 12.1 Admin "Reports" page (`/admin/reports`)

**Status: Demo/Mock data.** Confirmed backed by a `mockData` module in the frontend, not a live aggregation endpoint. Contents:
- Export buttons for Salary, Attendance, and Employee reports.
- Charts (Recharts): salary trend (line/area) and attendance breakdown (bar/pie).

This page should not be presented to a client or in a registration filing as a live analytics feature without qualifying that its current data source is static/demo. See the dedicated page doc under `docs/04-pages/admin-payroll/Reports.md` for exact chart/field detail.

## 12.2 HR Reports (`/admin/hr/reports`)

**Status: Live**, driven by `HrReportController@generate`. Eight predefined report types (returns 422 for any type outside this set):
1. Hiring
2. Interviews
3. Joining
4. Attrition
5. Assets
6. Performance
7. Department
8. KPI

Supports a date range filter and Excel/CSV/PDF export (client-side generation). KPIs/metrics per report type were not itemized field-by-field in this pass — see `docs/04-pages/hr-performance-assets-exit/HrReports.md` for the batched detail.

## 12.3 HR Dashboard (`/admin/hr`)

Live aggregate metrics combining hiring, asset, and performance summaries (`HrDashboardController@index`), rendered with a composed Recharts chart (bar + line), an activity timeline feed, and CSV export of the summary cards.

## 12.4 Onboarding Dashboard(s)

`OnboardingWorkspace`'s Overview tab and the legacy `OnboardingDashboard.jsx` render KPI tiles and a hiring-funnel visualization reusing HR dashboard funnel counts — several onboarding sub-screens are partly demo content (`PreviewBanner` component explicitly flags mock data in the UI itself). See the HR Onboarding module docs for the confirmed live-vs-mock breakdown per screen.

## 12.5 Performance Matrix analytics

Bar/pie/line charts (Recharts) covering goal completion and review-rating distributions, plus a 9-box grid (performance × potential) — live, computed from `performance_goals`/`performance_reviews` data per the Performance module docs.

## 12.6 Admin Dashboard (`/admin`)

KPI stat cards, a line chart of an unspecified trend metric, and a pie chart of department headcount distribution — backed by `AdminController@dashboard` (employee counts and salary-slip stats, excluding deleted/appointment/agent-typed users).

## 12.7 Employee Dashboard (`/employee`)

Salary stat cards (net salary, deductions, gross) and a salary-history chart built client-side from deduplicated recent payslips — no dedicated backend aggregation endpoint beyond the standard salary-slip list call.

## 12.8 Super Admin Ticket Reports

`TicketReportsView.jsx` presents a 10-report-type picker with CSV/PDF/Excel export buttons — **export is currently simulated** (a `setTimeout` + success toast, no real file is generated), per component-level research. This must not be represented as a working export feature in any client-facing summary until backed by a real implementation.

## 12.9 Business insight caveats for this section

Because several of the "reports" surfaces in this product are demo/mock (Admin Reports page, Ticket Reports export, some onboarding dashboards), a reader should not assume every chart in the product reflects live data. The [Screen Inventory](22-screen-inventory.md) and individual module docs under `docs/04-pages/**` are the authoritative source for which specific report is live vs. simulated.
