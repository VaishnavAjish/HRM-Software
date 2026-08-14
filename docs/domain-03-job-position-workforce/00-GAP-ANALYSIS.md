# Domain 03 — Job, Position and Workforce Foundation: Gap Analysis

**Date:** 2026-08-14  
**Status:** Audit Complete — Ready for Implementation Planning

---

## Executive Summary

The existing codebase has a **solid foundation** from Domain 01 (Authorization) and Domain 02 (Organization). Domain 03 needs to build upon these rather than recreate them. The audit reveals:

| Area | Status | Notes |
|------|--------|-------|
| **Domain 01 (Auth/RBAC/ABAC)** | �� Complete | Enterprise-grade authorization with delegations, policies, roles, permissions |
| **Domain 02 (Organization)** | �� Complete | Enterprises, Legal Entities, Organization Units, Positions, Assignments, Hierarchies, Reporting, Financial Orgs |
| **Domain 03 (Job/Position/Workforce)** | ������ Partial | Job Requisitions exist; Job Architecture, Job Profiles, Headcount Control, Workforce Types, Contingent Workforce missing |

---

## Existing Assets (REUSE — Do Not Duplicate)

### Domain 02 — Organization Foundation (Fully Implemented)

| Entity | Table | Model | API | UI |
|--------|-------|-------|-----|-----|
| Enterprise | `enterprises` | `Enterprise` | �� | �� EnterpriseMaster |
| Legal Entity | `legal_entities` | `LegalEntity` | �� | �� LegalEntities |
| Organization Unit | `organization_units` | `OrganizationUnit` | �� | (via org-units API) |
| Organization Position | `organization_positions` | `OrganizationPosition` | �� | (via positions API) |
| Employee Org Assignment | `employee_organization_assignments` | `EmployeeOrganizationAssignment` | �� | (via assignments API) |
| Department (legacy) | `departments` | `Department` | �� | �� DepartmentController |
| Location | `locations` | `Location` | �� | �� Locations |
| Calendar | `calendars` | `Calendar` | �� | �� Calendars |
| Financial Organization | `financial_organizations` | `FinancialOrganization` | �� | (API only) |
| Hierarchy | `organization_hierarchies` | `OrganizationHierarchy` | �� | (API only) |
| Reporting Structure | `reporting_relationships` | `ReportingRelationship` | �� | (API only) |
| Leadership Assignment | `organization_leadership_assignments` | `OrganizationLeadershipAssignment` | �� | (API only) |
| Change Management | `organization_change_requests` | `OrganizationChangeRequest` | �� | (API only) |

### Domain 01 — Authorization (Fully Implemented)

| Feature | Status |
|---------|--------|
| Roles & Permissions | �� Complete |
| Permission Matrix | �� Complete |
| Policies (versioned) | �� Complete |
| Access Requests | �� Complete |
| **Delegations** | �� Complete (with scope, expiry, revocation) |
| Emergency Access | �� Complete |
| Audit Logging | �� Complete |
| Data Scopes (company/enterprise/unit) | �� Complete |

### Existing HR/Recruitment (Partial)

| Entity | Table | Model | Notes |
|--------|-------|-------|-------|
| Job Requisition | `job_requisitions` | `JobRequisition` | Has approval workflow, but no Job Architecture linkage |
| Candidate | `candidates` | `Candidate` | Links to requisition |
| Interview | `interviews` | `Interview` | |
| Offer | `offers` | `Offer` | |
| Asset | `assets` | `Asset` | |
| Performance | `performance_cycles/goals/reviews` | Models exist | |

### Legacy User Fields (on `users` table)

| Field | Purpose | Status |
|-------|---------|--------|
| `designation` | Free-text designation | ������ Legacy — not linked to Job Architecture |
| `department` | Free-text department | ������ Legacy — not linked to OrganizationUnit |
| `unit` | Free-text unit | ������ Legacy |
| `company_code` | Company code | �� Used for tenancy |
| `shift_id` | Shift assignment | �� Links to Shift model |

---

## Missing — Domain 03 Requirements

### 03.1 Job Architecture (MISSING — Core)

| Entity | Required? | Notes |
|--------|-----------|-------|
| Job Family | �� Yes | Hierarchical: Function → Family |
| Job Function | �� Yes | HR, Finance, IT, Operations, Sales, etc. |
| Job Category | �� Yes | Management, Professional, Technical, Operational, etc. |
| Job Level | �� Yes | L1-L6+, configurable, effective-dated |
| Job Grade | �� Yes | Links to salary ranges, currency, effective-dated |
| Designation Master | �� Yes | **Exists as free-text on User** — needs proper master table |
| Job Code | �� Yes | Auto-gen + manual, scoped, history |
| Job Title | �� Yes | Formal/Display/Internal/External/Localized |
| Job Description | �� Yes | Versioned, structured (summary, responsibilities, requirements, etc.) |
| Job Responsibility | �� Yes | Priority, %, competency, KPI/KRA linkage |
| Job Requirement | �� Yes | Education, Experience, Skill, Certification, Language, etc. |
| Job Evaluation | �� Yes | Configurable factors, scores, history |
| Job Classification | �� Yes | Job Class, Worker Class, Employee Group, Compliance |

### 03.2 Job Profiles (MISSING)

| Entity | Required? |
|--------|-----------|
| Job Profile (aggregate) | �� Yes |
| Education Requirement | �� Yes |
| Experience Requirement | �� Yes |
| Skill Requirement | �� Yes |
| Certification Requirement | �� Yes |
| Competency Requirement | �� Yes |
| Language Requirement | �� Yes |
| Physical Requirement | �� Yes |
| Travel Requirement | �� Yes |
| Work Condition | �� Yes |
| Job Risk Classification | �� Yes |
| Remote Work Eligibility | �� Yes |
| Security Clearance | �� Yes |

### 03.3 Position Management (PARTIAL — Extend Existing)

| Feature | Current | Required |
|---------|---------|----------|
| Position Master | �� `organization_positions` | Extend with Job reference, Grade, Employment Type, Headcount breakdown |
| Position Number | ������ Code field exists | Auto-gen, scoped, history, no-reuse policy |
| Position Status | �� active/inactive/frozen | Add: Draft, Requested, Pending Approval, Approved, Open, Filled, Partially Filled, Closed, Cancelled, Expired |
| Approved Position | ��� | Workflow: Draft → Requested → Approved → Open |
| Filled Position | ������ current_headcount | Dynamic calculation, partial fill support |
| Vacant Position | ������ vacancy field | Dynamic: Capacity - Active Assignments |
| Frozen Position | �� status=frozen | Cannot receive new assignments |
| Temporary Position | ��� | Start/End, Reason, Owner, Capacity, Approval |
| Shared Position | ��� | Multiple employees, FTE validation |
| Seasonal Position | ��� | Season, dates, capacity, hiring window |
| Position Capacity | ������ approved_headcount | Headcount + FTE capacity, filled/vacant/reserved |
| Position History | ��� | Full lifecycle audit trail |

### 03.4 Position Assignment (PARTIAL — Extend Existing)

| Feature | Current | Required |
|---------|---------|----------|
| Employee Org Assignment | �� `employee_organization_assignments` | Extend: Primary/Secondary/Concurrent/Acting/Temporary |
| Assignment Percentage | ��� | FTE calculation, total ≤ limit |
| FTE Calculation | ��� | Configurable standard (not hardcoded 100%) |
| Position Incumbent | ������ Via assignments | Current + history, effective dates |

### 03.5 Headcount Control (MISSING)

| Entity | Required? |
|--------|-----------|
| Headcount Plan | �� Yes |
| Headcount Request | �� Yes |
| Headcount Approval | �� Yes |
| Headcount Transaction | �� Yes |
| Budgeted vs Approved vs Actual vs Vacant vs Reserved vs Temporary vs Contractor | �� Yes |
| Headcount Freeze | �� Yes |
| Headcount Release | �� Yes |
| Position Budget (Grade → Compensation → Budget) | �� Yes |
| Headcount Variance Report | �� Yes |

### 03.6 Workforce Types (MISSING)

| Type | Required? |
|------|-----------|
| Permanent Employee | �� Yes |
| Temporary Employee | �� Yes |
| Fixed-Term Employee | �� Yes |
| Part-Time Employee | �� Yes |
| Intern | �� Yes |
| Trainee | �� Yes |
| Apprentice | �� Yes |
| Consultant | �� Yes |
| Contractor | �� Yes |
| Gig Worker | �� Yes |
| Agency Worker | �� Yes |
| Seasonal Worker | �� Yes |
| Volunteer | �� Yes |
| Board Member | �� Yes |

**Worker Type Master** — Configurable, not hardcoded. Rules influence Benefits/Payroll/Leave/Access/Reporting/Headcount/Compliance.

### 03.7 Contingent Workforce (MISSING)

| Entity | Required? |
|--------|-----------|
| Contractor Master | �� Yes |
| Vendor Employee | �� Yes |
| Contract Details | �� Yes |
| Vendor Assignment | �� Yes |
| Work Order | �� Yes |
| Billing Rate | �� Yes |
| Access Expiry (auto) | �� Yes |
| Timesheets | �� Yes |
| Contractor Compliance | �� Yes |
| Contractor Extension | �� Yes |
| Contractor Conversion (→ Employee) | �� Yes |
| Contractor Termination | �� Yes |

### 03.8 Workforce Assignment (PARTIAL — Extend Existing)

| Assignment Type | Current | Required |
|-----------------|---------|----------|
| Company | ������ Via company_code | Effective-dated |
| Legal Entity | ��� | Validate compatibility |
| Business Unit | �� Via OrganizationUnit | Reuse Domain 02 |
| Department | �� Via OrganizationUnit | Reuse Domain 02 |
| Team | �� Via OrganizationUnit | Reuse Domain 02 |
| Position | �� Via EmployeeOrgAssignment | Use Position Assignment entity |
| Job | ��� | Explicit where needed |
| Manager | �� Via ReportingRelationship | Integrate with Domain 02 |
| Location | �� Via OrganizationLocation | Reuse Domain 02 |
| Cost Center | �� Via FinancialOrganization | Reuse Domain 02 |
| Project | ��� | Project, role, %, dates, manager |
| Shift | �� Via shift_id | Integrate with Domain 06 |
| Payroll | ��� | Payroll Area, Group, Frequency, Legal Entity |
| Benefit | ��� | Eligibility/assignment link |

### 03.9 Delegation & Substitution (PARTIAL — Extend Existing)

| Feature | Current | Required |
|---------|---------|----------|
| Delegation | �� Authorization delegations | Extend: Manager Delegation, Approval Delegation, Temporary Substitute, Acting Manager |
| Delegation Scope | ������ scope_type/scope_id | Module, action, department, location, employees, workflow, approval type |
| Delegation Acceptance | ��� | Recipient acceptance, sender approval, HR approval, security validation |
| Delegation Revocation | �� Manual | Add: Automatic expiry, emergency revocation |
| Delegation History | �� Audit log | Immutable: from, to, scope, reason, dates, approver, status |

---

## Database Design — New Tables Needed

### Job Architecture (03.1)
```sql
-- Core job architecture
job_families
job_functions
job_categories
job_levels
job_grades
designations          -- Proper master table (not free-text on users)
jobs                  -- Job master (code, title, family, function, category, level, grade)
job_descriptions      -- Versioned structured descriptions
job_responsibilities  -- Multiple per job
job_requirements      -- Education, experience, skills, certs, etc.
job_evaluations       -- Configurable factors, scores, history
job_classifications   -- Job class, worker class, compliance

-- Job Profiles (03.2)
job_profiles
job_profile_education
job_profile_experience
job_profile_skills
job_profile_certifications
job_profile_competencies
job_profile_languages
job_profile_physical_requirements
job_profile_travel
job_profile_work_conditions
job_profile_risk
job_profile_remote_eligibility
job_profile_security_clearance
```

### Position Management (03.3) — Extend `organization_positions`
```sql
-- Add columns to organization_positions:
-- job_id, grade_id, employment_type, headcount_capacity, fte_capacity, 
-- filled_headcount, vacant_headcount, reserved_headcount, position_type,
-- approval_status, approved_at, approved_by, budget_id

position_history
position_budget
```

### Headcount Control (03.5)
```sql
headcount_plans
headcount_requests
headcount_approvals
headcount_transactions
headcount_freezes
```

### Workforce Types (03.6)
```sql
worker_types
worker_type_rules
```

### Contingent Workforce (03.7)
```sql
contractors
contractor_contracts
vendor_workers
vendor_assignments
work_orders
contractor_compliance
contractor_timesheets
```

### Workforce Assignment (03.8) — Extend `employee_organization_assignments`
```sql
-- Add: assignment_percentage, fte, assignment_subtype (acting, temporary, project)
project_assignments
cost_center_assignments
payroll_assignments
benefit_assignments
shift_assignments
```

### Delegation (03.9) — Extend `authorization_delegations`
```sql
-- Add: delegation_type (manager, approval, substitute, acting), 
-- acceptance_status, accepted_at, accepted_by, revocation_type
delegation_scopes
delegation_approvals
delegation_history
```

---

## API Endpoints Needed

### Job Architecture
```
GET    /v1/admin/workforce/job-families
POST   /v1/admin/workforce/job-families
PUT    /v1/admin/workforce/job-families/{id}
DELETE /v1/admin/workforce/job-families/{id}

GET    /v1/admin/workforce/job-functions
POST   /v1/admin/workforce/job-functions
...

GET    /v1/admin/workforce/job-categories
GET    /v1/admin/workforce/job-levels
GET    /v1/admin/workforce/job-grades
GET    /v1/admin/workforce/designations
GET    /v1/admin/workforce/jobs
GET    /v1/admin/workforce/job-descriptions
GET    /v1/admin/workforce/job-responsibilities
GET    /v1/admin/workforce/job-requirements
GET    /v1/admin/workforce/job-evaluations
GET    /v1/admin/workforce/job-classifications
GET    /v1/admin/workforce/job-profiles
```

### Position Management
```
GET    /v1/admin/workforce/positions
POST   /v1/admin/workforce/positions
PUT    /v1/admin/workforce/positions/{id}
DELETE /v1/admin/workforce/positions/{id}
POST   /v1/admin/workforce/positions/{id}/approve
POST   /v1/admin/workforce/positions/{id}/freeze
POST   /v1/admin/workforce/positions/{id}/unfreeze
POST   /v1/admin/workforce/positions/{id}/close
GET    /v1/admin/workforce/positions/{id}/history
GET    /v1/admin/workforce/positions/{id}/incumbents
```

### Headcount
```
GET    /v1/admin/workforce/headcount/plans
POST   /v1/admin/workforce/headcount/requests
POST   /v1/admin/workforce/headcount/approvals
GET    /v1/admin/workforce/headcount/dashboard
GET    /v1/admin/workforce/headcount/variance
POST   /v1/admin/workforce/headcount/freeze
POST   /v1/admin/workforce/headcount/release
```

### Workforce Types
```
GET    /v1/admin/workforce/worker-types
POST   /v1/admin/workforce/worker-types
```

### Contingent Workforce
```
GET    /v1/admin/workforce/contractors
POST   /v1/admin/workforce/contractors
GET    /v1/admin/workforce/vendors
GET    /v1/admin/workforce/work-orders
GET    /v1/admin/workforce/contractor-compliance
```

### Workforce Assignment
```
GET    /v1/admin/workforce/assignments
POST   /v1/admin/workforce/assignments
PUT    /v1/admin/workforce/assignments/{id}
GET    /v1/admin/workforce/project-assignments
GET    /v1/admin/workforce/cost-center-assignments
GET    /v1/admin/workforce/payroll-assignments
```

### Delegation
```
GET    /v1/admin/workforce/delegations
POST   /v1/admin/workforce/delegations
POST   /v1/admin/workforce/delegations/{id}/accept
POST   /v1/admin/workforce/delegations/{id}/revoke
GET    /v1/admin/workforce/delegations/history
```

---

## Frontend Pages Needed

| Route | Page | Status |
|-------|------|--------|
| `/admin/workforce/jobs` | Job Master | ��� New |
| `/admin/workforce/job-families` | Job Families | ��� New |
| `/admin/workforce/job-functions` | Job Functions | ��� New |
| `/admin/workforce/job-categories` | Job Categories | ��� New |
| `/admin/workforce/job-levels` | Job Levels | ��� New |
| `/admin/workforce/job-grades` | Job Grades | ��� New |
| `/admin/workforce/designations` | Designation Master | ��� New (replace free-text) |
| `/admin/workforce/job-profiles` | Job Profiles | ��� New |
| `/admin/workforce/positions` | Position Management | ������ Extend org-units positions |
| `/admin/workforce/position-assignments` | Position Assignments | ������ Extend org-units assignments |
| `/admin/workforce/headcount` | Headcount Dashboard | ��� New |
| `/admin/workforce/workforce-types` | Worker Types | ��� New |
| `/admin/workforce/contractors` | Contractor Management | ��� New |
| `/admin/workforce/vendor-workers` | Vendor Workers | ��� New |
| `/admin/workforce/work-orders` | Work Orders | ��� New |
| `/admin/workforce/workforce-assignments` | Workforce Assignments | ��� New |
| `/admin/workforce/delegation` | Delegation Dashboard | ������ Extend existing |

---

## Integration Points

| Domain | Integration | Status |
|--------|-------------|--------|
| **Domain 01 (Auth)** | Reuse permissions, delegations, data scopes, audit | �� Ready |
| **Domain 02 (Org)** | Reuse Enterprise, LegalEntity, OrgUnit, Position, Location, CostCenter, Reporting | �� Ready |
| **Domain 04 (Employee)** | Employee master consumes Job, Position, Grade, Designation, Assignment | ������ Needs sync |
| **Recruitment** | Consumes Job, Job Profile, Position, Headcount, Grade | ������ JobRequisition exists, needs linkage |
| **Payroll** | Consumes Grade, Position, Employment Type, Payroll Assignment | ��� New |
| **Performance** | Consumes Responsibilities, Competencies, Skills, Level, Grade | ��� New |
| **Learning** | Consumes Required Skills, Certifications, Competencies | ��� New |
| **Workforce Planning** | Consumes Headcount (Current/Budgeted/Approved/Filled/Vacant/Reserved/Forecast) | ��� New |

---

## Migration Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Legacy `users.designation` free-text → Designation master | HIGH | Phased migration: keep free-text, add designation_id FK, backfill, then deprecate |
| Legacy `users.department` free-text → OrganizationUnit | HIGH | Same phased approach |
| JobRequisition.designation free-text → Designation master | MEDIUM | Add designation_id, keep free-text for transition |
| Position approval workflow (new states) | MEDIUM | Add status values, default to 'active' for existing |
| Headcount control (new concept) | LOW | New tables, no migration of existing data needed |
| Contractor/Contingent workforce (new) | LOW | New tables |
| Delegation extension (acting manager, etc.) | MEDIUM | Extend existing delegation table, add type column |

---

## Implementation Priority (Waves)

### Wave 1: Job Architecture Core (03.1)
- Job Family, Function, Category, Level, Grade, Designation Master
- Job Master (code, title, relationships)
- Job Description (versioned)
- **Estimated:** 2-3 weeks

### Wave 2: Job Profiles (03.2)
- Education, Experience, Skills, Certifications, Competencies
- Language, Physical, Travel, Work Conditions, Risk, Remote, Security
- Job Profile aggregate
- **Estimated:** 2 weeks

### Wave 3: Position Management (03.3)
- Extend OrganizationPosition with Job, Grade, Employment Type
- Position Number auto-gen, Status workflow (Draft→Approved→Open→Filled→Closed)
- Position Capacity (Headcount + FTE), History
- **Estimated:** 2-3 weeks

### Wave 4: Position Assignment (03.4)
- Extend EmployeeOrganizationAssignment: Primary/Secondary/Concurrent/Acting/Temporary
- Assignment Percentage, FTE calculation
- Incumbent tracking
- **Estimated:** 2 weeks

### Wave 5: Headcount Control (03.5)
- Headcount Plan, Request, Approval, Transaction
- Budgeted/Approved/Actual/Vacant/Reserved/Temp/Contractor
- Freeze/Release, Variance, Position Budget
- **Estimated:** 2-3 weeks

### Wave 6: Workforce Types (03.6)
- Worker Type Master (configurable)
- Worker Type Rules (influence matrix)
- **Estimated:** 1-2 weeks

### Wave 7: Contingent Workforce (03.7)
- Contractor Master, Vendor, Contract, Assignment, Work Order
- Billing Rate, Access Expiry, Timesheets, Compliance
- Extension, Conversion, Termination
- **Estimated:** 3-4 weeks

### Wave 8: Workforce Assignment (03.8)
- Company, Legal Entity, Business Unit, Department, Team, Position, Job
- Manager, Location, Cost Center, Project, Shift, Payroll, Benefit
- **Estimated:** 2-3 weeks

### Wave 9: Delegation & Substitution (03.9)
- Extend authorization_delegations: Manager, Approval, Substitute, Acting
- Scope, Acceptance, Revocation, History
- **Estimated:** 2 weeks

### Wave 10: Cross-Domain Integration
- Recruitment ↔ Job/Position/Headcount
- Payroll ↔ Grade/Position
- Performance ↔ Job Responsibilities/Competencies
- Learning ↔ Job Requirements
- Workforce Planning ↔ Headcount
- **Estimated:** 2-3 weeks

### Wave 11: Bulk Operations, Reports, Search, Export
- **Estimated:** 2 weeks

### Wave 12: Security, Performance, Testing
- **Estimated:** 2 weeks

---

## Definition of Done Checklist

- [ ] Existing website functionality preserved
- [ ] Existing Job/Designation functionality preserved (phased migration)
- [ ] Job Architecture complete (03.1)
- [ ] Job Profiles complete (03.2)
- [ ] Position Management complete (03.3)
- [ ] Position Assignment complete (03.4)
- [ ] Headcount Control complete (03.5)
- [ ] Workforce Types complete (03.6)
- [ ] Contingent Workforce complete (03.7)
- [ ] Workforce Assignment complete (03.8)
- [ ] Delegation/Substitution complete (03.9)
- [ ] Job/Position/Employee separation implemented correctly
- [ ] Position capacity validated server-side
- [ ] Headcount validated (not just employee count)
- [ ] FTE validated (configurable standard)
- [ ] Effective dating implemented on all major entities
- [ ] History implemented (immutable)
- [ ] Organization integration complete (reuse Domain 02)
- [ ] Employee integration complete (reuse Domain 04)
- [ ] Recruitment integration complete
- [ ] Payroll integration complete
- [ ] Performance integration complete
- [ ] Learning integration complete
- [ ] RBAC enforced (reuse Domain 01)
- [ ] Data-level security enforced (reuse Domain 01 scopes)
- [ ] Audit implemented (reuse Domain 01)
- [ ] Bulk processing implemented
- [ ] Reports implemented
- [ ] Search implemented
- [ ] Export implemented (CSV/Excel/PDF)
- [ ] 100K+ scale considered (pagination, indexing, lazy loading)
- [ ] Concurrency protection (position capacity)
- [ ] Automated tests pass
- [ ] Security tests pass
- [ ] Regression tests pass
- [ ] Production build succeeds

---

## Next Steps

1. **Review this gap analysis** with stakeholders
2. **Prioritize waves** based on business urgency
3. **Create detailed specs** for Wave 1 (Job Architecture)
4. **Design database migrations** for new tables (additive only)
5. **Plan phased migration** for legacy designation/department fields
6. **Set up feature flags** for gradual rollout
7. **Begin Wave 1 implementation**

---

*This analysis is based on code inspection as of 2026-08-14. All existing functionality has been verified against the actual codebase.*