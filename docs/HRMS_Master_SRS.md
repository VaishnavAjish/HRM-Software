# HRMS Master Software Requirements Specification

**Version:** 1.0  
**Status:** Draft for stakeholder and engineering review  
**Date:** 2026-08-16  
**Prepared for:** HRMS product, engineering, implementation and governance stakeholders  
**Source basis:** Pasted 30-domain HRMS catalog plus current repository documentation.

## Document Control

| Field | Value |
| --- | --- |
| Document owner | Product and Engineering |
| Primary audience | Business stakeholders, engineering leads, QA, security, implementation and operations teams |
| Canonical source | This Markdown file; the DOCX is the polished review artifact generated from it |
| Traceability model | Domain, subdomain and requirement identifiers such as `04.8` and `SR-04.8-01` |
| Implementation stance | Future-state platform requirements with repo-alignment notes where current code establishes constraints |

## 1. Purpose

This SRS defines the target requirements for a full Human Resource Management System spanning platform foundation, identity, organization, workforce, employee master, dashboards, workflows, payroll, talent, employee services, analytics, AI, integrations, governance and operations. It is intended to guide phased delivery, implementation design, test planning and stakeholder review.

## 2. Source Scope And Traceability

The source catalog contains **31 domains**, **437 subdomains**, and **4958 named capability items**. This SRS groups the capability items into traceable requirement sets rather than producing one requirement per bullet. Each requirement retains its domain and subdomain identifier.

| Capability type | Subdomains |
| --- | --- |
| Control | 19 |
| Insight | 40 |
| Integration | 16 |
| Operational | 338 |
| Workflow | 24 |

## 3. Product Vision

The HRMS shall provide a unified, multi-tenant, multi-company HR operating platform covering the complete worker lifecycle from identity, organization setup and hiring through employee master data, attendance, leave, payroll, performance, learning, engagement, service delivery, analytics, AI assistance, integrations, privacy, audit and operations.

The product shall be configurable enough for different legal entities, countries, employment types and policies while preserving common governance controls: tenant isolation, role-based access, effective dating, auditability, data privacy, workflow traceability and operational reliability.

## 4. Current Repository Alignment

The current active product in this repository is the Salary Management Portal, not the dormant HRFlow Pro or standalone enterprise-rbac projects. Implementation notes should use the active Laravel backend, React frontend and PostgreSQL database unless a later architecture decision changes that direction.

| Area | Current repo alignment |
| --- | --- |
| Backend | `salary-slip-bac/` Laravel 11 API with PostgreSQL, JWT auth, migrations, controllers, services and tests |
| Frontend | `salary-slip-front/salary-slip-front/` React/Vite application with route-level authorization and module screens |
| In-migration API | `salary-slip-node/` Fastify/Prisma API that ports selected Laravel modules while preserving compatibility |
| Reference docs | `docs/00-OVERVIEW.md`, `docs/functional-analysis-report/README.md`, and `docs/master-prompt-DOMAIN-02.md` |
| Dormant areas | `client/`, `server/`, and `enterprise-rbac/` are reference or dormant projects and should not be treated as the live target product |

## 5. Users And Roles

- **Protected Super Admin:** manages global tenants, protected access, emergency recovery and platform-wide governance.
- **Tenant Administrator:** configures tenant, company, master data, roles, policies and module settings within assigned scope.
- **HR Administrator / HR Business Partner:** manages employee lifecycle, HR operations, cases, talent, documents and workforce reports.
- **Manager:** views and acts on team attendance, leave, performance, goals, approvals, schedules and workforce insights.
- **Employee / Worker:** accesses self-service profile, attendance, leave, payslips, benefits, documents, learning and requests.
- **Candidate:** manages profile, applications, interviews, assessments, offers, joining data and candidate communications.
- **Finance / Payroll Operator:** manages payroll, statutory compliance, reimbursements, payroll reports and reconciliations.
- **Auditor / Compliance Reviewer:** reviews evidence, audit trails, access reviews, privacy requests, incidents and reports.
- **Developer / Integration Owner:** configures API clients, webhooks, integrations, monitoring and reconciliation.

## 6. Cross-Cutting Requirements

| ID | Requirement |
| --- | --- |
| XR-01 | The platform shall enforce tenant, company, legal entity, country, department, manager and employee data scopes before returning or mutating protected data. |
| XR-02 | All user-visible modules shall support role-based permissions for view, create, update, delete, approve, export and administrative actions where applicable. |
| XR-03 | Configuration and master data shall support active/inactive state, effective dating where applicable, history and audit trails. |
| XR-04 | Workflows shall expose request status, actor, approver, delegation, escalation, SLA and final decision history. |
| XR-05 | Sensitive personal, payroll, medical, identity and background verification data shall be classified, masked, encrypted or redacted according to policy. |
| XR-06 | Localization shall support language, currency, time zone, regional formats, statutory rules and country-specific validations. |
| XR-07 | Reports, dashboards and AI responses shall be permission-aware and traceable to governed source data. |
| XR-08 | Integrations shall provide authentication, authorization, rate limiting, retries, monitoring, reconciliation and audit logs. |
| XR-09 | The platform shall provide import/export where operationally required, with validation, error reporting and rollback or correction paths. |
| XR-10 | Production operations shall include backups, monitoring, incident response, release controls, disaster recovery and service-level tracking. |

## 7. Domain Requirements

### Domain 00: Platform Foundation

**Objective:** Domain 00 establishes the platform capabilities for Platform Foundation. It coordinates Tenant Management, Global Application Configuration, Global Master Data, Localization and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 00.1 | Operational | 16 | Platform Foundation |
| 00.2 | Operational | 19 | Identity and RBAC |
| 00.3 | Operational | 25 | Worker Master, Organization Foundation, Document Management |
| 00.4 | Operational | 12 | Finance and Statutory Configuration |
| 00.5 | Operational | 14 | Platform Foundation |
| 00.6 | Operational | 12 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 00.7 | Operational | 13 | Organization Foundation, Identity and RBAC |
| 00.8 | Operational | 9 | Workflow Engine, Integration Platform |

#### 00.1 Tenant Management

**SR-00.1-01:** The platform shall maintain complete lifecycle capability for Tenant Management, covering Tenant Registration, Tenant Profile, Tenant Code, Tenant Status, Tenant Activation, Tenant Suspension, Tenant Deactivation, Tenant Branding, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Tenant Registration, Tenant Profile, Tenant Code, Tenant Status, Tenant Activation, Tenant Suspension, Tenant Deactivation, Tenant Branding, Tenant Configuration, Tenant Isolation, Tenant Data Residency, Tenant Subscription, Tenant License, Tenant Usage, Tenant Billing, Tenant Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Tenant Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 00.2 Global Application Configuration

**SR-00.2-01:** The platform shall maintain complete lifecycle capability for Global Application Configuration, covering Application Name, Application URL, Logo, Favicon, Login Background, Email Branding, Theme, Light Mode, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Application Name, Application URL, Logo, Favicon, Login Background, Email Branding, Theme, Light Mode, Dark Mode, Default Language, Default Currency, Default Time Zone, Date Format, Time Format, Number Format, Financial Year, Week Start Day, Working Week, Maintenance Mode.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Global Application Configuration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 00.3 Global Master Data

**SR-00.3-01:** The platform shall maintain complete lifecycle capability for Global Master Data, covering Countries, States, Provinces, Cities, Districts, Postal Codes, Locations, Languages, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Countries, States, Provinces, Cities, Districts, Postal Codes, Locations, Languages, Currencies, Time Zones, Nationalities, Religions, Blood Groups, Gender Options, Marital Statuses, Relationship Types, Address Types, Identification Types, Document Types, Employment Types, Worker Types, Employee Statuses, Reason Codes, Status Codes, Lookup Tables.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Global Master Data according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 00.4 Localization

**SR-00.4-01:** The platform shall maintain complete lifecycle capability for Localization, covering Multi-Language Support, Translation Management, Regional Formats, Currency Conversion, Country-Specific Fields, Country-Specific Validations, Country-Specific Holidays, Country-Specific Payroll Rules, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Multi-Language Support, Translation Management, Regional Formats, Currency Conversion, Country-Specific Fields, Country-Specific Validations, Country-Specific Holidays, Country-Specific Payroll Rules, Country-Specific Tax Rules, Country-Specific Statutory Rules, Right-to-Left Language Support, Data Residency Configuration.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Localization according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 00.5 Effective Dating and Record History

**SR-00.5-01:** The platform shall maintain complete lifecycle capability for Effective Dating and Record History, covering Effective Start Date, Effective End Date, Future-Dated Records, Historical Records, Record Versioning, Change Reason, Correction Mode, Update Mode, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Effective Start Date, Effective End Date, Future-Dated Records, Historical Records, Record Versioning, Change Reason, Correction Mode, Update Mode, Record Locking, Concurrency Control, Soft Delete, Restore, Record Archive, Change History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Effective Dating and Record History according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 00.6 Numbering and Sequence Management

**SR-00.6-01:** The platform shall maintain complete lifecycle capability for Numbering and Sequence Management, covering Employee Number Sequence, Candidate Number Sequence, Position Number Sequence, Requisition Number Sequence, Ticket Number Sequence, Workflow Request Sequence, Expense Claim Sequence, Travel Request Sequence, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Number Sequence, Candidate Number Sequence, Position Number Sequence, Requisition Number Sequence, Ticket Number Sequence, Workflow Request Sequence, Expense Claim Sequence, Travel Request Sequence, Asset Number Sequence, Document Number Sequence, Company-Specific Numbering, Country-Specific Numbering.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Numbering and Sequence Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 00.7 Feature Management

**SR-00.7-01:** The platform shall maintain complete lifecycle capability for Feature Management, covering Feature Flags, Tenant Features, Company Features, Country Features, Role-Based Features, Pilot Features, Beta Features, Rollout Percentage, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Feature Flags, Tenant Features, Company Features, Country Features, Role-Based Features, Pilot Features, Beta Features, Rollout Percentage, Feature Dependencies, Feature Activation, Feature Deactivation, Feature Rollback, Feature Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Feature Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 00.8 Configuration Management

**SR-00.8-01:** The platform shall maintain complete lifecycle capability for Configuration Management, covering Configuration Packages, Configuration Export, Configuration Import, Configuration Comparison, Environment Promotion, Configuration Versioning, Configuration Approval, Configuration Rollback, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Configuration Packages, Configuration Export, Configuration Import, Configuration Comparison, Environment Promotion, Configuration Versioning, Configuration Approval, Configuration Rollback, Configuration Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Configuration Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 01: Identity, Access and Security

**Objective:** Domain 01 establishes the platform capabilities for Identity, Access and Security. It coordinates Authentication, Single Sign-On and Federation, Multi-Factor Authentication, User Account Management and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented in the active product through JWT authentication and enterprise authorization services.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 01.1 | Control | 20 | Worker Master, Identity and RBAC |
| 01.2 | Operational | 16 | Identity and RBAC, Document Management |
| 01.3 | Control | 12 | Identity and RBAC |
| 01.4 | Operational | 18 | Worker Master, Identity and RBAC, Integration Platform |
| 01.5 | Control | 13 | Identity and RBAC, Workflow Engine |
| 01.6 | Control | 20 | Identity and RBAC, Integration Platform |
| 01.7 | Control | 27 | Identity and RBAC, Integration Platform |
| 01.8 | Control | 19 | Worker Master, Organization Foundation, Identity and RBAC |
| 01.9 | Control | 14 | Worker Master, Organization Foundation, Identity and RBAC |
| 01.10 | Operational | 11 | Identity and RBAC |
| 01.11 | Operational | 10 | Identity and RBAC |
| 01.12 | Control | 13 | Identity and RBAC, Finance and Statutory Configuration, Document Management |
| 01.13 | Control | 12 | Identity and RBAC, Workflow Engine |
| 01.14 | Operational | 11 | Worker Master, Organization Foundation, Identity and RBAC |

#### 01.1 Authentication

**SR-01.1-01:** The platform shall enforce secure, auditable controls for Authentication, covering Username and Password Login, Employee ID Login, Email Login, Mobile Number Login, OTP Login, Magic Link, Face Login, Fingerprint Login, policy evaluation, exception handling, and administrative review.

Coverage: Username and Password Login, Employee ID Login, Email Login, Mobile Number Login, OTP Login, Magic Link, Face Login, Fingerprint Login, Biometric Login, Passkeys, Security Keys, Password Reset, Forgot Password, Password Expiry, Password Change, Account Lock, Account Unlock, CAPTCHA, Logout, Logout from All Devices.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Authentication according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.2 Single Sign-On and Federation

**SR-01.2-01:** The platform shall maintain complete lifecycle capability for Single Sign-On and Federation, covering SAML 2.0, OAuth 2.0, OpenID Connect, Azure Active Directory, Microsoft Entra ID, Active Directory, LDAP, Google Workspace, role-based operations, validation, status changes, reporting, and audit history.

Coverage: SAML 2.0, OAuth 2.0, OpenID Connect, Azure Active Directory, Microsoft Entra ID, Active Directory, LDAP, Google Workspace, Microsoft 365, Google Login, Microsoft Login, Apple Login, Identity Provider Configuration, Service Provider Configuration, SSO Certificate Management, SSO Metadata Management.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Single Sign-On and Federation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Document Management. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.3 Multi-Factor Authentication

**SR-01.3-01:** The platform shall enforce secure, auditable controls for Multi-Factor Authentication, covering SMS OTP, Email OTP, Authenticator Application, Push Authentication, Security Key, Backup Codes, Trusted Device, MFA Recovery, policy evaluation, exception handling, and administrative review.

Coverage: SMS OTP, Email OTP, Authenticator Application, Push Authentication, Security Key, Backup Codes, Trusted Device, MFA Recovery, Conditional MFA, Risk-Based MFA, MFA Enrollment, MFA Reset.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Multi-Factor Authentication according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.4 User Account Management

**SR-01.4-01:** The platform shall maintain complete lifecycle capability for User Account Management, covering User Creation, User Update, User Activation, User Deactivation, User Suspension, User Lock, User Unlock, Account Expiry, role-based operations, validation, status changes, reporting, and audit history.

Coverage: User Creation, User Update, User Activation, User Deactivation, User Suspension, User Lock, User Unlock, Account Expiry, External Users, Candidate Users, Contractor Users, Vendor Users, Guest Users, Auditor Users, Service Accounts, API Users, User Import, User Export.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for User Account Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC, Integration Platform. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.5 Role-Based Access Control

**SR-01.5-01:** The platform shall enforce secure, auditable controls for Role-Based Access Control, covering Role Master, System Roles, Custom Roles, Composite Roles, Role Assignment, Role Inheritance, Temporary Roles, Role Effective Dates, policy evaluation, exception handling, and administrative review.

Coverage: Role Master, System Roles, Custom Roles, Composite Roles, Role Assignment, Role Inheritance, Temporary Roles, Role Effective Dates, Role Expiry, Role Cloning, Role Comparison, Role Approval, Role History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Role-Based Access Control according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.6 Permission Management

**SR-01.6-01:** The platform shall enforce secure, auditable controls for Permission Management, covering Domain Permissions, Module Permissions, Submodule Permissions, Page Permissions, Route Permissions, Menu Permissions, Tab Permissions, Dashboard Permissions, policy evaluation, exception handling, and administrative review.

Coverage: Domain Permissions, Module Permissions, Submodule Permissions, Page Permissions, Route Permissions, Menu Permissions, Tab Permissions, Dashboard Permissions, Widget Permissions, KPI Permissions, Field Permissions, Column Permissions, Button Permissions, Action Permissions, Report Permissions, Export Permissions, Print Permissions, Download Permissions, Upload Permissions, API Permissions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Permission Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Integration Platform. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.7 Permission Actions

**SR-01.7-01:** The platform shall enforce secure, auditable controls for Permission Actions, covering View, Create, Edit, Delete, Restore, Submit, Approve, Reject, policy evaluation, exception handling, and administrative review.

Coverage: View, Create, Edit, Delete, Restore, Submit, Approve, Reject, Return, Cancel, Withdraw, Resubmit, Assign, Reassign, Delegate, Escalate, Verify, Process, Lock, Unlock, Import, Export, Print, Download, Upload, Configure, Manage.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Permission Actions according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Integration Platform. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.8 Data-Level Access

**SR-01.8-01:** The platform shall enforce secure, auditable controls for Data-Level Access, covering Tenant Access, Enterprise Access, Company Access, Legal Entity Access, Business Unit Access, Division Access, Department Access, Sub-Department Access, policy evaluation, exception handling, and administrative review.

Coverage: Tenant Access, Enterprise Access, Company Access, Legal Entity Access, Business Unit Access, Division Access, Department Access, Sub-Department Access, Branch Access, Location Access, Cost Center Access, Project Access, Position Access, Employee Access, Candidate Access, Reporting Hierarchy Access, Manager Team Access, Self-Record Access, Sensitive Data Access.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data-Level Access according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.9 Attribute-Based Access Control

**SR-01.9-01:** The platform shall enforce secure, auditable controls for Attribute-Based Access Control, covering User Attribute Rules, Employee Attribute Rules, Worker Type Rules, Grade Rules, Job Rules, Position Rules, Department Rules, Location Rules, policy evaluation, exception handling, and administrative review.

Coverage: User Attribute Rules, Employee Attribute Rules, Worker Type Rules, Grade Rules, Job Rules, Position Rules, Department Rules, Location Rules, Country Rules, Data Classification Rules, Time-Based Rules, Device-Based Rules, Context-Based Access, Transaction Amount Rules.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attribute-Based Access Control according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.10 Session Management

**SR-01.10-01:** The platform shall maintain complete lifecycle capability for Session Management, covering Active Sessions, Session Timeout, Idle Timeout, Concurrent Session Limit, Session Revocation, Session History, Remember Me, Token Refresh, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Active Sessions, Session Timeout, Idle Timeout, Concurrent Session Limit, Session Revocation, Session History, Remember Me, Token Refresh, Token Revocation, Logout All Sessions, Suspicious Session Detection.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Session Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.11 Device Management

**SR-01.11-01:** The platform shall maintain complete lifecycle capability for Device Management, covering Device Registration, Device Trust, Trusted Devices, Blocked Devices, Device Fingerprinting, Device History, Shared Device Mode, Mobile Device Access, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Device Registration, Device Trust, Trusted Devices, Blocked Devices, Device Fingerprinting, Device History, Shared Device Mode, Mobile Device Access, Browser History, Device Revocation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Device Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.12 Security Policies

**SR-01.12-01:** The platform shall enforce secure, auditable controls for Security Policies, covering Password Policy, IP Restrictions, Geo Restrictions, Network Restrictions, VPN Restrictions, Device Restrictions, Country Restrictions, Risk-Based Login, policy evaluation, exception handling, and administrative review.

Coverage: Password Policy, IP Restrictions, Geo Restrictions, Network Restrictions, VPN Restrictions, Device Restrictions, Country Restrictions, Risk-Based Login, Impossible Travel Detection, Brute Force Protection, Credential Stuffing Protection, Login Alerts, Security Alerts.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Security Policies according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Finance and Statutory Configuration, Document Management. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.13 Privileged Access

**SR-01.13-01:** The platform shall enforce secure, auditable controls for Privileged Access, covering Protected Super Admin, Privileged Roles, Break-Glass Access, Emergency Access, Just-in-Time Access, Temporary Elevation, Approval for Elevation, Audited Impersonation, policy evaluation, exception handling, and administrative review.

Coverage: Protected Super Admin, Privileged Roles, Break-Glass Access, Emergency Access, Just-in-Time Access, Temporary Elevation, Approval for Elevation, Audited Impersonation, Read-Only Impersonation, Privileged Session Logging, Privileged Action Approval, Automatic Access Revocation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Privileged Access according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Partially implemented in the active product through JWT authentication and enterprise authorization services.

#### 01.14 Identity Lifecycle

**SR-01.14-01:** The platform shall maintain complete lifecycle capability for Identity Lifecycle, covering Hire Provisioning, Transfer Access Change, Promotion Access Change, Department Change Access, Manager Change Access, Contractor Access, Leave Suspension, Separation Deprovisioning, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Hire Provisioning, Transfer Access Change, Promotion Access Change, Department Change Access, Manager Change Access, Contractor Access, Leave Suspension, Separation Deprovisioning, Rehire Provisioning, Access Review, Orphaned Account Detection.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Identity Lifecycle according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC. Partially implemented in the active product through JWT authentication and enterprise authorization services.

### Domain 02: Enterprise and Organization Management

**Objective:** Domain 02 establishes the platform capabilities for Enterprise and Organization Management. It coordinates Enterprise Management, Legal Entity Management, Business Structure, Branch and Location Management and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 02.1 | Operational | 10 | Organization Foundation |
| 02.2 | Operational | 10 | Organization Foundation, Finance and Statutory Configuration, Document Management |
| 02.3 | Operational | 10 | Organization Foundation |
| 02.4 | Operational | 13 | Organization Foundation |
| 02.5 | Operational | 10 | Organization Foundation, Finance and Statutory Configuration |
| 02.6 | Operational | 11 | Organization Foundation |
| 02.7 | Insight | 11 | Worker Master, Organization Foundation |
| 02.8 | Insight | 13 | Worker Master, Organization Foundation, Integration Platform |
| 02.9 | Operational | 13 | Worker Master, Organization Foundation, Workflow Engine |
| 02.10 | Operational | 9 | Organization Foundation, Finance and Statutory Configuration |

#### 02.1 Enterprise Management

**SR-02.1-01:** The platform shall maintain complete lifecycle capability for Enterprise Management, covering Enterprise Master, Group Company, Holding Company, Parent Company, Subsidiary, Enterprise Code, Enterprise Registration, Enterprise Branding, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Enterprise Master, Group Company, Holding Company, Parent Company, Subsidiary, Enterprise Code, Enterprise Registration, Enterprise Branding, Enterprise Status, Enterprise History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Enterprise Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.2 Legal Entity Management

**SR-02.2-01:** The platform shall maintain complete lifecycle capability for Legal Entity Management, covering Legal Entity Master, Company Registration, Corporate Identification Number, Tax Registration, Statutory Registration, Registered Address, Legal Representatives, Banking Details, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Legal Entity Master, Company Registration, Corporate Identification Number, Tax Registration, Statutory Registration, Registered Address, Legal Representatives, Banking Details, Legal Entity Status, Legal Entity Documents.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Legal Entity Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.3 Business Structure

**SR-02.3-01:** The platform shall maintain complete lifecycle capability for Business Structure, covering Business Units, Divisions, Functions, Departments, Sub-Departments, Sections, Teams, Project Organizations, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Business Units, Divisions, Functions, Departments, Sub-Departments, Sections, Teams, Project Organizations, Virtual Organizations, Shared Service Organizations.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Business Structure according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.4 Branch and Location Management

**SR-02.4-01:** The platform shall maintain complete lifecycle capability for Branch and Location Management, covering Branches, Offices, Plants, Factories, Warehouses, Stores, Worksites, Remote Locations, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Branches, Offices, Plants, Factories, Warehouses, Stores, Worksites, Remote Locations, Geographic Zones, Regions, Territories, Location Types, Work Location Mapping.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Branch and Location Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.5 Financial Organization

**SR-02.5-01:** The platform shall maintain complete lifecycle capability for Financial Organization, covering Cost Centers, Profit Centers, Budget Centers, Payroll Areas, Expense Units, Finance Business Units, General Ledger Mapping, Project Cost Codes, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Cost Centers, Profit Centers, Budget Centers, Payroll Areas, Expense Units, Finance Business Units, General Ledger Mapping, Project Cost Codes, Internal Orders, Cost Allocation Rules.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Financial Organization according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.6 Organization Hierarchy

**SR-02.6-01:** The platform shall maintain complete lifecycle capability for Organization Hierarchy, covering Enterprise Hierarchy, Legal Entity Hierarchy, Business Unit Hierarchy, Division Hierarchy, Department Hierarchy, Location Hierarchy, Cost Center Hierarchy, Functional Hierarchy, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Enterprise Hierarchy, Legal Entity Hierarchy, Business Unit Hierarchy, Division Hierarchy, Department Hierarchy, Location Hierarchy, Cost Center Hierarchy, Functional Hierarchy, Project Hierarchy, Matrix Hierarchy, Dotted-Line Hierarchy.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Organization Hierarchy according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.7 Reporting Structure

**SR-02.7-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Reporting Structure, covering Primary Manager, Secondary Manager, Functional Manager, Project Manager, Matrix Manager, Department Head, Business Unit Head, HR Business Partner and related insights.

Coverage: Primary Manager, Secondary Manager, Functional Manager, Project Manager, Matrix Manager, Department Head, Business Unit Head, HR Business Partner, Skip-Level Manager, Reporting Chain, Reporting Effective Dates.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Reporting Structure according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.8 Organization Chart

**SR-02.8-01:** The platform shall maintain complete lifecycle capability for Organization Chart, covering Enterprise Organization Chart, Legal Entity Chart, Department Chart, Team Chart, Position Chart, Manager Hierarchy, Employee Hierarchy, Vacancy Display, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Enterprise Organization Chart, Legal Entity Chart, Department Chart, Team Chart, Position Chart, Manager Hierarchy, Employee Hierarchy, Vacancy Display, Employee Count, Span of Control, Organization Chart Search, Organization Chart Export, Organization Chart Print.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Organization Chart according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.9 Organization Change Management

**SR-02.9-01:** The platform shall maintain complete lifecycle capability for Organization Change Management, covering Organization Restructure, Department Creation, Department Merge, Department Split, Department Closure, Branch Closure, Location Closure, Cost Center Change, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Organization Restructure, Department Creation, Department Merge, Department Split, Department Closure, Branch Closure, Location Closure, Cost Center Change, Manager Reassignment, Mass Employee Movement, Effective-Dated Organization Changes, Organization Change Approval, Organization Change History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Organization Change Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 02.10 Organization Calendars

**SR-02.10-01:** The platform shall maintain complete lifecycle capability for Organization Calendars, covering Enterprise Calendar, Company Calendar, Country Calendar, Location Calendar, Department Calendar, Financial Calendar, Payroll Calendar, Working-Day Calendar, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Enterprise Calendar, Company Calendar, Country Calendar, Location Calendar, Department Calendar, Financial Calendar, Payroll Calendar, Working-Day Calendar, Holiday Assignment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Organization Calendars according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 03: Job, Position and Workforce Foundation

**Objective:** Domain 03 establishes the platform capabilities for Job, Position and Workforce Foundation. It coordinates Job Architecture, Job Profiles, Position Management, Position Assignment and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 03.1 | Operational | 13 | Organization Foundation |
| 03.2 | Operational | 12 | Organization Foundation, Identity and RBAC, Finance and Statutory Configuration |
| 03.3 | Operational | 14 | Organization Foundation |
| 03.4 | Operational | 11 | Organization Foundation |
| 03.5 | Operational | 12 | Organization Foundation, Workflow Engine |
| 03.6 | Operational | 14 | Worker Master, Organization Foundation |
| 03.7 | Operational | 14 | Worker Master, Organization Foundation, Identity and RBAC |
| 03.8 | Operational | 14 | Worker Master, Organization Foundation, Finance and Statutory Configuration |
| 03.9 | Operational | 10 | Worker Master, Organization Foundation, Workflow Engine |

#### 03.1 Job Architecture

**SR-03.1-01:** The platform shall maintain complete lifecycle capability for Job Architecture, covering Job Families, Job Functions, Job Categories, Job Levels, Job Grades, Designations, Job Codes, Job Titles, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Job Families, Job Functions, Job Categories, Job Levels, Job Grades, Designations, Job Codes, Job Titles, Job Descriptions, Job Responsibilities, Job Requirements, Job Evaluation, Job Classification.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Job Architecture according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.2 Job Profiles

**SR-03.2-01:** The platform shall maintain complete lifecycle capability for Job Profiles, covering Required Education, Required Experience, Required Skills, Required Certifications, Required Competencies, Language Requirements, Physical Requirements, Travel Requirements, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Required Education, Required Experience, Required Skills, Required Certifications, Required Competencies, Language Requirements, Physical Requirements, Travel Requirements, Work Conditions, Job Risk Classification, Remote Work Eligibility, Security Clearance Requirements.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Job Profiles according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.3 Position Management

**SR-03.3-01:** The platform shall maintain complete lifecycle capability for Position Management, covering Position Master, Position Number, Position Title, Position Status, Approved Position, Filled Position, Vacant Position, Frozen Position, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Position Master, Position Number, Position Title, Position Status, Approved Position, Filled Position, Vacant Position, Frozen Position, Temporary Position, Shared Position, Seasonal Position, Position Capacity, Position Effective Dates, Position History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Position Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.4 Position Assignment

**SR-03.4-01:** The platform shall maintain complete lifecycle capability for Position Assignment, covering Primary Position, Secondary Position, Concurrent Position, Acting Position, Temporary Assignment, Position Start Date, Position End Date, Assignment Percentage, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Primary Position, Secondary Position, Concurrent Position, Acting Position, Temporary Assignment, Position Start Date, Position End Date, Assignment Percentage, Full-Time Equivalent, Position Incumbent, Position Incumbent History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Position Assignment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.5 Headcount Control

**SR-03.5-01:** The platform shall maintain complete lifecycle capability for Headcount Control, covering Approved Headcount, Budgeted Headcount, Actual Headcount, Vacant Headcount, Reserved Headcount, Temporary Headcount, Contractor Headcount, Headcount Freeze, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Approved Headcount, Budgeted Headcount, Actual Headcount, Vacant Headcount, Reserved Headcount, Temporary Headcount, Contractor Headcount, Headcount Freeze, Headcount Release, Position Budget, Headcount Variance, Headcount Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Headcount Control according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.6 Workforce Types

**SR-03.6-01:** The platform shall maintain complete lifecycle capability for Workforce Types, covering Permanent Employees, Temporary Employees, Fixed-Term Employees, Part-Time Employees, Interns, Trainees, Apprentices, Consultants, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Permanent Employees, Temporary Employees, Fixed-Term Employees, Part-Time Employees, Interns, Trainees, Apprentices, Consultants, Contractors, Gig Workers, Agency Workers, Seasonal Workers, Volunteers, Board Members.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workforce Types according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.7 Contingent Workforce

**SR-03.7-01:** The platform shall maintain complete lifecycle capability for Contingent Workforce, covering Contractor Master, Vendor Employees, Contract Details, Contract Start, Contract End, Vendor Assignment, Work Order, Billing Rate, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Contractor Master, Vendor Employees, Contract Details, Contract Start, Contract End, Vendor Assignment, Work Order, Billing Rate, Access Expiry, Timesheets, Contractor Compliance, Contractor Extension, Contractor Conversion, Contractor Termination.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Contingent Workforce according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.8 Workforce Assignment

**SR-03.8-01:** The platform shall maintain complete lifecycle capability for Workforce Assignment, covering Company Assignment, Legal Entity Assignment, Business Unit Assignment, Department Assignment, Team Assignment, Position Assignment, Job Assignment, Manager Assignment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Company Assignment, Legal Entity Assignment, Business Unit Assignment, Department Assignment, Team Assignment, Position Assignment, Job Assignment, Manager Assignment, Location Assignment, Cost Center Assignment, Project Assignment, Shift Assignment, Payroll Assignment, Benefit Assignment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workforce Assignment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 03.9 Delegation and Substitution

**SR-03.9-01:** The platform shall maintain complete lifecycle capability for Delegation and Substitution, covering Manager Delegation, Approval Delegation, Temporary Substitute, Acting Manager, Delegation Start Date, Delegation End Date, Delegation Scope, Delegation Acceptance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Manager Delegation, Approval Delegation, Temporary Substitute, Acting Manager, Delegation Start Date, Delegation End Date, Delegation Scope, Delegation Acceptance, Delegation Revocation, Delegation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Delegation and Substitution according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 04: Employee Core and Worker Master

**Objective:** Domain 04 establishes the platform capabilities for Employee Core and Worker Master. It coordinates Person and Worker Master, Personal Information, Contact Information, Family and Dependents and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented in the active product through employee records, documents and profile services.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 04.1 | Operational | 13 | Worker Master |
| 04.2 | Operational | 14 | Worker Master |
| 04.3 | Operational | 14 | Worker Master |
| 04.4 | Operational | 12 | Worker Master, Document Management |
| 04.5 | Operational | 14 | Worker Master |
| 04.6 | Operational | 17 | Worker Master, Organization Foundation |
| 04.7 | Operational | 14 | Worker Master, Identity and RBAC, Finance and Statutory Configuration |
| 04.8 | Operational | 15 | Worker Master, Finance and Statutory Configuration |
| 04.9 | Operational | 13 | Worker Master, Identity and RBAC, Finance and Statutory Configuration |
| 04.10 | Operational | 12 | Worker Master, Document Management |
| 04.11 | Operational | 11 | Worker Master, Finance and Statutory Configuration, Document Management |
| 04.12 | Operational | 14 | Worker Master |
| 04.13 | Operational | 15 | Worker Master, Finance and Statutory Configuration, Document Management |
| 04.14 | Operational | 17 | Worker Master, Organization Foundation, Finance and Statutory Configuration |
| 04.15 | Workflow | 15 | Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 04.16 | Operational | 12 | Worker Master, Organization Foundation, Integration Platform |

#### 04.1 Person and Worker Master

**SR-04.1-01:** The platform shall maintain complete lifecycle capability for Person and Worker Master, covering Person ID, Global Person ID, Worker ID, Employee ID, Employee Number, Legacy Employee Number, Candidate Link, Person Status, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Person ID, Global Person ID, Worker ID, Employee ID, Employee Number, Legacy Employee Number, Candidate Link, Person Status, Worker Status, Duplicate Person Check, Duplicate Employee Check, Person Merge, Employee Merge.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Person and Worker Master according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Partially implemented in the active product through employee records, documents and profile services.

#### 04.2 Personal Information

**SR-04.2-01:** The platform shall maintain complete lifecycle capability for Personal Information, covering Legal Name, Preferred Name, Previous Name, Date of Birth, Gender, Marital Status, Nationality, Citizenship, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Legal Name, Preferred Name, Previous Name, Date of Birth, Gender, Marital Status, Nationality, Citizenship, Religion, Blood Group, Disability Status, Veteran Status, Profile Picture, Personal Biography.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Personal Information according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Partially implemented in the active product through employee records, documents and profile services.

#### 04.3 Contact Information

**SR-04.3-01:** The platform shall maintain complete lifecycle capability for Contact Information, covering Personal Email, Official Email, Personal Mobile, Official Mobile, Telephone, Extension Number, Current Address, Permanent Address, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Personal Email, Official Email, Personal Mobile, Official Mobile, Telephone, Extension Number, Current Address, Permanent Address, Mailing Address, Country, State, City, Postal Code, Communication Preference.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Contact Information according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Partially implemented in the active product through employee records, documents and profile services.

#### 04.4 Family and Dependents

**SR-04.4-01:** The platform shall maintain complete lifecycle capability for Family and Dependents, covering Spouse, Children, Parents, Dependents, Guardians, Nominees, Beneficiaries, Emergency Contacts, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Spouse, Children, Parents, Dependents, Guardians, Nominees, Beneficiaries, Emergency Contacts, Relationship, Dependent Eligibility, Dependent Documents, Family History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Family and Dependents according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Document Management. Partially implemented in the active product through employee records, documents and profile services.

#### 04.5 Employment Information

**SR-04.5-01:** The platform shall maintain complete lifecycle capability for Employment Information, covering Original Hire Date, Joining Date, Rehire Date, Employment Type, Employment Status, Worker Category, Probation Period, Confirmation Date, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Original Hire Date, Joining Date, Rehire Date, Employment Type, Employment Status, Worker Category, Probation Period, Confirmation Date, Contract Start, Contract End, Retirement Date, Notice Period, Work Experience, Service Length.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employment Information according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Partially implemented in the active product through employee records, documents and profile services.

#### 04.6 Organization Assignment

**SR-04.6-01:** The platform shall maintain complete lifecycle capability for Organization Assignment, covering Enterprise, Company, Legal Entity, Business Unit, Division, Department, Sub-Department, Team, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Enterprise, Company, Legal Entity, Business Unit, Division, Department, Sub-Department, Team, Branch, Location, Cost Center, Position, Job, Designation, Grade, Manager, HR Business Partner.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Organization Assignment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Partially implemented in the active product through employee records, documents and profile services.

#### 04.7 Identification and Compliance

**SR-04.7-01:** The platform shall maintain complete lifecycle capability for Identification and Compliance, covering National Identity Number, Aadhaar, PAN, Tax Identity Number, Social Security Number, Passport, Visa, Work Permit, role-based operations, validation, status changes, reporting, and audit history.

Coverage: National Identity Number, Aadhaar, PAN, Tax Identity Number, Social Security Number, Passport, Visa, Work Permit, Driving License, Voter Identification, Professional License, Government Registrations, Identification Expiry, Identification Verification.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Identification and Compliance according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC, Finance and Statutory Configuration. Partially implemented in the active product through employee records, documents and profile services.

#### 04.8 Bank and Payment Information

**SR-04.8-01:** The platform shall maintain complete lifecycle capability for Bank and Payment Information, covering Bank Name, Account Holder, Account Number, Account Type, Bank Branch, Routing Code, IFSC, SWIFT, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Bank Name, Account Holder, Account Number, Account Type, Bank Branch, Routing Code, IFSC, SWIFT, IBAN, UPI, Salary Payment Method, Primary Bank Account, Multiple Bank Accounts, Bank Verification, Bank Change History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Bank and Payment Information according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Partially implemented in the active product through employee records, documents and profile services.

#### 04.9 Tax and Statutory Profile

**SR-04.9-01:** The platform shall manage compliant financial and compensation processes for Tax and Statutory Profile, including Tax Status, Tax Regime, Tax Identification, PF Number, ESI Number, Pension Number, Social Security Number, Gratuity Eligibility, validations, calculations, approvals, and reports.

Coverage: Tax Status, Tax Regime, Tax Identification, PF Number, ESI Number, Pension Number, Social Security Number, Gratuity Eligibility, Professional Tax, Statutory Registration, Tax Exemptions, Tax Residency, Tax Declaration Status.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Tax and Statutory Profile according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC, Finance and Statutory Configuration. Partially implemented in the active product through employee records, documents and profile services.

#### 04.10 Education and Qualifications

**SR-04.10-01:** The platform shall maintain complete lifecycle capability for Education and Qualifications, covering Education History, Qualification, Institution, Degree, Specialization, Graduation Year, Grade, Education Documents, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Education History, Qualification, Institution, Degree, Specialization, Graduation Year, Grade, Education Documents, Education Verification, Professional Qualifications, Licenses, Academic Achievements.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Education and Qualifications according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Document Management. Partially implemented in the active product through employee records, documents and profile services.

#### 04.11 Professional Experience

**SR-04.11-01:** The platform shall maintain complete lifecycle capability for Professional Experience, covering Previous Employers, Employment Dates, Previous Designation, Previous Salary, Responsibilities, Experience Letters, Reference Contacts, Total Experience, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Previous Employers, Employment Dates, Previous Designation, Previous Salary, Responsibilities, Experience Letters, Reference Contacts, Total Experience, Relevant Experience, Employment Verification, Career Breaks.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Professional Experience according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Document Management. Partially implemented in the active product through employee records, documents and profile services.

#### 04.12 Employee Skills Profile

**SR-04.12-01:** The platform shall maintain complete lifecycle capability for Employee Skills Profile, covering Skills, Skill Category, Skill Level, Skill Experience, Certifications, Languages, Competencies, Interests, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Skills, Skill Category, Skill Level, Skill Experience, Certifications, Languages, Competencies, Interests, Publications, Patents, Professional Memberships, Awards, Portfolio, Resume.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Skills Profile according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Partially implemented in the active product through employee records, documents and profile services.

#### 04.13 Employee Documents

**SR-04.13-01:** The platform shall maintain complete lifecycle capability for Employee Documents, covering Aadhaar, PAN, Passport, Visa, Driving License, Resume, Educational Certificates, Experience Certificates, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Aadhaar, PAN, Passport, Visa, Driving License, Resume, Educational Certificates, Experience Certificates, Medical Records, Tax Documents, Bank Documents, Employment Contract, Signed Agreements, Compliance Documents, Document Verification Status.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Documents according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Document Management. Partially implemented in the active product through employee records, documents and profile services.

#### 04.14 Employee Timeline

**SR-04.14-01:** The platform shall maintain complete lifecycle capability for Employee Timeline, covering Hire, Rehire, Confirmation, Contract Renewal, Transfer, Promotion, Demotion, Grade Change, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Hire, Rehire, Confirmation, Contract Renewal, Transfer, Promotion, Demotion, Grade Change, Salary Change, Manager Change, Location Change, Department Change, Position Change, Award, Warning, Training, Separation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Timeline according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration. Partially implemented in the active product through employee records, documents and profile services.

#### 04.15 Employee Data Change Requests

**SR-04.15-01:** The platform shall maintain complete lifecycle capability for Employee Data Change Requests, covering Personal Information Change, Name Change, Address Change, Contact Change, Bank Change, Tax Change, Dependent Change, Nominee Change, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Personal Information Change, Name Change, Address Change, Contact Change, Bank Change, Tax Change, Dependent Change, Nominee Change, Emergency Contact Change, Document Update, Profile Picture Change, Supporting Documents, Approval, Verification, Change History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Data Change Requests according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management. Partially implemented in the active product through employee records, documents and profile services.

#### 04.16 Employee Directory

**SR-04.16-01:** The platform shall maintain complete lifecycle capability for Employee Directory, covering Employee Search, Contact Directory, Department Directory, Team Directory, Skill Search, Location Search, Position Search, Manager Search, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Search, Contact Directory, Department Directory, Team Directory, Skill Search, Location Search, Position Search, Manager Search, Employee Profile Card, Organization Chart Link, Privacy-Controlled Directory, Export Directory.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Directory according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Integration Platform. Partially implemented in the active product through employee records, documents and profile services.

### Domain 05: Dashboards and Workspaces

**Objective:** Domain 05 establishes the platform capabilities for Dashboards and Workspaces. It coordinates Employee Dashboard, Manager Dashboard, HR Dashboard, Executive Dashboard and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented through current admin, HR and employee dashboards.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 05.1 | Insight | 28 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 05.2 | Insight | 21 | Worker Master, Organization Foundation, Workflow Engine |
| 05.3 | Insight | 26 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 05.4 | Insight | 22 | Worker Master, Organization Foundation, Finance and Statutory Configuration |
| 05.5 | Insight | 13 | Worker Master, Organization Foundation, Document Management |
| 05.6 | Insight | 13 | Organization Foundation, Identity and RBAC, Workflow Engine, Integration Platform |
| 05.7 | Operational | 20 | Worker Master, Finance and Statutory Configuration |
| 05.8 | Operational | 19 | Integration Platform |
| 05.9 | Operational | 15 | Identity and RBAC |
| 05.10 | Operational | 24 | Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 05.11 | Operational | 21 | Identity and RBAC, Finance and Statutory Configuration, Document Management |
| 05.12 | Operational | 19 | Organization Foundation, Integration Platform |
| 05.13 | Operational | 25 | Worker Master, Finance and Statutory Configuration, Workflow Engine |
| 05.14 | Operational | 19 | Workflow Engine |
| 05.15 | Insight | 12 | Organization Foundation, Identity and RBAC |
| 05.16 | Operational | 16 | Worker Master, Identity and RBAC |

#### 05.1 Employee Dashboard

**SR-05.1-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Employee Dashboard, covering Welcome Card, Profile Completion, Attendance Today, Punch In, Punch Out, Working Hours, Break Time, Current Shift and related insights.

Coverage: Welcome Card, Profile Completion, Attendance Today, Punch In, Punch Out, Working Hours, Break Time, Current Shift, Leave Balance, Apply Leave, Upcoming Holidays, Salary Summary, Payslip Download, Tax Summary, Expense Status, Reimbursement Status, Assigned Tasks, Pending Requests, My Documents, Helpdesk Tickets, Asset Requests, Company News, Birthdays, Work Anniversaries, Personal Calendar, Recent Activity, Quick Links, AI Assistant.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management. Partially implemented through current admin, HR and employee dashboards.

#### 05.2 Manager Dashboard

**SR-05.2-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Manager Dashboard, covering Team Headcount, Team Attendance, Team Availability, Team Leave, Team Shifts, Pending Approvals, Team Overtime, Team Performance and related insights.

Coverage: Team Headcount, Team Attendance, Team Availability, Team Leave, Team Shifts, Pending Approvals, Team Overtime, Team Performance, Team Goals, Team Productivity, Team Workload, Probation Reviews, Confirmation Reviews, Employee Requests, Open Tickets, Team Birthdays, Team Anniversaries, Team Calendar, Open Team Positions, Manager Alerts, Quick Approvals.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Manager Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Partially implemented through current admin, HR and employee dashboards.

#### 05.3 HR Dashboard

**SR-05.3-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for HR Dashboard, covering Total Employees, Active Employees, Inactive Employees, New Joiners, Separations, Resignations, Probation Employees, Confirmation Due and related insights.

Coverage: Total Employees, Active Employees, Inactive Employees, New Joiners, Separations, Resignations, Probation Employees, Confirmation Due, Contract Employees, Attendance Rate, Leave Requests, Leave Utilization, Recruitment Pipeline, Open Positions, Interviews, Offers Pending, Background Verification Pending, Onboarding Pending, Offboarding Pending, Payroll Status, Compliance Alerts, Document Verification, Attrition Rate, Diversity Metrics, Training Status, Employee Relations Cases.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for HR Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management. Partially implemented through current admin, HR and employee dashboards.

#### 05.4 Executive Dashboard

**SR-05.4-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Executive Dashboard, covering Enterprise Headcount, Company Overview, Business Units, Workforce Cost, Payroll Cost, Revenue per Employee, Attrition Rate, Hiring Trend and related insights.

Coverage: Enterprise Headcount, Company Overview, Business Units, Workforce Cost, Payroll Cost, Revenue per Employee, Attrition Rate, Hiring Trend, Organization Growth, Span of Control, Productivity Index, Attendance Analytics, Payroll Analytics, Department Performance, Employee Satisfaction, Performance Distribution, Talent Risk, Succession Coverage, Diversity Metrics, Workforce Forecast, Executive Reports, AI Insights.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Executive Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration. Partially implemented through current admin, HR and employee dashboards.

#### 05.5 Candidate Dashboard

**SR-05.5-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Candidate Dashboard, covering Candidate Profile, Applied Jobs, Saved Jobs, Application Status, Upcoming Interviews, Assessments, Pending Documents, Offer Status and related insights.

Coverage: Candidate Profile, Applied Jobs, Saved Jobs, Application Status, Upcoming Interviews, Assessments, Pending Documents, Offer Status, Background Verification Status, Joining Date, Joining Information, Candidate Notifications, Candidate Activity.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Candidate Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation, Document Management. Partially implemented through current admin, HR and employee dashboards.

#### 05.6 Administrator Dashboard

**SR-05.6-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Administrator Dashboard, covering Users, Roles, Permissions, Configuration Alerts, Integration Status, Import Jobs, Export Jobs, Workflow Failures and related insights.

Coverage: Users, Roles, Permissions, Configuration Alerts, Integration Status, Import Jobs, Export Jobs, Workflow Failures, Notification Failures, System Health, Security Alerts, Audit Alerts, License Usage.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Administrator Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC, Workflow Engine, Integration Platform. Partially implemented through current admin, HR and employee dashboards.

#### 05.7 Widget Framework

**SR-05.7-01:** The platform shall maintain complete lifecycle capability for Widget Framework, covering Widget Catalog, Attendance Widget, Leave Widget, Payroll Widget, Employee Widget, Recruitment Widget, Training Widget, Performance Widget, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Widget Catalog, Attendance Widget, Leave Widget, Payroll Widget, Employee Widget, Recruitment Widget, Training Widget, Performance Widget, Expense Widget, Travel Widget, Asset Widget, Helpdesk Widget, Task Widget, Calendar Widget, Announcement Widget, News Widget, Weather Widget, AI Assistant Widget, Custom Widgets, Third-Party Widgets.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Widget Framework according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Partially implemented through current admin, HR and employee dashboards.

#### 05.8 Widget Controls

**SR-05.8-01:** The platform shall maintain complete lifecycle capability for Widget Controls, covering Add Widget, Remove Personal Widget, Drag and Drop, Resize, Reorder, Collapse, Expand, Full Screen, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Add Widget, Remove Personal Widget, Drag and Drop, Resize, Reorder, Collapse, Expand, Full Screen, Refresh, Pin, Unpin, Favorite, Hide, Show, Duplicate, Export, Print, Share, Configure.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Widget Controls according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Partially implemented through current admin, HR and employee dashboards.

#### 05.9 KPI Cards

**SR-05.9-01:** The platform shall maintain complete lifecycle capability for KPI Cards, covering KPI Title, KPI Value, KPI Icon, Trend, Percentage Change, Previous Period, Comparison, Target, role-based operations, validation, status changes, reporting, and audit history.

Coverage: KPI Title, KPI Value, KPI Icon, Trend, Percentage Change, Previous Period, Comparison, Target, Variance, Mini Chart, Status, Drill-Down, Click Navigation, Last Updated, Permission-Controlled KPI.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for KPI Cards according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Partially implemented through current admin, HR and employee dashboards.

#### 05.10 Quick Actions

**SR-05.10-01:** The platform shall maintain complete lifecycle capability for Quick Actions, covering Apply Leave, Attendance Correction, Download Payslip, Raise Ticket, Submit Expense, Request Asset, Update Profile, Approve Leave, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Apply Leave, Attendance Correction, Download Payslip, Raise Ticket, Submit Expense, Request Asset, Update Profile, Approve Leave, Approve Attendance, Approve Expense, Approve Travel, Assign Task, Team Schedule, Add Employee, Process Payroll, Verify Documents, Create Announcement, Open Recruitment, View Analytics, Download Reports, Workforce Planning, Configurable Quick Actions, Favorite Actions, Recent Actions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Quick Actions according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management. Partially implemented through current admin, HR and employee dashboards.

#### 05.11 Notification Center

**SR-05.11-01:** The platform shall maintain complete lifecycle capability for Notification Center, covering Unread Notifications, Read Notifications, Priority Notifications, Attendance Notifications, Leave Notifications, Payroll Notifications, Recruitment Notifications, Training Notifications, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Unread Notifications, Read Notifications, Priority Notifications, Attendance Notifications, Leave Notifications, Payroll Notifications, Recruitment Notifications, Training Notifications, Performance Notifications, Policy Notifications, Security Notifications, System Notifications, AI Notifications, Search, Category Filters, Mark Read, Mark All Read, Archive, Snooze, Notification Details, Notification Preferences.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Notification Center according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Finance and Statutory Configuration, Document Management. Partially implemented through current admin, HR and employee dashboards.

#### 05.12 Unified Calendar

**SR-05.12-01:** The platform shall maintain complete lifecycle capability for Unified Calendar, covering Personal Calendar, Team Calendar, Company Calendar, Holiday Calendar, Leave Calendar, Shift Calendar, Training Calendar, Interview Calendar, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Personal Calendar, Team Calendar, Company Calendar, Holiday Calendar, Leave Calendar, Shift Calendar, Training Calendar, Interview Calendar, Recruitment Calendar, Meeting Calendar, Birthday Calendar, Anniversary Calendar, Event Calendar, Day View, Week View, Month View, Agenda View, Calendar Export, Calendar Synchronization.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Unified Calendar according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Integration Platform. Partially implemented through current admin, HR and employee dashboards.

#### 05.13 Activity Feed

**SR-05.13-01:** The platform shall maintain complete lifecycle capability for Activity Feed, covering Personal Activities, Team Activities, HR Activities, Executive Activities, System Activities, Approval Activities, Attendance Activities, Leave Activities, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Personal Activities, Team Activities, HR Activities, Executive Activities, System Activities, Approval Activities, Attendance Activities, Leave Activities, Payroll Activities, Recruitment Activities, Employee Added, Profile Updated, Asset Assigned, Expense Submitted, Ticket Updated, Promotion, Salary Revision, AI Recommendation, Timeline View, Filter, Search, Category Tags, Priority Indicators, Infinite Scroll, Real-Time Updates.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Activity Feed according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Partially implemented through current admin, HR and employee dashboards.

#### 05.14 Task Center

**SR-05.14-01:** The platform shall maintain complete lifecycle capability for Task Center, covering My Tasks, Assigned Tasks, Team Tasks, Approval Tasks, HR Tasks, Onboarding Tasks, Offboarding Tasks, Completed Tasks, role-based operations, validation, status changes, reporting, and audit history.

Coverage: My Tasks, Assigned Tasks, Team Tasks, Approval Tasks, HR Tasks, Onboarding Tasks, Offboarding Tasks, Completed Tasks, Pending Tasks, Overdue Tasks, Due Date, Priority, Status, Comments, Attachments, Task Assignment, Task Reassignment, Task Delegation, Task History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Task Center according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Partially implemented through current admin, HR and employee dashboards.

#### 05.15 Dashboard Customization

**SR-05.15-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Dashboard Customization, covering Save Layout, Reset Layout, Multiple Layouts, Default Layout, Role Layout, Department Layout, Company Layout, Device-Specific Layout and related insights.

Coverage: Save Layout, Reset Layout, Multiple Layouts, Default Layout, Role Layout, Department Layout, Company Layout, Device-Specific Layout, Dashboard Themes, Dashboard Preferences, Widget Permissions, Layout Versioning.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Dashboard Customization according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC. Partially implemented through current admin, HR and employee dashboards.

#### 05.16 Mobile and Kiosk Workspace

**SR-05.16-01:** The platform shall maintain complete lifecycle capability for Mobile and Kiosk Workspace, covering Mobile ESS, Mobile MSS, Mobile HR, Mobile Dashboard, Offline Mode, Mobile Attendance, GPS Punch, Face Attendance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Mobile ESS, Mobile MSS, Mobile HR, Mobile Dashboard, Offline Mode, Mobile Attendance, GPS Punch, Face Attendance, Fingerprint Attendance, QR Attendance, Push Notifications, Digital Employee Card, Mobile Payslip, Mobile Wallet, Kiosk Login, Shared Device Mode.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Mobile and Kiosk Workspace according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC. Partially implemented through current admin, HR and employee dashboards.

### Domain 06: Attendance, Time, Shift and Scheduling

**Objective:** Domain 06 establishes the platform capabilities for Attendance, Time, Shift and Scheduling. It coordinates Attendance Capture, Location-Based Attendance, Attendance Processing, Attendance Exceptions and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 06.1 | Operational | 14 | Platform Foundation |
| 06.2 | Operational | 11 | Worker Master, Organization Foundation |
| 06.3 | Operational | 14 | Platform Foundation |
| 06.4 | Operational | 12 | Organization Foundation |
| 06.5 | Operational | 11 | Worker Master, Workflow Engine, Document Management |
| 06.6 | Operational | 14 | Platform Foundation |
| 06.7 | Operational | 13 | Worker Master, Organization Foundation |
| 06.8 | Operational | 10 | Organization Foundation |
| 06.9 | Operational | 10 | Worker Master, Workflow Engine |
| 06.10 | Operational | 13 | Workflow Engine |
| 06.11 | Operational | 11 | Document Management |
| 06.12 | Operational | 13 | Workflow Engine |
| 06.13 | Operational | 10 | Organization Foundation, Workflow Engine |
| 06.14 | Workflow | 11 | Worker Master, Finance and Statutory Configuration, Workflow Engine |
| 06.15 | Integration | 11 | Identity and RBAC, Integration Platform |
| 06.16 | Insight | 12 | Worker Master, Organization Foundation |

#### 06.1 Attendance Capture

**SR-06.1-01:** The platform shall maintain complete lifecycle capability for Attendance Capture, covering Punch In, Punch Out, Web Punch, Mobile Punch, Biometric Punch, Face Recognition, Fingerprint, QR Attendance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Punch In, Punch Out, Web Punch, Mobile Punch, Biometric Punch, Face Recognition, Fingerprint, QR Attendance, NFC Attendance, Badge Attendance, Kiosk Attendance, Manual Attendance, Offline Attendance, Automatic Punch.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance Capture according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.2 Location-Based Attendance

**SR-06.2-01:** The platform shall maintain complete lifecycle capability for Location-Based Attendance, covering GPS Attendance, Geofencing, Allowed Locations, Restricted Locations, Location Accuracy, Location Spoof Detection, Route Attendance, Field Employee Attendance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: GPS Attendance, Geofencing, Allowed Locations, Restricted Locations, Location Accuracy, Location Spoof Detection, Route Attendance, Field Employee Attendance, Worksite Attendance, Client-Site Attendance, Remote Attendance.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Location-Based Attendance according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.3 Attendance Processing

**SR-06.3-01:** The platform shall maintain complete lifecycle capability for Attendance Processing, covering Daily Attendance, Weekly Attendance, Monthly Attendance, Attendance Status, Present, Absent, Half Day, Weekly Off, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Daily Attendance, Weekly Attendance, Monthly Attendance, Attendance Status, Present, Absent, Half Day, Weekly Off, Holiday, Paid Leave, Unpaid Leave, Work From Home, Attendance Regularization, Attendance Calculation Rules.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance Processing according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.4 Attendance Exceptions

**SR-06.4-01:** The platform shall maintain complete lifecycle capability for Attendance Exceptions, covering Missed Punch, Duplicate Punch, Late Arrival, Early Exit, Insufficient Hours, Excess Hours, Unauthorized Absence, Shift Mismatch, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Missed Punch, Duplicate Punch, Late Arrival, Early Exit, Insufficient Hours, Excess Hours, Unauthorized Absence, Shift Mismatch, Device Failure, Location Mismatch, Attendance Exception Alerts, Exception Resolution.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance Exceptions according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.5 Attendance Correction

**SR-06.5-01:** The platform shall maintain complete lifecycle capability for Attendance Correction, covering Correction Request, Punch Addition, Punch Removal, Time Correction, Status Correction, Reason, Supporting Document, Manager Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Correction Request, Punch Addition, Punch Removal, Time Correction, Status Correction, Reason, Supporting Document, Manager Approval, HR Approval, Bulk Correction, Correction History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance Correction according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.6 Shift Management

**SR-06.6-01:** The platform shall maintain complete lifecycle capability for Shift Management, covering Shift Master, Fixed Shift, Flexible Shift, Rotational Shift, Night Shift, Split Shift, Weekend Shift, On-Call Shift, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Shift Master, Fixed Shift, Flexible Shift, Rotational Shift, Night Shift, Split Shift, Weekend Shift, On-Call Shift, Seasonal Shift, Shift Grace Time, Shift Breaks, Shift Allowance, Shift Effective Dates, Shift Calendar.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Shift Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.7 Roster and Scheduling

**SR-06.7-01:** The platform shall maintain complete lifecycle capability for Roster and Scheduling, covering Roster Planning, Daily Roster, Weekly Roster, Monthly Roster, Team Roster, Department Roster, Location Roster, Skill-Based Scheduling, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Roster Planning, Daily Roster, Weekly Roster, Monthly Roster, Team Roster, Department Roster, Location Roster, Skill-Based Scheduling, Demand-Based Scheduling, Workforce Forecast Scheduling, Schedule Publication, Schedule Changes, Employee Availability.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Roster and Scheduling according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.8 Shift Assignment

**SR-06.8-01:** The platform shall maintain complete lifecycle capability for Shift Assignment, covering Individual Assignment, Team Assignment, Department Assignment, Location Assignment, Bulk Assignment, Temporary Shift, Shift Rotation, Future Shift Assignment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Individual Assignment, Team Assignment, Department Assignment, Location Assignment, Bulk Assignment, Temporary Shift, Shift Rotation, Future Shift Assignment, Assignment History, Shift Conflict Detection.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Shift Assignment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.9 Shift Swap

**SR-06.9-01:** The platform shall maintain complete lifecycle capability for Shift Swap, covering Shift Swap Request, Open Shift, Employee Exchange, Eligibility Check, Availability Check, Shift Conflict Check, Manager Approval, HR Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Shift Swap Request, Open Shift, Employee Exchange, Eligibility Check, Availability Check, Shift Conflict Check, Manager Approval, HR Approval, Swap Cancellation, Swap History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Shift Swap according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.10 Time Tracking

**SR-06.10-01:** The platform shall maintain complete lifecycle capability for Time Tracking, covering Timesheets, Project Time, Task Time, Client Time, Billable Time, Non-Billable Time, Daily Timesheet, Weekly Timesheet, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Timesheets, Project Time, Task Time, Client Time, Billable Time, Non-Billable Time, Daily Timesheet, Weekly Timesheet, Monthly Timesheet, Timesheet Submission, Timesheet Approval, Timesheet Rejection, Productivity Tracking.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Time Tracking according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.11 Break Management

**SR-06.11-01:** The platform shall maintain complete lifecycle capability for Break Management, covering Break Types, Paid Break, Unpaid Break, Meal Break, Rest Break, Break Start, Break End, Break Duration, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Break Types, Paid Break, Unpaid Break, Meal Break, Rest Break, Break Start, Break End, Break Duration, Break Violations, Break Policy, Automatic Break Deduction.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Break Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.12 Overtime

**SR-06.12-01:** The platform shall maintain complete lifecycle capability for Overtime, covering Overtime Request, Pre-Approval, Overtime Eligibility, Overtime Calculation, Daily Overtime, Weekly Overtime, Holiday Overtime, Night Overtime, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Overtime Request, Pre-Approval, Overtime Eligibility, Overtime Calculation, Daily Overtime, Weekly Overtime, Holiday Overtime, Night Overtime, Weekend Overtime, Overtime Approval, Overtime Payment, Overtime Comp-Off, Overtime Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Overtime according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.13 Flexible and Remote Work

**SR-06.13-01:** The platform shall maintain complete lifecycle capability for Flexible and Remote Work, covering Flexible Schedule, Remote Work Schedule, Hybrid Work Schedule, Work From Home Request, Remote Work Request, Work Location Declaration, Flexible Hours, Core Working Hours, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Flexible Schedule, Remote Work Schedule, Hybrid Work Schedule, Work From Home Request, Remote Work Request, Work Location Declaration, Flexible Hours, Core Working Hours, Remote Work Approval, Remote Work History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Flexible and Remote Work according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.14 Attendance Approval and Lock

**SR-06.14-01:** The platform shall support configurable workflows for Attendance Approval and Lock, including Daily Approval, Weekly Approval, Monthly Approval, Manager Approval, HR Approval, Bulk Approval, Attendance Lock, Attendance Unlock, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Daily Approval, Weekly Approval, Monthly Approval, Manager Approval, HR Approval, Bulk Approval, Attendance Lock, Attendance Unlock, Attendance Reopen, Payroll Cut-Off, Approval History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance Approval and Lock according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.15 Attendance Integrations

**SR-06.15-01:** The platform shall expose governed integration capabilities for Attendance Integrations, covering Biometric Devices, Face Recognition Devices, Fingerprint Devices, Access Control Systems, Mobile Devices, GPS Devices, Device Mapping, Device Synchronization, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Biometric Devices, Face Recognition Devices, Fingerprint Devices, Access Control Systems, Mobile Devices, GPS Devices, Device Mapping, Device Synchronization, Offline Device Sync, Device Health, Device Error Logs.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Identity and RBAC, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 06.16 Attendance Analytics

**SR-06.16-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Attendance Analytics, covering Attendance Percentage, Absence Rate, Late Arrival Trend, Early Exit Trend, Overtime Trend, Shift Compliance, Schedule Compliance, Location Attendance and related insights.

Coverage: Attendance Percentage, Absence Rate, Late Arrival Trend, Early Exit Trend, Overtime Trend, Shift Compliance, Schedule Compliance, Location Attendance, Department Attendance, Manager Attendance, Attendance Anomalies, Attendance Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 07: Leave and Absence Management

**Objective:** Domain 07 establishes the platform capabilities for Leave and Absence Management. It coordinates Leave Types, Leave Policy, Leave Balance Engine, Leave Request and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented through attendance and shift management.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 07.1 | Operational | 19 | Platform Foundation |
| 07.2 | Control | 19 | Workflow Engine, Document Management |
| 07.3 | Operational | 13 | Platform Foundation |
| 07.4 | Workflow | 13 | Worker Master, Workflow Engine |
| 07.5 | Workflow | 12 | Worker Master, Workflow Engine |
| 07.6 | Operational | 10 | Workflow Engine |
| 07.7 | Operational | 9 | Workflow Engine |
| 07.8 | Operational | 9 | Organization Foundation, Workflow Engine, Document Management |
| 07.9 | Operational | 10 | Finance and Statutory Configuration, Workflow Engine, Document Management |
| 07.10 | Operational | 9 | Workflow Engine, Document Management |
| 07.11 | Operational | 10 | Organization Foundation |
| 07.12 | Operational | 9 | Worker Master, Organization Foundation, Integration Platform |
| 07.13 | Operational | 11 | Worker Master, Document Management |
| 07.14 | Insight | 10 | Organization Foundation, Document Management |

#### 07.1 Leave Types

**SR-07.1-01:** The platform shall maintain complete lifecycle capability for Leave Types, covering Casual Leave, Sick Leave, Earned Leave, Annual Leave, Privilege Leave, Maternity Leave, Paternity Leave, Adoption Leave, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Casual Leave, Sick Leave, Earned Leave, Annual Leave, Privilege Leave, Maternity Leave, Paternity Leave, Adoption Leave, Marriage Leave, Bereavement Leave, Study Leave, Sabbatical, Unpaid Leave, Loss of Pay, Comp-Off, Optional Holiday, Hourly Leave, Half-Day Leave, Work From Home.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Types according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Partially implemented through attendance and shift management.

#### 07.2 Leave Policy

**SR-07.2-01:** The platform shall maintain complete lifecycle capability for Leave Policy, covering Eligibility, Entitlement, Accrual, Proration, Carry Forward, Encashment, Lapse, Maximum Balance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Eligibility, Entitlement, Accrual, Proration, Carry Forward, Encashment, Lapse, Maximum Balance, Minimum Request, Maximum Request, Advance Leave, Negative Balance, Sandwich Rule, Prefix Rule, Suffix Rule, Holiday Rule, Weekend Rule, Joining-Year Rule, Separation-Year Rule.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Policy according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Document Management. Partially implemented through attendance and shift management.

#### 07.3 Leave Balance Engine

**SR-07.3-01:** The platform shall maintain complete lifecycle capability for Leave Balance Engine, covering Opening Balance, Accrued Balance, Used Balance, Available Balance, Pending Balance, Future Balance, Adjustment, Correction, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Opening Balance, Accrued Balance, Used Balance, Available Balance, Pending Balance, Future Balance, Adjustment, Correction, Balance Transfer, Carry Forward, Encashment, Lapse, Balance History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Balance Engine according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Partially implemented through attendance and shift management.

#### 07.4 Leave Request

**SR-07.4-01:** The platform shall maintain complete lifecycle capability for Leave Request, covering Full-Day Leave, Half-Day Leave, Hourly Leave, Multiple-Day Leave, Partial-Day Leave, Attachment, Reason, Contact During Leave, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Full-Day Leave, Half-Day Leave, Hourly Leave, Multiple-Day Leave, Partial-Day Leave, Attachment, Reason, Contact During Leave, Handover Details, Substitute Employee, Emergency Leave, Backdated Leave, Future Leave.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Request according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Partially implemented through attendance and shift management.

#### 07.5 Leave Approval

**SR-07.5-01:** The platform shall support configurable workflows for Leave Approval, including Manager Approval, HR Approval, Multi-Level Approval, Parallel Approval, Conditional Approval, Auto Approval, Delegated Approval, Escalation, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Manager Approval, HR Approval, Multi-Level Approval, Parallel Approval, Conditional Approval, Auto Approval, Delegated Approval, Escalation, Approval Comments, Rejection, Resubmission, Approval History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Approval according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Worker Master, Workflow Engine. Partially implemented through attendance and shift management.

#### 07.6 Leave Modification

**SR-07.6-01:** The platform shall maintain complete lifecycle capability for Leave Modification, covering Edit Request, Cancel Request, Withdraw Request, Extend Leave, Shorten Leave, Return Early, Recall from Leave, Modification Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Edit Request, Cancel Request, Withdraw Request, Extend Leave, Shorten Leave, Return Early, Recall from Leave, Modification Approval, Cancellation Approval, Leave Reversal.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Modification according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Partially implemented through attendance and shift management.

#### 07.7 Compensatory Off

**SR-07.7-01:** The platform shall maintain complete lifecycle capability for Compensatory Off, covering Comp-Off Earned, Overtime Conversion, Holiday Work Conversion, Weekend Work Conversion, Comp-Off Request, Comp-Off Approval, Comp-Off Expiry, Comp-Off Balance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Comp-Off Earned, Overtime Conversion, Holiday Work Conversion, Weekend Work Conversion, Comp-Off Request, Comp-Off Approval, Comp-Off Expiry, Comp-Off Balance, Comp-Off Adjustment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compensatory Off according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Partially implemented through attendance and shift management.

#### 07.8 Work From Home and Remote Work

**SR-07.8-01:** The platform shall maintain complete lifecycle capability for Work From Home and Remote Work, covering Work From Home Request, Hybrid Work Request, Remote Work Request, Remote Location, WFH Policy, WFH Approval, WFH Calendar, WFH Balance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Work From Home Request, Hybrid Work Request, Remote Work Request, Remote Location, WFH Policy, WFH Approval, WFH Calendar, WFH Balance, WFH History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Work From Home and Remote Work according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Workflow Engine, Document Management. Partially implemented through attendance and shift management.

#### 07.9 Long-Term Absence

**SR-07.9-01:** The platform shall maintain complete lifecycle capability for Long-Term Absence, covering Maternity Case, Paternity Case, Adoption Leave Case, Medical Leave, Disability Leave, Sabbatical, Extended Unpaid Leave, Supporting Documents, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Maternity Case, Paternity Case, Adoption Leave Case, Medical Leave, Disability Leave, Sabbatical, Extended Unpaid Leave, Supporting Documents, Benefit Continuation, Return-to-Work Plan.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Long-Term Absence according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine, Document Management. Partially implemented through attendance and shift management.

#### 07.10 Medical and Return-to-Work

**SR-07.10-01:** The platform shall maintain complete lifecycle capability for Medical and Return-to-Work, covering Medical Certificate, Fitness Certificate, Medical Verification, Return-to-Work Assessment, Workplace Accommodation, Restricted Duties, Phased Return, Medical Review, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Medical Certificate, Fitness Certificate, Medical Verification, Return-to-Work Assessment, Workplace Accommodation, Restricted Duties, Phased Return, Medical Review, Return-to-Work Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Medical and Return-to-Work according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Document Management. Partially implemented through attendance and shift management.

#### 07.11 Holiday Management

**SR-07.11-01:** The platform shall maintain complete lifecycle capability for Holiday Management, covering Holiday Calendar, National Holidays, Regional Holidays, Company Holidays, Optional Holidays, Location Holidays, Shift Holidays, Floating Holidays, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Holiday Calendar, National Holidays, Regional Holidays, Company Holidays, Optional Holidays, Location Holidays, Shift Holidays, Floating Holidays, Holiday Assignment, Holiday Exchange.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Holiday Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Partially implemented through attendance and shift management.

#### 07.12 Leave Calendar

**SR-07.12-01:** The platform shall maintain complete lifecycle capability for Leave Calendar, covering Personal Leave Calendar, Team Leave Calendar, Department Calendar, Organization Calendar, Conflict Detection, Team Availability, Leave Heatmap, Manager Calendar, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Personal Leave Calendar, Team Leave Calendar, Department Calendar, Organization Calendar, Conflict Detection, Team Availability, Leave Heatmap, Manager Calendar, Export Calendar.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Calendar according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Integration Platform. Partially implemented through attendance and shift management.

#### 07.13 Leave Administration

**SR-07.13-01:** The platform shall maintain complete lifecycle capability for Leave Administration, covering Bulk Leave Adjustment, Bulk Entitlement, Policy Assignment, Employee Exceptions, Leave Lock, Leave Reopen, Year-End Processing, Carry-Forward Processing, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Bulk Leave Adjustment, Bulk Entitlement, Policy Assignment, Employee Exceptions, Leave Lock, Leave Reopen, Year-End Processing, Carry-Forward Processing, Encashment Processing, Leave Migration, Leave Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Document Management. Partially implemented through attendance and shift management.

#### 07.14 Leave Analytics

**SR-07.14-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Leave Analytics, covering Leave Utilization, Absence Rate, Leave Liability, Leave Trend, Department Leave, Location Leave, Seasonal Absence, Frequent Absence and related insights.

Coverage: Leave Utilization, Absence Rate, Leave Liability, Leave Trend, Department Leave, Location Leave, Seasonal Absence, Frequent Absence, Leave Policy Compliance, Leave Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Leave Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Organization Foundation, Document Management. Partially implemented through attendance and shift management.

### Domain 08: Recruitment and Candidate Experience

**Objective:** Domain 08 establishes the platform capabilities for Recruitment and Candidate Experience. It coordinates Recruitment Dashboard, Workforce and Manpower Request, Job Requisition, Job Management and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 08.1 | Insight | 12 | Worker Master, Organization Foundation |
| 08.2 | Workflow | 12 | Worker Master, Organization Foundation, Workflow Engine |
| 08.3 | Operational | 17 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine |
| 08.4 | Operational | 16 | Worker Master, Organization Foundation |
| 08.5 | Operational | 13 | Worker Master, Organization Foundation |
| 08.6 | Operational | 12 | Worker Master, Organization Foundation |
| 08.7 | Operational | 15 | Worker Master |
| 08.8 | Operational | 22 | Worker Master, Organization Foundation, Identity and RBAC, Document Management |
| 08.9 | Operational | 12 | Worker Master |
| 08.10 | Operational | 12 | Worker Master |
| 08.11 | Operational | 12 | Worker Master, Workflow Engine |
| 08.12 | Operational | 10 | Worker Master, Organization Foundation, Workflow Engine |
| 08.13 | Operational | 10 | Worker Master, Integration Platform |
| 08.14 | Operational | 13 | Worker Master |
| 08.15 | Operational | 10 | Worker Master, Workflow Engine |
| 08.16 | Operational | 20 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 08.17 | Operational | 18 | Worker Master, Workflow Engine, Document Management |
| 08.18 | Operational | 10 | Worker Master, Workflow Engine |
| 08.19 | Operational | 11 | Worker Master, Organization Foundation |
| 08.20 | Operational | 9 | Worker Master, Organization Foundation |
| 08.21 | Insight | 13 | Worker Master, Organization Foundation |

#### 08.1 Recruitment Dashboard

**SR-08.1-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Recruitment Dashboard, covering Open Positions, Filled Positions, Pending Positions, Candidates, Applications, Interviews, Offers, Joining Pipeline and related insights.

Coverage: Open Positions, Filled Positions, Pending Positions, Candidates, Applications, Interviews, Offers, Joining Pipeline, Recruitment Funnel, Recruitment KPIs, Recruiter Performance, Hiring Alerts.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Recruitment Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.2 Workforce and Manpower Request

**SR-08.2-01:** The platform shall maintain complete lifecycle capability for Workforce and Manpower Request, covering New Position Request, Replacement Request, Additional Headcount, Temporary Resource Request, Contractor Request, Budget Validation, Position Validation, Department Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: New Position Request, Replacement Request, Additional Headcount, Temporary Resource Request, Contractor Request, Budget Validation, Position Validation, Department Approval, HR Approval, Finance Approval, Executive Approval, Request History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workforce and Manpower Request according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.3 Job Requisition

**SR-08.3-01:** The platform shall maintain complete lifecycle capability for Job Requisition, covering Create Requisition, Edit Requisition, Requisition Template, Position, Department, Location, Hiring Manager, Recruiter, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Create Requisition, Edit Requisition, Requisition Template, Position, Department, Location, Hiring Manager, Recruiter, Vacancy Count, Target Hire Date, Salary Range, Requisition Approval, Requisition Rejection, Requisition Hold, Requisition Cancellation, Requisition Closure, Requisition History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Job Requisition according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.4 Job Management

**SR-08.4-01:** The platform shall maintain complete lifecycle capability for Job Management, covering Job Master, Job Title, Job Code, Job Description, Responsibilities, Required Skills, Required Education, Required Experience, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Job Master, Job Title, Job Code, Job Description, Responsibilities, Required Skills, Required Education, Required Experience, Certifications, Employment Type, Job Grade, Job Family, Work Location, Remote Eligibility, Compensation Range, Vacancy Count.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Job Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.5 Job Posting

**SR-08.5-01:** The platform shall maintain complete lifecycle capability for Job Posting, covering Internal Job Posting, External Job Posting, Career Portal Posting, Job Board Posting, Social Media Posting, Agency Posting, Campus Posting, Posting Schedule, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Internal Job Posting, External Job Posting, Career Portal Posting, Job Board Posting, Social Media Posting, Agency Posting, Campus Posting, Posting Schedule, Posting Start Date, Posting Expiry, Multi-Language Posting, Posting Closure, Posting Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Job Posting according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.6 Candidate Sourcing

**SR-08.6-01:** The platform shall maintain complete lifecycle capability for Candidate Sourcing, covering Direct Applicants, Recruiter Sourcing, Employee Referrals, Recruitment Agencies, Job Boards, Campus Hiring, Walk-In Candidates, Social Recruiting, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Direct Applicants, Recruiter Sourcing, Employee Referrals, Recruitment Agencies, Job Boards, Campus Hiring, Walk-In Candidates, Social Recruiting, Talent Communities, Previous Candidates, Internal Candidates, Source Tracking.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Candidate Sourcing according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.7 Candidate Relationship Management

**SR-08.7-01:** The platform shall maintain complete lifecycle capability for Candidate Relationship Management, covering Candidate Master, Candidate ID, Candidate Profile, Resume, Skills, Experience, Education, Certifications, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Candidate Master, Candidate ID, Candidate Profile, Resume, Skills, Experience, Education, Certifications, Candidate Source, Candidate Tags, Candidate Notes, Candidate Communication, Candidate History, Talent Pool, Candidate Consent.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Candidate Relationship Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.8 Candidate Portal

**SR-08.8-01:** The platform shall maintain complete lifecycle capability for Candidate Portal, covering Candidate Registration, Candidate Login, OTP Login, Password Reset, Candidate Profile, Resume Upload, Document Upload, Education, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Candidate Registration, Candidate Login, OTP Login, Password Reset, Candidate Profile, Resume Upload, Document Upload, Education, Experience, Skills, Certifications, Job Search, Saved Jobs, Job Application, Application Tracking, Interview Schedule, Assessment Status, Offer Status, Background Verification, Joining Information, Communication Center, Candidate Notifications.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Candidate Portal according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.9 Application Management

**SR-08.9-01:** The platform shall maintain complete lifecycle capability for Application Management, covering Application Submission, Duplicate Application Check, Eligibility Questions, Screening Questions, Application Status, Application Transfer, Application Withdrawal, Candidate Consent, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Application Submission, Duplicate Application Check, Eligibility Questions, Screening Questions, Application Status, Application Transfer, Application Withdrawal, Candidate Consent, Privacy Consent, Application History, Application Rejection, Application Hold.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Application Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.10 Screening

**SR-08.10-01:** The platform shall maintain complete lifecycle capability for Screening, covering Resume Screening, Resume Parsing, AI Resume Screening, Eligibility Screening, Recruiter Screening, Hiring Manager Screening, Screening Score, Screening Notes, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Resume Screening, Resume Parsing, AI Resume Screening, Eligibility Screening, Recruiter Screening, Hiring Manager Screening, Screening Score, Screening Notes, Shortlisting, Rejection, Hold, Screening History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Screening according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.11 Assessments

**SR-08.11-01:** The platform shall maintain complete lifecycle capability for Assessments, covering Technical Assessment, Aptitude Test, Personality Test, Language Test, Coding Test, Psychometric Test, Case Study, Assessment Scheduling, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Technical Assessment, Aptitude Test, Personality Test, Language Test, Coding Test, Psychometric Test, Case Study, Assessment Scheduling, Assessment Provider, Assessment Score, Assessment Result, Assessment Retake.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Assessments according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.12 Interview Planning

**SR-08.12-01:** The platform shall maintain complete lifecycle capability for Interview Planning, covering Interview Request, Interview Types, Interview Rounds, Interview Modes, Interview Panel, Interviewer Assignment, Interviewer Availability, Candidate Availability, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Interview Request, Interview Types, Interview Rounds, Interview Modes, Interview Panel, Interviewer Assignment, Interviewer Availability, Candidate Availability, Interview Location, Video Meeting Link.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Interview Planning according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.13 Interview Scheduling

**SR-08.13-01:** The platform shall maintain complete lifecycle capability for Interview Scheduling, covering Automatic Scheduling, Manual Scheduling, Calendar Integration, Interview Invitations, Candidate Confirmation, Interviewer Confirmation, Rescheduling, Cancellation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Automatic Scheduling, Manual Scheduling, Calendar Integration, Interview Invitations, Candidate Confirmation, Interviewer Confirmation, Rescheduling, Cancellation, Reminder, Interview Schedule History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Interview Scheduling according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.14 Interview Evaluation

**SR-08.14-01:** The platform shall maintain complete lifecycle capability for Interview Evaluation, covering Interview Scorecard, Technical Rating, Functional Rating, Communication Rating, Leadership Rating, Experience Rating, Culture Fit, Competency Rating, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Interview Scorecard, Technical Rating, Functional Rating, Communication Rating, Leadership Rating, Experience Rating, Culture Fit, Competency Rating, Overall Rating, Interview Comments, Recommendation, Panel Consensus, Final Result.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Interview Evaluation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.15 Selection Management

**SR-08.15-01:** The platform shall maintain complete lifecycle capability for Selection Management, covering Candidate Comparison, Selection Recommendation, Hiring Manager Decision, HR Decision, Compensation Fit, Reference Check, Selection Approval, Rejection Reason, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Candidate Comparison, Selection Recommendation, Hiring Manager Decision, HR Decision, Compensation Fit, Reference Check, Selection Approval, Rejection Reason, Candidate Hold, Selection History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Selection Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.16 Offer Management

**SR-08.16-01:** The platform shall maintain complete lifecycle capability for Offer Management, covering Offer Template, Offer Creation, Position, Salary, Benefits, Joining Date, Location, Reporting Manager, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Offer Template, Offer Creation, Position, Salary, Benefits, Joining Date, Location, Reporting Manager, Employment Type, Compensation Package, Offer Approval, Offer Letter Generation, PDF Generation, Digital Signature, Offer Revision, Offer Expiry, Offer Acceptance, Offer Rejection, Offer Withdrawal, Offer History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Offer Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.17 Background Verification

**SR-08.17-01:** The platform shall maintain complete lifecycle capability for Background Verification, covering Verification Request, Identity Verification, Address Verification, Education Verification, Employment Verification, Criminal Verification, Reference Verification, Credit Verification, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Verification Request, Identity Verification, Address Verification, Education Verification, Employment Verification, Criminal Verification, Reference Verification, Credit Verification, Drug Screening, Document Verification, Verification Provider, Provider Assignment, Candidate Clarification, Additional Information Request, Verification Status, Verification Result, Verification Approval, Verification SLA.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Background Verification according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.18 Referral Management

**SR-08.18-01:** The platform shall maintain complete lifecycle capability for Referral Management, covering Employee Referral, Referral Campaign, Referral Eligibility, Referral Submission, Referral Status, Referral Bonus, Bonus Approval, Referral Payment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Referral, Referral Campaign, Referral Eligibility, Referral Submission, Referral Status, Referral Bonus, Bonus Approval, Referral Payment, Referral History, Referral Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Referral Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.19 Agency and Vendor Management

**SR-08.19-01:** The platform shall maintain complete lifecycle capability for Agency and Vendor Management, covering Recruitment Agency, Vendor Registration, Vendor Contract, Vendor Jobs, Candidate Submission, Duplicate Submission, Vendor Fee, Vendor Invoice, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Recruitment Agency, Vendor Registration, Vendor Contract, Vendor Jobs, Candidate Submission, Duplicate Submission, Vendor Fee, Vendor Invoice, Vendor Performance, Vendor Compliance, Vendor Rating.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Agency and Vendor Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.20 Internal Jobs

**SR-08.20-01:** The platform shall maintain complete lifecycle capability for Internal Jobs, covering Internal Job Portal, Internal Applications, Employee Eligibility, Manager Release, Internal Interview, Internal Selection, Internal Offer, Internal Transfer Link, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Internal Job Portal, Internal Applications, Employee Eligibility, Manager Release, Internal Interview, Internal Selection, Internal Offer, Internal Transfer Link, Internal Job History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Internal Jobs according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 08.21 Recruitment Analytics

**SR-08.21-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Recruitment Analytics, covering Recruitment Funnel, Time to Hire, Time to Fill, Cost per Hire, Source Effectiveness, Candidate Conversion, Recruiter Performance, Interview Conversion and related insights.

Coverage: Recruitment Funnel, Time to Hire, Time to Fill, Cost per Hire, Source Effectiveness, Candidate Conversion, Recruiter Performance, Interview Conversion, Offer Acceptance Rate, Joining Rate, Diversity Hiring, Department Hiring, Hiring Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Recruitment Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 09: Onboarding and Employee Lifecycle Operations

**Objective:** Domain 09 establishes the platform capabilities for Onboarding and Employee Lifecycle Operations. It coordinates Preboarding, Onboarding Dashboard, Onboarding Case Management, Candidate-to-Employee Conversion and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented through salary slip, payroll import and statutory-adjacent flows.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 09.1 | Operational | 12 | Worker Master, Finance and Statutory Configuration, Document Management |
| 09.2 | Insight | 10 | Worker Master, Workflow Engine, Document Management |
| 09.3 | Workflow | 12 | Worker Master, Organization Foundation, Workflow Engine |
| 09.4 | Operational | 11 | Worker Master, Organization Foundation, Finance and Statutory Configuration |
| 09.5 | Operational | 10 | Worker Master, Finance and Statutory Configuration, Document Management |
| 09.6 | Operational | 11 | Worker Master, Identity and RBAC |
| 09.7 | Operational | 10 | Worker Master, Identity and RBAC |
| 09.8 | Operational | 10 | Worker Master, Organization Foundation, Identity and RBAC |
| 09.9 | Operational | 8 | Worker Master, Identity and RBAC, Finance and Statutory Configuration |
| 09.10 | Operational | 10 | Worker Master, Organization Foundation, Identity and RBAC, Document Management |
| 09.11 | Operational | 13 | Worker Master, Document Management |
| 09.12 | Operational | 12 | Worker Master, Workflow Engine, Document Management |
| 09.13 | Operational | 10 | Worker Master, Workflow Engine, Document Management |
| 09.14 | Operational | 16 | Worker Master, Organization Foundation, Identity and RBAC, Workflow Engine, Document Management |
| 09.15 | Operational | 12 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 09.16 | Operational | 11 | Worker Master, Organization Foundation |
| 09.17 | Operational | 10 | Worker Master, Finance and Statutory Configuration, Workflow Engine |

#### 09.1 Preboarding

**SR-09.1-01:** The platform shall maintain complete lifecycle capability for Preboarding, covering Welcome Portal, Welcome Email, Candidate Information, Prejoining Forms, Personal Details, Bank Details, Tax Details, Emergency Contacts, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Welcome Portal, Welcome Email, Candidate Information, Prejoining Forms, Personal Details, Bank Details, Tax Details, Emergency Contacts, Document Collection, Policy Acceptance, Joining Confirmation, Preboarding Progress.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Preboarding according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.2 Onboarding Dashboard

**SR-09.2-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Onboarding Dashboard, covering New Joiners, Joining Today, Joining This Week, Pending Onboarding, Pending Documents, Pending Tasks, Pending Approvals, Delayed Onboarding and related insights.

Coverage: New Joiners, Joining Today, Joining This Week, Pending Onboarding, Pending Documents, Pending Tasks, Pending Approvals, Delayed Onboarding, Completed Onboarding, Onboarding SLA.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Onboarding Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.3 Onboarding Case Management

**SR-09.3-01:** The platform shall maintain complete lifecycle capability for Onboarding Case Management, covering Onboarding Case, Joining Date, Joining Location, Onboarding Owner, Onboarding Status, Task Assignment, Task Dependencies, Due Dates, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Onboarding Case, Joining Date, Joining Location, Onboarding Owner, Onboarding Status, Task Assignment, Task Dependencies, Due Dates, Reminder, Escalation, Completion Tracking, Onboarding History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Onboarding Case Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.4 Candidate-to-Employee Conversion

**SR-09.4-01:** The platform shall maintain complete lifecycle capability for Candidate-to-Employee Conversion, covering Candidate Conversion, Person Record Creation, Worker Record Creation, Employee Number Generation, User Account Creation, Position Assignment, Organization Assignment, Payroll Assignment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Candidate Conversion, Person Record Creation, Worker Record Creation, Employee Number Generation, User Account Creation, Position Assignment, Organization Assignment, Payroll Assignment, Benefit Assignment, Candidate Record Link, Duplicate Prevention.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Candidate-to-Employee Conversion according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.5 HR Onboarding Checklist

**SR-09.5-01:** The platform shall maintain complete lifecycle capability for HR Onboarding Checklist, covering Employee Creation, Employee ID, Employment Contract, Appointment Letter, Policy Acceptance, Statutory Forms, Document Verification, Orientation Schedule, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Creation, Employee ID, Employment Contract, Appointment Letter, Policy Acceptance, Statutory Forms, Document Verification, Orientation Schedule, Payroll Enrollment, Benefit Enrollment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for HR Onboarding Checklist according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.6 IT Onboarding Checklist

**SR-09.6-01:** The platform shall maintain complete lifecycle capability for IT Onboarding Checklist, covering Email Account, Directory Account, Laptop, Desktop, Mobile, SIM, Software Access, VPN, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Email Account, Directory Account, Laptop, Desktop, Mobile, SIM, Software Access, VPN, Application Access, Security Training, IT Handover.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for IT Onboarding Checklist according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.7 Admin Onboarding Checklist

**SR-09.7-01:** The platform shall maintain complete lifecycle capability for Admin Onboarding Checklist, covering ID Card, Access Card, Seating, Parking, Uniform, Locker, Facility Access, Welcome Kit, role-based operations, validation, status changes, reporting, and audit history.

Coverage: ID Card, Access Card, Seating, Parking, Uniform, Locker, Facility Access, Welcome Kit, Transportation, Accommodation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Admin Onboarding Checklist according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.8 Manager Onboarding Checklist

**SR-09.8-01:** The platform shall maintain complete lifecycle capability for Manager Onboarding Checklist, covering Team Introduction, Role Briefing, Job Description, Initial Goals, Initial Tasks, Mentor Assignment, Buddy Assignment, Training Plan, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Team Introduction, Role Briefing, Job Description, Initial Goals, Initial Tasks, Mentor Assignment, Buddy Assignment, Training Plan, Review Schedule, Department Orientation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Manager Onboarding Checklist according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.9 Finance Onboarding Checklist

**SR-09.9-01:** The platform shall maintain complete lifecycle capability for Finance Onboarding Checklist, covering Bank Verification, Payroll Setup, Tax Setup, Cost Center, Expense Access, Corporate Card, Advance Eligibility, Reimbursement Eligibility, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Bank Verification, Payroll Setup, Tax Setup, Cost Center, Expense Access, Corporate Card, Advance Eligibility, Reimbursement Eligibility.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Finance Onboarding Checklist according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC, Finance and Statutory Configuration. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.10 Orientation and Induction

**SR-09.10-01:** The platform shall maintain complete lifecycle capability for Orientation and Induction, covering Company Orientation, Department Orientation, Policy Training, Compliance Training, Culture Orientation, Safety Training, Role Training, Leadership Introduction, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Company Orientation, Department Orientation, Policy Training, Compliance Training, Culture Orientation, Safety Training, Role Training, Leadership Introduction, Orientation Attendance, Orientation Feedback.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Orientation and Induction according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.11 Probation Management

**SR-09.11-01:** The platform shall maintain complete lifecycle capability for Probation Management, covering Probation Policy, Probation Period, Probation Start Date, Probation End Date, Probation Dashboard, Review Schedule, Manager Assessment, HR Assessment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Probation Policy, Probation Period, Probation Start Date, Probation End Date, Probation Dashboard, Review Schedule, Manager Assessment, HR Assessment, Employee Feedback, Probation Extension, Confirmation Recommendation, Probation Alerts, Probation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Probation Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.12 Confirmation Management

**SR-09.12-01:** The platform shall maintain complete lifecycle capability for Confirmation Management, covering Confirmation Eligibility, Confirmation Request, Manager Recommendation, HR Review, Performance Review, Confirmation Approval, Confirmation Date, Confirmation Letter, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Confirmation Eligibility, Confirmation Request, Manager Recommendation, HR Review, Performance Review, Confirmation Approval, Confirmation Date, Confirmation Letter, Extend Probation, Reject Confirmation, Hold Confirmation, Confirmation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Confirmation Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.13 Contract Renewal

**SR-09.13-01:** The platform shall maintain complete lifecycle capability for Contract Renewal, covering Contract Expiry Alerts, Renewal Request, Manager Recommendation, HR Review, New Contract Period, Terms Revision, Compensation Revision, Renewal Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Contract Expiry Alerts, Renewal Request, Manager Recommendation, HR Review, New Contract Period, Terms Revision, Compensation Revision, Renewal Approval, Renewal Letter, Contract History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Contract Renewal according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.14 Internal Transfer

**SR-09.14-01:** The platform shall maintain complete lifecycle capability for Internal Transfer, covering Department Transfer, Location Transfer, Branch Transfer, Company Transfer, Legal Entity Transfer, Business Unit Transfer, Cost Center Transfer, Position Transfer, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Department Transfer, Location Transfer, Branch Transfer, Company Transfer, Legal Entity Transfer, Business Unit Transfer, Cost Center Transfer, Position Transfer, Role Transfer, Manager Transfer, Transfer Request, Transfer Approval, Effective Date, Transfer Impact Assessment, Transfer Letter, Transfer History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Internal Transfer according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC, Workflow Engine, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.15 Promotion

**SR-09.15-01:** The platform shall maintain complete lifecycle capability for Promotion, covering Promotion Request, Promotion Eligibility, Performance Validation, New Position, New Designation, New Grade, Salary Change, Compensation Review, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Promotion Request, Promotion Eligibility, Performance Validation, New Position, New Designation, New Grade, Salary Change, Compensation Review, Promotion Approval, Effective Date, Promotion Letter, Promotion History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Promotion according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.16 Other Employee Movements

**SR-09.16-01:** The platform shall maintain complete lifecycle capability for Other Employee Movements, covering Demotion, Acting Assignment, Temporary Assignment, Deputation, Secondment, Job Rotation, Project Assignment, Reassignment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Demotion, Acting Assignment, Temporary Assignment, Deputation, Secondment, Job Rotation, Project Assignment, Reassignment, Location Assignment, Return from Assignment, Employee Movement History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Other Employee Movements according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

#### 09.17 Rehire and Rejoin

**SR-09.17-01:** The platform shall maintain complete lifecycle capability for Rehire and Rejoin, covering Former Employee Search, Rehire Eligibility, Rehire Approval, Previous Employment History, New Employment Record, Employee Number Rules, Service Continuity, Benefit Continuity, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Former Employee Search, Rehire Eligibility, Rehire Approval, Previous Employment History, New Employment Record, Employee Number Rules, Service Continuity, Benefit Continuity, Rehire Onboarding, Rehire History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Rehire and Rejoin according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Partially implemented through salary slip, payroll import and statutory-adjacent flows.

### Domain 10: Payroll

**Objective:** Domain 10 establishes the platform capabilities for Payroll. It coordinates Payroll Configuration, Payroll Inputs, Salary Components, Deduction Components and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented through HR hiring screens and backend hiring workflows.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 10.1 | Operational | 12 | Organization Foundation, Finance and Statutory Configuration |
| 10.2 | Operational | 15 | Finance and Statutory Configuration, Integration Platform |
| 10.3 | Operational | 15 | Organization Foundation, Finance and Statutory Configuration |
| 10.4 | Operational | 13 | Identity and RBAC, Finance and Statutory Configuration |
| 10.5 | Operational | 12 | Finance and Statutory Configuration |
| 10.6 | Operational | 12 | Finance and Statutory Configuration |
| 10.7 | Operational | 10 | Identity and RBAC, Finance and Statutory Configuration |
| 10.8 | Operational | 12 | Finance and Statutory Configuration |
| 10.9 | Operational | 11 | Worker Master, Finance and Statutory Configuration |
| 10.10 | Workflow | 11 | Worker Master, Finance and Statutory Configuration, Workflow Engine |
| 10.11 | Operational | 12 | Finance and Statutory Configuration, Workflow Engine |
| 10.12 | Operational | 11 | Finance and Statutory Configuration |
| 10.13 | Operational | 11 | Organization Foundation, Finance and Statutory Configuration |
| 10.14 | Operational | 9 | Worker Master, Finance and Statutory Configuration, Workflow Engine |
| 10.15 | Operational | 9 | Finance and Statutory Configuration, Document Management |
| 10.16 | Insight | 11 | Organization Foundation, Finance and Statutory Configuration |

#### 10.1 Payroll Configuration

**SR-10.1-01:** The platform shall manage compliant financial and compensation processes for Payroll Configuration, including Payroll Countries, Payroll Areas, Payroll Groups, Payroll Frequency, Payroll Calendar, Pay Periods, Cut-Off Dates, Payment Dates, validations, calculations, approvals, and reports.

Coverage: Payroll Countries, Payroll Areas, Payroll Groups, Payroll Frequency, Payroll Calendar, Pay Periods, Cut-Off Dates, Payment Dates, Payroll Currency, Country Payroll Rules, Company Payroll Rules, Payroll Eligibility.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Configuration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.2 Payroll Inputs

**SR-10.2-01:** The platform shall manage compliant financial and compensation processes for Payroll Inputs, including Attendance Inputs, Leave Inputs, Overtime Inputs, Shift Allowance, Variable Pay, Bonus, Incentives, Commission, validations, calculations, approvals, and reports.

Coverage: Attendance Inputs, Leave Inputs, Overtime Inputs, Shift Allowance, Variable Pay, Bonus, Incentives, Commission, Reimbursements, Loans, Advances, One-Time Earnings, One-Time Deductions, Manual Adjustments, Import Inputs.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Inputs according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Integration Platform. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.3 Salary Components

**SR-10.3-01:** The platform shall manage compliant financial and compensation processes for Salary Components, including Basic Salary, House Rent Allowance, Special Allowance, Conveyance, Medical Allowance, Meal Allowance, Shift Allowance, Location Allowance, validations, calculations, approvals, and reports.

Coverage: Basic Salary, House Rent Allowance, Special Allowance, Conveyance, Medical Allowance, Meal Allowance, Shift Allowance, Location Allowance, Hardship Allowance, Variable Pay, Bonus, Incentive, Commission, Gross Salary, Net Salary.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Salary Components according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.4 Deduction Components

**SR-10.4-01:** The platform shall maintain complete lifecycle capability for Deduction Components, covering Income Tax, Social Security, Provident Fund, Insurance, Professional Tax, Pension, Loan Deduction, Advance Recovery, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Income Tax, Social Security, Provident Fund, Insurance, Professional Tax, Pension, Loan Deduction, Advance Recovery, Notice Recovery, Asset Recovery, Voluntary Deduction, Garnishment, Other Deductions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Deduction Components according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.5 Gross-to-Net Processing

**SR-10.5-01:** The platform shall maintain complete lifecycle capability for Gross-to-Net Processing, covering Earnings Calculation, Deduction Calculation, Proration, Leave Without Pay, Loss of Pay, Overtime Calculation, Arrears, Retroactive Calculation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Earnings Calculation, Deduction Calculation, Proration, Leave Without Pay, Loss of Pay, Overtime Calculation, Arrears, Retroactive Calculation, Rounding, Net Pay Calculation, Minimum Net Pay, Payroll Exceptions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Gross-to-Net Processing according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.6 Tax Management

**SR-10.6-01:** The platform shall manage compliant financial and compensation processes for Tax Management, including Tax Declaration, Investment Declaration, Tax Proof Upload, Tax Proof Verification, Income Tax, Tax Regime, TDS, Tax Calculator, validations, calculations, approvals, and reports.

Coverage: Tax Declaration, Investment Declaration, Tax Proof Upload, Tax Proof Verification, Income Tax, Tax Regime, TDS, Tax Calculator, Tax Exemptions, Tax Adjustments, Form 16, Annual Tax Statement.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Tax Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.7 Statutory Management

**SR-10.7-01:** The platform shall maintain complete lifecycle capability for Statutory Management, covering Provident Fund, ESI, Professional Tax, Pension, Gratuity, Social Security, Labor Welfare Fund, Country Statutory Contributions, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Provident Fund, ESI, Professional Tax, Pension, Gratuity, Social Security, Labor Welfare Fund, Country Statutory Contributions, Statutory Returns, Statutory Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Statutory Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.8 Payroll Processing

**SR-10.8-01:** The platform shall manage compliant financial and compensation processes for Payroll Processing, including Payroll Run, Trial Payroll, Final Payroll, Incremental Payroll, Off-Cycle Payroll, Supplementary Payroll, Retro Payroll, Payroll Reprocessing, validations, calculations, approvals, and reports.

Coverage: Payroll Run, Trial Payroll, Final Payroll, Incremental Payroll, Off-Cycle Payroll, Supplementary Payroll, Retro Payroll, Payroll Reprocessing, Payroll Rollback, Payroll Simulation, Bulk Payroll, Payroll Status.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Processing according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.9 Payroll Validation

**SR-10.9-01:** The platform shall manage compliant financial and compensation processes for Payroll Validation, including Missing Data Validation, Negative Net Pay, High Variance, Duplicate Payment, Bank Validation, Tax Validation, Attendance Validation, Leave Validation, validations, calculations, approvals, and reports.

Coverage: Missing Data Validation, Negative Net Pay, High Variance, Duplicate Payment, Bank Validation, Tax Validation, Attendance Validation, Leave Validation, Component Validation, Employee Count Validation, Exception Resolution.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Validation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.10 Payroll Approval and Lock

**SR-10.10-01:** The platform shall support configurable workflows for Payroll Approval and Lock, including Payroll Review, HR Approval, Payroll Manager Approval, Finance Approval, Executive Approval, Final Approval, Payroll Lock, Payroll Unlock, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Payroll Review, HR Approval, Payroll Manager Approval, Finance Approval, Executive Approval, Final Approval, Payroll Lock, Payroll Unlock, Payroll Reopen, Approval Comments, Approval History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Approval and Lock according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.11 Salary Payment

**SR-10.11-01:** The platform shall manage compliant financial and compensation processes for Salary Payment, including Bank Advice, Bank File, Payment Batch, Payment Approval, Payment Release, Payment Status, Payment Rejection, Reprocessing, validations, calculations, approvals, and reports.

Coverage: Bank Advice, Bank File, Payment Batch, Payment Approval, Payment Release, Payment Status, Payment Rejection, Reprocessing, Cash Payment, Cheque Payment, UPI Payment, Payment Reconciliation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Salary Payment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.12 Payslips and Statements

**SR-10.12-01:** The platform shall maintain complete lifecycle capability for Payslips and Statements, covering Monthly Payslip, Off-Cycle Payslip, Annual Salary Statement, Tax Statement, Earnings Statement, Deduction Statement, Payslip Download, Payslip Email, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Monthly Payslip, Off-Cycle Payslip, Annual Salary Statement, Tax Statement, Earnings Statement, Deduction Statement, Payslip Download, Payslip Email, Mobile Payslip, Payslip Password Protection, Payslip History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payslips and Statements according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.13 Payroll Costing and General Ledger

**SR-10.13-01:** The platform shall manage compliant financial and compensation processes for Payroll Costing and General Ledger, including Payroll Cost Allocation, Cost Center Allocation, Project Allocation, Department Cost, Location Cost, General Ledger Posting, GL Mapping, Journal File, validations, calculations, approvals, and reports.

Coverage: Payroll Cost Allocation, Cost Center Allocation, Project Allocation, Department Cost, Location Cost, General Ledger Posting, GL Mapping, Journal File, Finance Reconciliation, Posting Status, Posting Reversal.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Costing and General Ledger according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.14 Payroll Reconciliation

**SR-10.14-01:** The platform shall manage compliant financial and compensation processes for Payroll Reconciliation, including Previous Month Comparison, Employee Count Reconciliation, Gross Pay Reconciliation, Net Pay Reconciliation, Tax Reconciliation, Bank Reconciliation, GL Reconciliation, Variance Investigation, validations, calculations, approvals, and reports.

Coverage: Previous Month Comparison, Employee Count Reconciliation, Gross Pay Reconciliation, Net Pay Reconciliation, Tax Reconciliation, Bank Reconciliation, GL Reconciliation, Variance Investigation, Reconciliation Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Reconciliation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.15 Year-End Processing

**SR-10.15-01:** The platform shall maintain complete lifecycle capability for Year-End Processing, covering Annual Tax Calculation, Tax Certificates, Form 16, Year-End Adjustment, Statutory Returns, Payroll Year Closure, Opening New Payroll Year, Balance Carry Forward, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Annual Tax Calculation, Tax Certificates, Form 16, Year-End Adjustment, Statutory Returns, Payroll Year Closure, Opening New Payroll Year, Balance Carry Forward, Year-End Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Year-End Processing according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Document Management. Partially implemented through HR hiring screens and backend hiring workflows.

#### 10.16 Payroll Analytics

**SR-10.16-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Payroll Analytics, covering Payroll Cost, Cost by Company, Cost by Department, Cost by Location, Overtime Cost, Bonus Cost, Tax Cost, Payroll Variance and related insights.

Coverage: Payroll Cost, Cost by Company, Cost by Department, Cost by Location, Overtime Cost, Bonus Cost, Tax Cost, Payroll Variance, Net Pay Trend, Payroll Exception Trend, Payroll Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Partially implemented through HR hiring screens and backend hiring workflows.

### Domain 11: Compensation Management

**Objective:** Domain 11 establishes the platform capabilities for Compensation Management. It coordinates Compensation Framework, Pay Grades and Bands, Salary Structures, Compensation Review Cycle and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 11.1 | Operational | 10 | Document Management |
| 11.2 | Operational | 11 | Organization Foundation, Finance and Statutory Configuration |
| 11.3 | Operational | 11 | Worker Master, Organization Foundation, Finance and Statutory Configuration |
| 11.4 | Operational | 10 | Worker Master, Workflow Engine, Document Management |
| 11.5 | Operational | 10 | Worker Master, Organization Foundation, Workflow Engine |
| 11.6 | Operational | 9 | Organization Foundation, Workflow Engine |
| 11.7 | Operational | 12 | Workflow Engine |
| 11.8 | Operational | 10 | Platform Foundation |
| 11.9 | Operational | 11 | Worker Master, Organization Foundation, Workflow Engine |
| 11.10 | Operational | 8 | Finance and Statutory Configuration, Document Management |
| 11.11 | Operational | 9 | Organization Foundation |
| 11.12 | Insight | 9 | Organization Foundation |

#### 11.1 Compensation Framework

**SR-11.1-01:** The platform shall manage compliant financial and compensation processes for Compensation Framework, including Compensation Philosophy, Compensation Policy, Fixed Pay, Variable Pay, Total Cash, Total Compensation, Total Rewards, Target Compensation, validations, calculations, approvals, and reports.

Coverage: Compensation Philosophy, Compensation Policy, Fixed Pay, Variable Pay, Total Cash, Total Compensation, Total Rewards, Target Compensation, Compensation Eligibility, Compensation Effective Dates.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compensation Framework according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.2 Pay Grades and Bands

**SR-11.2-01:** The platform shall maintain complete lifecycle capability for Pay Grades and Bands, covering Salary Grade, Salary Band, Minimum Salary, Midpoint, Maximum Salary, Band Range, Market Position, Grade Progression, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Salary Grade, Salary Band, Minimum Salary, Midpoint, Maximum Salary, Band Range, Market Position, Grade Progression, Grade Mapping, Country Bands, Location Bands.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Pay Grades and Bands according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.3 Salary Structures

**SR-11.3-01:** The platform shall manage compliant financial and compensation processes for Salary Structures, including Country Structure, Company Structure, Grade Structure, Job Structure, Position Structure, Employee Structure, Earnings Mix, Allowance Mix, validations, calculations, approvals, and reports.

Coverage: Country Structure, Company Structure, Grade Structure, Job Structure, Position Structure, Employee Structure, Earnings Mix, Allowance Mix, Structure Versioning, Effective Dating, Salary Structure History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Salary Structures according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.4 Compensation Review Cycle

**SR-11.4-01:** The platform shall manage compliant financial and compensation processes for Compensation Review Cycle, including Review Cycle, Eligible Population, Review Budget, Manager Worksheet, HR Review, Calibration, Executive Approval, Review Closure, validations, calculations, approvals, and reports.

Coverage: Review Cycle, Eligible Population, Review Budget, Manager Worksheet, HR Review, Calibration, Executive Approval, Review Closure, Compensation Letter, Cycle History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compensation Review Cycle according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.5 Merit Increase

**SR-11.5-01:** The platform shall maintain complete lifecycle capability for Merit Increase, covering Merit Guidelines, Performance-Based Increase, Range Position, Increase Recommendation, Budget Check, Manager Recommendation, HR Review, Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Merit Guidelines, Performance-Based Increase, Range Position, Increase Recommendation, Budget Check, Manager Recommendation, HR Review, Approval, Effective Date, Merit History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Merit Increase according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.6 Promotion Increase

**SR-11.6-01:** The platform shall maintain complete lifecycle capability for Promotion Increase, covering Promotion Guidelines, Grade Change Increase, Position Change Increase, Designation Change Increase, Market Adjustment, Promotion Budget, Approval, Effective Date, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Promotion Guidelines, Grade Change Increase, Position Change Increase, Designation Change Increase, Market Adjustment, Promotion Budget, Approval, Effective Date, Promotion Compensation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Promotion Increase according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.7 Bonus and Variable Pay

**SR-11.7-01:** The platform shall maintain complete lifecycle capability for Bonus and Variable Pay, covering Bonus Plan, Incentive Plan, Sales Commission, Performance Bonus, Retention Bonus, Joining Bonus, Project Bonus, Target Bonus, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Bonus Plan, Incentive Plan, Sales Commission, Performance Bonus, Retention Bonus, Joining Bonus, Project Bonus, Target Bonus, Payout Calculation, Bonus Approval, Bonus Statement, Bonus History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Bonus and Variable Pay according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.8 Equity and Long-Term Incentives

**SR-11.8-01:** The platform shall maintain complete lifecycle capability for Equity and Long-Term Incentives, covering Equity Plan, Stock Options, Restricted Stock, Grants, Vesting Schedule, Exercise, Forfeiture, Long-Term Incentive, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Equity Plan, Stock Options, Restricted Stock, Grants, Vesting Schedule, Exercise, Forfeiture, Long-Term Incentive, Equity Statement, Equity History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Equity and Long-Term Incentives according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.9 Compensation Budgeting

**SR-11.9-01:** The platform shall manage compliant financial and compensation processes for Compensation Budgeting, including Enterprise Budget, Company Budget, Department Budget, Manager Budget, Merit Budget, Promotion Budget, Bonus Budget, Budget Allocation, validations, calculations, approvals, and reports.

Coverage: Enterprise Budget, Company Budget, Department Budget, Manager Budget, Merit Budget, Promotion Budget, Bonus Budget, Budget Allocation, Budget Transfer, Budget Utilization, Budget Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compensation Budgeting according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.10 Compensation Statements

**SR-11.10-01:** The platform shall manage compliant financial and compensation processes for Compensation Statements, including Total Compensation Statement, Total Rewards Statement, Salary Revision Letter, Bonus Statement, Incentive Statement, Equity Statement, Benefit Value, Compensation History, validations, calculations, approvals, and reports.

Coverage: Total Compensation Statement, Total Rewards Statement, Salary Revision Letter, Bonus Statement, Incentive Statement, Equity Statement, Benefit Value, Compensation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compensation Statements according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.11 Pay Equity

**SR-11.11-01:** The platform shall maintain complete lifecycle capability for Pay Equity, covering Gender Pay Gap, Location Pay Gap, Grade Pay Gap, Department Pay Gap, Market Comparison, Internal Equity, Outlier Detection, Remediation Planning, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Gender Pay Gap, Location Pay Gap, Grade Pay Gap, Department Pay Gap, Market Comparison, Internal Equity, Outlier Detection, Remediation Planning, Pay Equity Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Pay Equity according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 11.12 Compensation Analytics

**SR-11.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Compensation Analytics, covering Compa-Ratio, Range Penetration, Market Position, Compensation Cost, Increase Distribution, Bonus Distribution, Pay Equity, Budget Utilization and related insights.

Coverage: Compa-Ratio, Range Penetration, Market Position, Compensation Cost, Increase Distribution, Bonus Distribution, Pay Equity, Budget Utilization, Compensation Trend.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compensation Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 12: Benefits and Wellness

**Objective:** Domain 12 establishes the platform capabilities for Benefits and Wellness. It coordinates Benefit Plan Management, Eligibility, Enrollment, Dependents and Beneficiaries and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 12.1 | Operational | 10 | Worker Master, Finance and Statutory Configuration, Document Management |
| 12.2 | Operational | 10 | Worker Master, Organization Foundation, Finance and Statutory Configuration |
| 12.3 | Operational | 10 | Worker Master, Finance and Statutory Configuration, Workflow Engine |
| 12.4 | Operational | 9 | Organization Foundation, Finance and Statutory Configuration, Document Management |
| 12.5 | Operational | 10 | Finance and Statutory Configuration |
| 12.6 | Operational | 10 | Worker Master, Finance and Statutory Configuration |
| 12.7 | Operational | 10 | Finance and Statutory Configuration |
| 12.8 | Operational | 10 | Worker Master, Finance and Statutory Configuration |
| 12.9 | Operational | 10 | Finance and Statutory Configuration, Workflow Engine, Document Management |
| 12.10 | Operational | 10 | Organization Foundation, Finance and Statutory Configuration |
| 12.11 | Operational | 10 | Finance and Statutory Configuration |
| 12.12 | Insight | 9 | Worker Master, Finance and Statutory Configuration |

#### 12.1 Benefit Plan Management

**SR-12.1-01:** The platform shall maintain complete lifecycle capability for Benefit Plan Management, covering Benefit Categories, Benefit Plans, Plan Providers, Plan Period, Plan Cost, Employer Contribution, Employee Contribution, Plan Documents, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Benefit Categories, Benefit Plans, Plan Providers, Plan Period, Plan Cost, Employer Contribution, Employee Contribution, Plan Documents, Plan Status, Plan Versioning.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Benefit Plan Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.2 Eligibility

**SR-12.2-01:** The platform shall maintain complete lifecycle capability for Eligibility, covering Employment Eligibility, Worker Type Eligibility, Grade Eligibility, Location Eligibility, Age Eligibility, Service Eligibility, Dependent Eligibility, Waiting Period, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employment Eligibility, Worker Type Eligibility, Grade Eligibility, Location Eligibility, Age Eligibility, Service Eligibility, Dependent Eligibility, Waiting Period, Eligibility Exceptions, Eligibility History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Eligibility according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.3 Enrollment

**SR-12.3-01:** The platform shall maintain complete lifecycle capability for Enrollment, covering New Hire Enrollment, Annual Enrollment, Open Enrollment, Automatic Enrollment, Employee Selection, Waiver, Enrollment Approval, Enrollment Confirmation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: New Hire Enrollment, Annual Enrollment, Open Enrollment, Automatic Enrollment, Employee Selection, Waiver, Enrollment Approval, Enrollment Confirmation, Enrollment Changes, Enrollment History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Enrollment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.4 Dependents and Beneficiaries

**SR-12.4-01:** The platform shall maintain complete lifecycle capability for Dependents and Beneficiaries, covering Dependent Enrollment, Beneficiary Assignment, Relationship, Allocation Percentage, Supporting Documents, Verification, Dependent Removal, Beneficiary Change, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Dependent Enrollment, Beneficiary Assignment, Relationship, Allocation Percentage, Supporting Documents, Verification, Dependent Removal, Beneficiary Change, Beneficiary History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Dependents and Beneficiaries according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.5 Insurance

**SR-12.5-01:** The platform shall maintain complete lifecycle capability for Insurance, covering Health Insurance, Life Insurance, Accident Insurance, Disability Insurance, Travel Insurance, Critical Illness, Family Coverage, Insurance Cards, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Health Insurance, Life Insurance, Accident Insurance, Disability Insurance, Travel Insurance, Critical Illness, Family Coverage, Insurance Cards, Coverage Details, Insurance Claims.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Insurance according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.6 Retirement and Pension

**SR-12.6-01:** The platform shall maintain complete lifecycle capability for Retirement and Pension, covering Retirement Plan, Pension Plan, Provident Fund, Employee Contribution, Employer Contribution, Voluntary Contribution, Vesting, Retirement Projection, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Retirement Plan, Pension Plan, Provident Fund, Employee Contribution, Employer Contribution, Voluntary Contribution, Vesting, Retirement Projection, Retirement Statement, Retirement Withdrawal.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Retirement and Pension according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.7 Flexible Benefits

**SR-12.7-01:** The platform shall maintain complete lifecycle capability for Flexible Benefits, covering Flexible Benefit Wallet, Benefit Credits, Benefit Selection, Benefit Exchange, Reimbursement Benefits, Taxable Benefits, Non-Taxable Benefits, Flex Balance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Flexible Benefit Wallet, Benefit Credits, Benefit Selection, Benefit Exchange, Reimbursement Benefits, Taxable Benefits, Non-Taxable Benefits, Flex Balance, Flex Carry Forward, Flex Expiry.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Flexible Benefits according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.8 Wellness

**SR-12.8-01:** The platform shall maintain complete lifecycle capability for Wellness, covering Wellness Programs, Health Assessment, Fitness Programs, Mental Wellness, Employee Assistance Program, Counseling, Health Challenges, Wellness Rewards, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Wellness Programs, Health Assessment, Fitness Programs, Mental Wellness, Employee Assistance Program, Counseling, Health Challenges, Wellness Rewards, Wellness Calendar, Wellness Content.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Wellness according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.9 Benefit Claims

**SR-12.9-01:** The platform shall provide governed intelligent assistance for Benefit Claims, covering Claim Submission, Claim Documents, Claim Verification, Provider Review, Claim Approval, Claim Rejection, Claim Payment, Claim Status, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Claim Submission, Claim Documents, Claim Verification, Provider Review, Claim Approval, Claim Rejection, Claim Payment, Claim Status, Claim History, Claim Appeal.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Benefit Claims according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.10 Life Events

**SR-12.10-01:** The platform shall maintain complete lifecycle capability for Life Events, covering Marriage, Birth, Adoption, Divorce, Death of Dependent, Dependent Aging Out, Location Change, Employment Change, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Marriage, Birth, Adoption, Divorce, Death of Dependent, Dependent Aging Out, Location Change, Employment Change, Benefit Re-Enrollment, Life Event Evidence.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Life Events according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.11 Vendor and Billing

**SR-12.11-01:** The platform shall maintain complete lifecycle capability for Vendor and Billing, covering Benefit Vendor, Vendor Contract, Enrollment File, Vendor Reconciliation, Premium Invoice, Billing Validation, Payment Status, Provider SLA, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Benefit Vendor, Vendor Contract, Enrollment File, Vendor Reconciliation, Premium Invoice, Billing Validation, Payment Status, Provider SLA, Vendor Performance, Vendor Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Vendor and Billing according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 12.12 Benefit Analytics

**SR-12.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Benefit Analytics, covering Enrollment Rate, Plan Utilization, Benefit Cost, Employer Contribution, Employee Contribution, Claim Trend, Wellness Participation, Benefit Satisfaction and related insights.

Coverage: Enrollment Rate, Plan Utilization, Benefit Cost, Employer Contribution, Employee Contribution, Claim Trend, Wellness Participation, Benefit Satisfaction, Vendor Performance.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Benefit Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 13: Expense, Reimbursement and Advances

**Objective:** Domain 13 establishes the platform capabilities for Expense, Reimbursement and Advances. It coordinates Expense Policy, Expense Claims, Reimbursement Types, Receipt Management and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 13.1 | Control | 11 | Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 13.2 | Operational | 14 | Finance and Statutory Configuration |
| 13.3 | Operational | 14 | Organization Foundation, Finance and Statutory Configuration |
| 13.4 | Operational | 11 | Finance and Statutory Configuration |
| 13.5 | Operational | 11 | Finance and Statutory Configuration, Workflow Engine |
| 13.6 | Operational | 11 | Finance and Statutory Configuration, Integration Platform |
| 13.7 | Operational | 11 | Finance and Statutory Configuration |
| 13.8 | Workflow | 10 | Worker Master, Finance and Statutory Configuration, Workflow Engine |
| 13.9 | Operational | 9 | Worker Master, Finance and Statutory Configuration |
| 13.10 | Operational | 11 | Finance and Statutory Configuration, Document Management |
| 13.11 | Integration | 10 | Finance and Statutory Configuration, Integration Platform |
| 13.12 | Insight | 10 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management |

#### 13.1 Expense Policy

**SR-13.1-01:** The platform shall maintain complete lifecycle capability for Expense Policy, covering Expense Categories, Expense Limits, Receipt Requirements, Approval Limits, Grade Rules, Location Rules, Country Rules, Currency Rules, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Expense Categories, Expense Limits, Receipt Requirements, Approval Limits, Grade Rules, Location Rules, Country Rules, Currency Rules, Tax Rules, Policy Exceptions, Policy Assignment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Expense Policy according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.2 Expense Claims

**SR-13.2-01:** The platform shall provide governed intelligent assistance for Expense Claims, covering Create Claim, Expense Date, Expense Category, Merchant, Amount, Currency, Exchange Rate, Tax, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Create Claim, Expense Date, Expense Category, Merchant, Amount, Currency, Exchange Rate, Tax, Cost Center, Project, Client, Business Purpose, Attendees, Comments.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Expense Claims according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.3 Reimbursement Types

**SR-13.3-01:** The platform shall maintain complete lifecycle capability for Reimbursement Types, covering Medical, Travel, Fuel, Mobile, Internet, Meals, Food, Entertainment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Medical, Travel, Fuel, Mobile, Internet, Meals, Food, Entertainment, Hotel, Office Supplies, Education, Relocation, Miscellaneous, Other Claims.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Reimbursement Types according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.4 Receipt Management

**SR-13.4-01:** The platform shall maintain complete lifecycle capability for Receipt Management, covering Receipt Upload, Camera Capture, OCR, Bill Scanner, Receipt Extraction, Receipt Matching, Duplicate Detection, Missing Receipt Declaration, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Receipt Upload, Camera Capture, OCR, Bill Scanner, Receipt Extraction, Receipt Matching, Duplicate Detection, Missing Receipt Declaration, Receipt Verification, Receipt Archive, Receipt Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Receipt Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.5 Advances

**SR-13.5-01:** The platform shall maintain complete lifecycle capability for Advances, covering Travel Advance, Expense Advance, Salary Advance, Emergency Advance, Advance Request, Advance Approval, Advance Payment, Advance Settlement, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Travel Advance, Expense Advance, Salary Advance, Emergency Advance, Advance Request, Advance Approval, Advance Payment, Advance Settlement, Advance Recovery, Advance Balance, Advance History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Advances according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.6 Corporate Cards

**SR-13.6-01:** The platform shall maintain complete lifecycle capability for Corporate Cards, covering Card Assignment, Card Limit, Card Transactions, Transaction Import, Transaction Matching, Card Reconciliation, Personal Expense, Missing Receipt, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Card Assignment, Card Limit, Card Transactions, Transaction Import, Transaction Matching, Card Reconciliation, Personal Expense, Missing Receipt, Card Suspension, Card Return, Card Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Corporate Cards according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.7 Mileage and Per Diem

**SR-13.7-01:** The platform shall maintain complete lifecycle capability for Mileage and Per Diem, covering Mileage Claim, Vehicle Type, Distance, Mileage Rate, Route, Per Diem, Meal Allowance, Country Rate, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Mileage Claim, Vehicle Type, Distance, Mileage Rate, Route, Per Diem, Meal Allowance, Country Rate, City Rate, Partial-Day Rate, Mileage Verification.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Mileage and Per Diem according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.8 Expense Approval

**SR-13.8-01:** The platform shall support configurable workflows for Expense Approval, including Manager Approval, Finance Approval, Budget Approval, Project Approval, Client Approval, Conditional Approval, Escalation, Rejection, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Manager Approval, Finance Approval, Budget Approval, Project Approval, Client Approval, Conditional Approval, Escalation, Rejection, Resubmission, Approval History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Expense Approval according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.9 Expense Settlement

**SR-13.9-01:** The platform shall maintain complete lifecycle capability for Expense Settlement, covering Approved Amount, Rejected Amount, Employee Reimbursement, Payroll Reimbursement, Bank Reimbursement, Vendor Payment, Settlement Batch, Settlement Status, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Approved Amount, Rejected Amount, Employee Reimbursement, Payroll Reimbursement, Bank Reimbursement, Vendor Payment, Settlement Batch, Settlement Status, Settlement Reconciliation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Expense Settlement according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.10 Expense Audit

**SR-13.10-01:** The platform shall maintain complete lifecycle capability for Expense Audit, covering Policy Violation, Duplicate Expense, Suspicious Receipt, Excess Amount, Split Expense, Weekend Expense, Personal Expense, Fraud Detection, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Policy Violation, Duplicate Expense, Suspicious Receipt, Excess Amount, Split Expense, Weekend Expense, Personal Expense, Fraud Detection, Audit Review, Audit Closure, Audit History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Expense Audit according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.11 Finance Integration

**SR-13.11-01:** The platform shall expose governed integration capabilities for Finance Integration, covering Accounts Payable, General Ledger, Cost Center Posting, Project Posting, Client Billing, Tax Posting, Payment File, Reconciliation, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Accounts Payable, General Ledger, Cost Center Posting, Project Posting, Client Billing, Tax Posting, Payment File, Reconciliation, Posting Status, Posting Reversal.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Finance Integration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Finance and Statutory Configuration, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 13.12 Expense Analytics

**SR-13.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Expense Analytics, covering Expense by Category, Expense by Department, Expense by Employee, Expense by Location, Expense by Project, Policy Violations, Approval Time, Reimbursement Time and related insights.

Coverage: Expense by Category, Expense by Department, Expense by Employee, Expense by Location, Expense by Project, Policy Violations, Approval Time, Reimbursement Time, Expense Trend, Expense Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Expense Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 14: Travel and Global Mobility

**Objective:** Domain 14 establishes the platform capabilities for Travel and Global Mobility. It coordinates Travel Request, Travel Policy and Approval, Booking, Itinerary and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 14.1 | Workflow | 12 | Finance and Statutory Configuration, Workflow Engine |
| 14.2 | Workflow | 11 | Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 14.3 | Operational | 12 | Finance and Statutory Configuration |
| 14.4 | Operational | 9 | Finance and Statutory Configuration |
| 14.5 | Operational | 10 | Finance and Statutory Configuration, Workflow Engine, Document Management |
| 14.6 | Operational | 9 | Organization Foundation, Finance and Statutory Configuration |
| 14.7 | Operational | 9 | Finance and Statutory Configuration, Workflow Engine |
| 14.8 | Operational | 8 | Finance and Statutory Configuration, Workflow Engine, Integration Platform |
| 14.9 | Operational | 10 | Finance and Statutory Configuration |
| 14.10 | Operational | 9 | Organization Foundation, Finance and Statutory Configuration, Workflow Engine |
| 14.11 | Operational | 10 | Finance and Statutory Configuration, Workflow Engine |
| 14.12 | Insight | 10 | Organization Foundation, Finance and Statutory Configuration, Document Management |

#### 14.1 Travel Request

**SR-14.1-01:** The platform shall maintain complete lifecycle capability for Travel Request, covering Domestic Travel, International Travel, One-Way Travel, Round Trip, Multi-City Travel, Business Purpose, Travel Dates, Destination, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Domestic Travel, International Travel, One-Way Travel, Round Trip, Multi-City Travel, Business Purpose, Travel Dates, Destination, Estimated Cost, Travel Companion, Client Visit, Project Travel.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Travel Request according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.2 Travel Policy and Approval

**SR-14.2-01:** The platform shall support configurable workflows for Travel Policy and Approval, including Travel Class, Hotel Limit, Daily Allowance, Advance Eligibility, Budget Validation, Manager Approval, Finance Approval, Travel Desk Approval, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Travel Class, Hotel Limit, Daily Allowance, Advance Eligibility, Budget Validation, Manager Approval, Finance Approval, Travel Desk Approval, Executive Approval, Policy Exception, Approval History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Travel Policy and Approval according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.3 Booking

**SR-14.3-01:** The platform shall maintain complete lifecycle capability for Booking, covering Flight, Hotel, Train, Bus, Cab, Rental Car, Travel Agent, Self-Booking, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Flight, Hotel, Train, Bus, Cab, Rental Car, Travel Agent, Self-Booking, Booking Confirmation, Booking Change, Booking Cancellation, Refund Tracking.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Booking according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.4 Itinerary

**SR-14.4-01:** The platform shall maintain complete lifecycle capability for Itinerary, covering Travel Itinerary, Booking Details, Confirmation Numbers, Meeting Schedule, Local Transport, Emergency Contacts, Itinerary Sharing, Calendar Sync, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Travel Itinerary, Booking Details, Confirmation Numbers, Meeting Schedule, Local Transport, Emergency Contacts, Itinerary Sharing, Calendar Sync, Mobile Itinerary.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Itinerary according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.5 International Travel

**SR-14.5-01:** The platform shall maintain complete lifecycle capability for International Travel, covering Passport Validation, Visa Request, Visa Tracking, Forex Request, Travel Insurance, Vaccination Requirements, International Allowance, Country Advisory, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Passport Validation, Visa Request, Visa Tracking, Forex Request, Travel Insurance, Vaccination Requirements, International Allowance, Country Advisory, Embassy Information, Immigration Documents.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for International Travel according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.6 Duty of Care

**SR-14.6-01:** The platform shall maintain complete lifecycle capability for Duty of Care, covering Traveler Tracking, Emergency Alerts, Risk Locations, Travel Advisory, Check-In, Emergency Assistance, Crisis Communication, Traveler Safety Status, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Traveler Tracking, Emergency Alerts, Risk Locations, Travel Advisory, Check-In, Emergency Assistance, Crisis Communication, Traveler Safety Status, Emergency Escalation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Duty of Care according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.7 Travel Desk

**SR-14.7-01:** The platform shall maintain complete lifecycle capability for Travel Desk, covering Travel Queue, Agent Assignment, Booking Support, Rebooking, Cancellation, Vendor Coordination, Traveler Communication, Travel SLA, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Travel Queue, Agent Assignment, Booking Support, Rebooking, Cancellation, Vendor Coordination, Traveler Communication, Travel SLA, Travel Case History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Travel Desk according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.8 Travel Settlement

**SR-14.8-01:** The platform shall maintain complete lifecycle capability for Travel Settlement, covering Travel Expense Import, Advance Adjustment, Expense Claim Link, Unused Advance, Settlement, Approval, Reconciliation, Closure, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Travel Expense Import, Advance Adjustment, Expense Claim Link, Unused Advance, Settlement, Approval, Reconciliation, Closure.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Travel Settlement according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.9 Global Assignment

**SR-14.9-01:** The platform shall maintain complete lifecycle capability for Global Assignment, covering Short-Term Assignment, Long-Term Assignment, International Transfer, Host Country, Home Country, Assignment Package, Assignment Allowances, Assignment Start, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Short-Term Assignment, Long-Term Assignment, International Transfer, Host Country, Home Country, Assignment Package, Assignment Allowances, Assignment Start, Assignment End, Repatriation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Global Assignment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.10 Relocation

**SR-14.10-01:** The platform shall maintain complete lifecycle capability for Relocation, covering Relocation Request, Relocation Package, Moving Expense, Temporary Housing, Family Relocation, School Support, Relocation Vendor, Relocation Settlement, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Relocation Request, Relocation Package, Moving Expense, Temporary Housing, Family Relocation, School Support, Relocation Vendor, Relocation Settlement, Relocation Status.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Relocation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.11 Immigration and Tax Support

**SR-14.11-01:** The platform shall manage compliant financial and compensation processes for Immigration and Tax Support, including Work Permit, Immigration Case, Visa Renewal, Tax Equalization, Tax Protection, Shadow Payroll, Country Tax Consultation, Immigration Provider, validations, calculations, approvals, and reports.

Coverage: Work Permit, Immigration Case, Visa Renewal, Tax Equalization, Tax Protection, Shadow Payroll, Country Tax Consultation, Immigration Provider, Case Tracking, Compliance Alerts.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Immigration and Tax Support according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 14.12 Travel Analytics

**SR-14.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Travel Analytics, covering Travel Cost, Travel by Department, Travel by Location, Policy Compliance, Booking Savings, Vendor Performance, Traveler Risk, International Assignment Cost and related insights.

Coverage: Travel Cost, Travel by Department, Travel by Location, Policy Compliance, Booking Savings, Vendor Performance, Traveler Risk, International Assignment Cost, Carbon Reporting, Travel Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Travel Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 15: Performance and Goals

**Objective:** Domain 15 establishes the platform capabilities for Performance and Goals. It coordinates Performance Cycle, Goals, Goal Alignment, Check-Ins and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 15.1 | Operational | 11 | Worker Master, Workflow Engine |
| 15.2 | Operational | 12 | Organization Foundation |
| 15.3 | Operational | 9 | Workflow Engine |
| 15.4 | Operational | 9 | Worker Master |
| 15.5 | Operational | 10 | Worker Master |
| 15.6 | Operational | 10 | Workflow Engine |
| 15.7 | Operational | 9 | Platform Foundation |
| 15.8 | Operational | 9 | Workflow Engine |
| 15.9 | Operational | 10 | Worker Master |
| 15.10 | Operational | 8 | Worker Master |
| 15.11 | Operational | 8 | Document Management |
| 15.12 | Insight | 10 | Worker Master, Organization Foundation |

#### 15.1 Performance Cycle

**SR-15.1-01:** The platform shall maintain complete lifecycle capability for Performance Cycle, covering Cycle Setup, Review Period, Eligible Employees, Review Template, Rating Scale, Workflow, Review Launch, Review Progress, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Cycle Setup, Review Period, Eligible Employees, Review Template, Rating Scale, Workflow, Review Launch, Review Progress, Reminders, Review Closure, Cycle History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Performance Cycle according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.2 Goals

**SR-15.2-01:** The platform shall maintain complete lifecycle capability for Goals, covering Individual Goals, Team Goals, Department Goals, Company Goals, KPI, KRA, OKR, Goal Weight, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Individual Goals, Team Goals, Department Goals, Company Goals, KPI, KRA, OKR, Goal Weight, Goal Target, Goal Milestones, Goal Status, Goal Evidence.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Goals according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.3 Goal Alignment

**SR-15.3-01:** The platform shall maintain complete lifecycle capability for Goal Alignment, covering Goal Cascading, Parent Goal, Child Goal, Shared Goal, Goal Dependency, Strategic Alignment, Goal Approval, Goal Revision, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Goal Cascading, Parent Goal, Child Goal, Shared Goal, Goal Dependency, Strategic Alignment, Goal Approval, Goal Revision, Goal History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Goal Alignment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.4 Check-Ins

**SR-15.4-01:** The platform shall maintain complete lifecycle capability for Check-Ins, covering One-on-One, Progress Check, Manager Notes, Employee Notes, Blockers, Support Required, Follow-Up Actions, Check-In History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: One-on-One, Progress Check, Manager Notes, Employee Notes, Blockers, Support Required, Follow-Up Actions, Check-In History, Check-In Reminder.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Check-Ins according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.5 Reviews

**SR-15.5-01:** The platform shall maintain complete lifecycle capability for Reviews, covering Self Review, Manager Review, Skip-Level Review, Peer Review, Project Review, Customer Review, HR Review, Executive Review, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Self Review, Manager Review, Skip-Level Review, Peer Review, Project Review, Customer Review, HR Review, Executive Review, Review Comments, Review History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Reviews according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.6 Feedback

**SR-15.6-01:** The platform shall maintain complete lifecycle capability for Feedback, covering Continuous Feedback, Requested Feedback, Unsolicited Feedback, Anonymous Feedback, Peer Feedback, 360 Feedback, Feedback Questions, Feedback Summary, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Continuous Feedback, Requested Feedback, Unsolicited Feedback, Anonymous Feedback, Peer Feedback, 360 Feedback, Feedback Questions, Feedback Summary, Feedback Privacy, Feedback History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Feedback according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.7 Competency Assessment

**SR-15.7-01:** The platform shall maintain complete lifecycle capability for Competency Assessment, covering Core Competencies, Functional Competencies, Leadership Competencies, Behavioral Competencies, Competency Rating, Competency Gap, Competency Comments, Competency Evidence, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Core Competencies, Functional Competencies, Leadership Competencies, Behavioral Competencies, Competency Rating, Competency Gap, Competency Comments, Competency Evidence, Competency History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Competency Assessment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.8 Ratings and Calibration

**SR-15.8-01:** The platform shall maintain complete lifecycle capability for Ratings and Calibration, covering Rating Calculation, Rating Distribution, Calibration Meeting, Calibration Grid, Forced Distribution, Rating Adjustment, Calibration Approval, Final Rating, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Rating Calculation, Rating Distribution, Calibration Meeting, Calibration Grid, Forced Distribution, Rating Adjustment, Calibration Approval, Final Rating, Calibration History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Ratings and Calibration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.9 Performance Improvement

**SR-15.9-01:** The platform shall maintain complete lifecycle capability for Performance Improvement, covering Performance Improvement Plan, Improvement Goals, Improvement Period, Checkpoints, Manager Review, HR Review, Employee Acknowledgment, Outcome, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Performance Improvement Plan, Improvement Goals, Improvement Period, Checkpoints, Manager Review, HR Review, Employee Acknowledgment, Outcome, Extension, Closure.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Performance Improvement according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.10 Review Appeals

**SR-15.10-01:** The platform shall maintain complete lifecycle capability for Review Appeals, covering Employee Appeal, Rating Dispute, Supporting Evidence, Manager Response, HR Review, Appeal Decision, Rating Revision, Appeal History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Appeal, Rating Dispute, Supporting Evidence, Manager Response, HR Review, Appeal Decision, Rating Revision, Appeal History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Review Appeals according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.11 Performance Outcomes

**SR-15.11-01:** The platform shall maintain complete lifecycle capability for Performance Outcomes, covering Promotion Recommendation, Merit Recommendation, Bonus Recommendation, Development Recommendation, Training Recommendation, Succession Recommendation, Retention Action, Performance Letter, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Promotion Recommendation, Merit Recommendation, Bonus Recommendation, Development Recommendation, Training Recommendation, Succession Recommendation, Retention Action, Performance Letter.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Performance Outcomes according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 15.12 Performance Analytics

**SR-15.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Performance Analytics, covering Rating Distribution, Goal Completion, High Performers, Low Performers, Performance Trend, Manager Rating Bias, Department Performance, Calibration Variance and related insights.

Coverage: Rating Distribution, Goal Completion, High Performers, Low Performers, Performance Trend, Manager Rating Bias, Department Performance, Calibration Variance, Review Completion, Performance Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Performance Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 16: Talent, Succession and Career

**Objective:** Domain 16 establishes the platform capabilities for Talent, Succession and Career. It coordinates Talent Profile, Talent Review, Nine-Box Grid, Succession Planning and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 16.1 | Operational | 10 | Platform Foundation |
| 16.2 | Operational | 8 | Worker Master, Workflow Engine |
| 16.3 | Operational | 8 | Platform Foundation |
| 16.4 | Operational | 11 | Organization Foundation |
| 16.5 | Operational | 10 | Platform Foundation |
| 16.6 | Operational | 9 | Organization Foundation |
| 16.7 | Operational | 10 | Worker Master |
| 16.8 | Operational | 10 | Platform Foundation |
| 16.9 | Operational | 9 | Worker Master, Organization Foundation, Workflow Engine |
| 16.10 | Operational | 10 | Worker Master |
| 16.11 | Operational | 9 | Organization Foundation |
| 16.12 | Insight | 9 | Identity and RBAC |

#### 16.1 Talent Profile

**SR-16.1-01:** The platform shall maintain complete lifecycle capability for Talent Profile, covering Career Interests, Mobility Preference, Skills, Experience, Potential Rating, Performance History, Readiness, Career Aspiration, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Career Interests, Mobility Preference, Skills, Experience, Potential Rating, Performance History, Readiness, Career Aspiration, Talent Summary, Talent Tags.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Talent Profile according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.2 Talent Review

**SR-16.2-01:** The platform shall maintain complete lifecycle capability for Talent Review, covering Talent Review Cycle, Manager Assessment, HR Assessment, Talent Discussion, Talent Actions, Review Notes, Review Approval, Review History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Talent Review Cycle, Manager Assessment, HR Assessment, Talent Discussion, Talent Actions, Review Notes, Review Approval, Review History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Talent Review according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.3 Nine-Box Grid

**SR-16.3-01:** The platform shall maintain complete lifecycle capability for Nine-Box Grid, covering Performance Axis, Potential Axis, Nine-Box Placement, Calibration, Movement History, Talent Segments, Action Plans, Nine-Box Analytics, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Performance Axis, Potential Axis, Nine-Box Placement, Calibration, Movement History, Talent Segments, Action Plans, Nine-Box Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Nine-Box Grid according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.4 Succession Planning

**SR-16.4-01:** The platform shall maintain complete lifecycle capability for Succession Planning, covering Critical Positions, Successor Nomination, Successor Ranking, Readiness, Emergency Successor, Short-Term Successor, Long-Term Successor, Succession Gap, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Critical Positions, Successor Nomination, Successor Ranking, Readiness, Emergency Successor, Short-Term Successor, Long-Term Successor, Succession Gap, Succession Coverage, Succession Plan, Succession Review.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Succession Planning according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.5 Talent Pools

**SR-16.5-01:** The platform shall maintain complete lifecycle capability for Talent Pools, covering High Potential Pool, Leadership Pool, Technical Talent Pool, Diversity Talent Pool, Emerging Talent, Critical Skill Pool, Pool Eligibility, Pool Membership, role-based operations, validation, status changes, reporting, and audit history.

Coverage: High Potential Pool, Leadership Pool, Technical Talent Pool, Diversity Talent Pool, Emerging Talent, Critical Skill Pool, Pool Eligibility, Pool Membership, Pool Development, Pool History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Talent Pools according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.6 Career Paths

**SR-16.6-01:** The platform shall maintain complete lifecycle capability for Career Paths, covering Job Career Path, Leadership Path, Technical Path, Lateral Path, Career Steps, Required Skills, Required Experience, Career Readiness, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Job Career Path, Leadership Path, Technical Path, Lateral Path, Career Steps, Required Skills, Required Experience, Career Readiness, Career Path Visualization.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Career Paths according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.7 Individual Development Plan

**SR-16.7-01:** The platform shall maintain complete lifecycle capability for Individual Development Plan, covering Development Goals, Learning Actions, Experience Actions, Coaching Actions, Stretch Assignments, Target Dates, Progress, Manager Review, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Development Goals, Learning Actions, Experience Actions, Coaching Actions, Stretch Assignments, Target Dates, Progress, Manager Review, HR Review, Development History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Individual Development Plan according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.8 Mentoring and Coaching

**SR-16.8-01:** The platform shall maintain complete lifecycle capability for Mentoring and Coaching, covering Mentor Profile, Mentee Profile, Mentor Matching, Coaching Assignment, Session Scheduling, Session Notes, Goals, Feedback, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Mentor Profile, Mentee Profile, Mentor Matching, Coaching Assignment, Session Scheduling, Session Notes, Goals, Feedback, Program Closure, Mentoring Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Mentoring and Coaching according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.9 Internal Mobility

**SR-16.9-01:** The platform shall maintain complete lifecycle capability for Internal Mobility, covering Internal Job Marketplace, Internal Applications, Gig Opportunities, Project Opportunities, Short-Term Assignments, Talent Matching, Manager Release, Mobility Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Internal Job Marketplace, Internal Applications, Gig Opportunities, Project Opportunities, Short-Term Assignments, Talent Matching, Manager Release, Mobility Approval, Mobility History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Internal Mobility according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.10 Retention Management

**SR-16.10-01:** The platform shall maintain complete lifecycle capability for Retention Management, covering Retention Risk, Critical Employee, Flight Risk, Retention Plan, Retention Bonus, Career Action, Compensation Action, Manager Action, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Retention Risk, Critical Employee, Flight Risk, Retention Plan, Retention Bonus, Career Action, Compensation Action, Manager Action, Retention Review, Retention History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Retention Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.11 Career Development

**SR-16.11-01:** The platform shall maintain complete lifecycle capability for Career Development, covering Career Advisor, Skill Gap Analysis, Career Recommendations, Development Opportunities, Job Recommendations, Mentor Recommendations, Career Readiness, Career Progress, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Career Advisor, Skill Gap Analysis, Career Recommendations, Development Opportunities, Job Recommendations, Mentor Recommendations, Career Readiness, Career Progress, Career History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Career Development according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 16.12 Talent Analytics

**SR-16.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Talent Analytics, covering Succession Coverage, Bench Strength, High Potential Distribution, Talent Movement, Retention Risk, Career Mobility, Readiness, Talent Diversity and related insights.

Coverage: Succession Coverage, Bench Strength, High Potential Distribution, Talent Movement, Retention Risk, Career Mobility, Readiness, Talent Diversity, Critical Role Coverage.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Talent Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 17: Learning and Skills

**Objective:** Domain 17 establishes the platform capabilities for Learning and Skills. It coordinates Learning Management, Course Catalog, Learning Content, Learning Paths and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 17.1 | Operational | 8 | Document Management |
| 17.2 | Operational | 11 | Platform Foundation |
| 17.3 | Operational | 11 | Workflow Engine, Document Management, Integration Platform |
| 17.4 | Operational | 10 | Organization Foundation, Identity and RBAC |
| 17.5 | Operational | 10 | Worker Master, Workflow Engine |
| 17.6 | Operational | 11 | Platform Foundation |
| 17.7 | Operational | 10 | Platform Foundation |
| 17.8 | Operational | 10 | Document Management |
| 17.9 | Operational | 10 | Identity and RBAC, Document Management |
| 17.10 | Operational | 10 | Finance and Statutory Configuration |
| 17.11 | Operational | 10 | Worker Master, Organization Foundation |
| 17.12 | Operational | 10 | Organization Foundation, Identity and RBAC |
| 17.13 | Operational | 8 | Worker Master, Identity and RBAC |
| 17.14 | Operational | 9 | Integration Platform |
| 17.15 | Insight | 10 | Platform Foundation |

#### 17.1 Learning Management

**SR-17.1-01:** The platform shall maintain complete lifecycle capability for Learning Management, covering LMS Configuration, Learning Administrator, Learning Audience, Learning Calendar, Learning Policy, Learning Credits, Learning History, Learning Dashboard, role-based operations, validation, status changes, reporting, and audit history.

Coverage: LMS Configuration, Learning Administrator, Learning Audience, Learning Calendar, Learning Policy, Learning Credits, Learning History, Learning Dashboard.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Learning Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.2 Course Catalog

**SR-17.2-01:** The platform shall maintain complete lifecycle capability for Course Catalog, covering Course, Course Category, Course Description, Prerequisites, Duration, Learning Format, Language, Difficulty, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Course, Course Category, Course Description, Prerequisites, Duration, Learning Format, Language, Difficulty, Course Owner, Course Status, Course Rating.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Course Catalog according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.3 Learning Content

**SR-17.3-01:** The platform shall maintain complete lifecycle capability for Learning Content, covering Video, Document, Presentation, SCORM, xAPI, Audio, Interactive Content, External Link, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Video, Document, Presentation, SCORM, xAPI, Audio, Interactive Content, External Link, Live Content, Content Versioning, Content Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Learning Content according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Document Management, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.4 Learning Paths

**SR-17.4-01:** The platform shall maintain complete lifecycle capability for Learning Paths, covering Learning Path, Required Courses, Optional Courses, Sequence, Completion Rules, Role-Based Paths, Job-Based Paths, Career Paths, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Learning Path, Required Courses, Optional Courses, Sequence, Completion Rules, Role-Based Paths, Job-Based Paths, Career Paths, Compliance Paths, Skill Paths.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Learning Paths according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.5 Enrollment

**SR-17.5-01:** The platform shall maintain complete lifecycle capability for Enrollment, covering Self Enrollment, Manager Enrollment, HR Enrollment, Automatic Enrollment, Bulk Enrollment, Waitlist, Approval, Cancellation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Self Enrollment, Manager Enrollment, HR Enrollment, Automatic Enrollment, Bulk Enrollment, Waitlist, Approval, Cancellation, Re-Enrollment, Enrollment History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Enrollment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.6 Training Sessions

**SR-17.6-01:** The platform shall provide governed intelligent assistance for Training Sessions, covering Classroom Training, Virtual Training, Webinar, Workshop, Conference, Session Schedule, Trainer, Venue, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Classroom Training, Virtual Training, Webinar, Workshop, Conference, Session Schedule, Trainer, Venue, Capacity, Attendance, Session Feedback.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Training Sessions according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.7 Assessments

**SR-17.7-01:** The platform shall maintain complete lifecycle capability for Assessments, covering Quiz, Exam, Assignment, Practical Assessment, Question Bank, Passing Score, Attempts, Proctoring, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Quiz, Exam, Assignment, Practical Assessment, Question Bank, Passing Score, Attempts, Proctoring, Assessment Result, Assessment Review.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Assessments according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.8 Certifications

**SR-17.8-01:** The platform shall maintain complete lifecycle capability for Certifications, covering Certification, Certification Provider, Certification Exam, Issue Date, Expiry Date, Renewal, Verification, Certification Alerts, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Certification, Certification Provider, Certification Exam, Issue Date, Expiry Date, Renewal, Verification, Certification Alerts, Certification History, Certification Documents.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Certifications according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.9 Compliance Training

**SR-17.9-01:** The platform shall provide governed intelligent assistance for Compliance Training, covering Mandatory Training, Regulatory Training, Safety Training, Policy Training, Anti-Harassment Training, Data Privacy Training, Security Training, Completion Deadline, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Mandatory Training, Regulatory Training, Safety Training, Policy Training, Anti-Harassment Training, Data Privacy Training, Security Training, Completion Deadline, Escalation, Compliance Report.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compliance Training according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Identity and RBAC, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.10 Skills Taxonomy

**SR-17.10-01:** The platform shall manage compliant financial and compensation processes for Skills Taxonomy, including Skill Categories, Skills, Skill Definitions, Skill Levels, Skill Relationships, Related Skills, Emerging Skills, Deprecated Skills, validations, calculations, approvals, and reports.

Coverage: Skill Categories, Skills, Skill Definitions, Skill Levels, Skill Relationships, Related Skills, Emerging Skills, Deprecated Skills, Skill Ownership, Skill Versioning.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Skills Taxonomy according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.11 Skills Profile and Matrix

**SR-17.11-01:** The platform shall maintain complete lifecycle capability for Skills Profile and Matrix, covering Employee Skills, Self-Rating, Manager Rating, Verified Skill, Skill Experience, Skill Evidence, Team Skill Matrix, Department Skill Matrix, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Skills, Self-Rating, Manager Rating, Verified Skill, Skill Experience, Skill Evidence, Team Skill Matrix, Department Skill Matrix, Organization Skill Matrix, Skill History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Skills Profile and Matrix according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.12 Skill Gap Analysis

**SR-17.12-01:** The platform shall maintain complete lifecycle capability for Skill Gap Analysis, covering Current Skills, Required Skills, Job Gap, Position Gap, Role Gap, Team Gap, Department Gap, Organization Gap, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Current Skills, Required Skills, Job Gap, Position Gap, Role Gap, Team Gap, Department Gap, Organization Gap, Critical Skill Gap, Development Recommendations.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Skill Gap Analysis according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.13 Learning Recommendations

**SR-17.13-01:** The platform shall maintain complete lifecycle capability for Learning Recommendations, covering Role-Based Recommendation, Skill-Based Recommendation, Career-Based Recommendation, Performance-Based Recommendation, AI Recommendation, Manager Recommendation, HR Recommendation, Recommended Learning Path, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Role-Based Recommendation, Skill-Based Recommendation, Career-Based Recommendation, Performance-Based Recommendation, AI Recommendation, Manager Recommendation, HR Recommendation, Recommended Learning Path.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Learning Recommendations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.14 External Learning Providers

**SR-17.14-01:** The platform shall maintain complete lifecycle capability for External Learning Providers, covering Learning Vendor, External Course, Provider Integration, Course Import, Completion Import, Certification Import, Vendor Invoice, Vendor Performance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Learning Vendor, External Course, Provider Integration, Course Import, Completion Import, Certification Import, Vendor Invoice, Vendor Performance, Vendor Compliance.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for External Learning Providers according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 17.15 Learning Analytics

**SR-17.15-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Learning Analytics, covering Enrollment, Completion, Pass Rate, Training Hours, Training Cost, Compliance Completion, Skill Improvement, Learning Effectiveness and related insights.

Coverage: Enrollment, Completion, Pass Rate, Training Hours, Training Cost, Compliance Completion, Skill Improvement, Learning Effectiveness, Provider Performance, Learning Satisfaction.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Learning Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 18: Employee Services and Helpdesk

**Objective:** Domain 18 establishes the platform capabilities for Employee Services and Helpdesk. It coordinates Service Catalog, Ticket Management, Department Queues, Case Management and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 18.1 | Operational | 12 | Worker Master, Identity and RBAC, Finance and Statutory Configuration |
| 18.2 | Operational | 14 | Worker Master, Workflow Engine |
| 18.3 | Operational | 10 | Worker Master, Organization Foundation, Identity and RBAC, Finance and Statutory Configuration |
| 18.4 | Workflow | 12 | Worker Master, Workflow Engine, Document Management |
| 18.5 | Operational | 11 | Worker Master |
| 18.6 | Operational | 11 | Worker Master, Workflow Engine |
| 18.7 | Workflow | 13 | Worker Master, Identity and RBAC, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 18.8 | Operational | 12 | Worker Master, Finance and Statutory Configuration, Workflow Engine |
| 18.9 | Operational | 10 | Worker Master, Finance and Statutory Configuration |
| 18.10 | Operational | 8 | Worker Master |
| 18.11 | Operational | 9 | Worker Master, Workflow Engine |

#### 18.1 Service Catalog

**SR-18.1-01:** The platform shall maintain complete lifecycle capability for Service Catalog, covering HR Services, IT Services, Finance Services, Admin Services, Facility Services, Payroll Services, Benefits Services, Travel Services, role-based operations, validation, status changes, reporting, and audit history.

Coverage: HR Services, IT Services, Finance Services, Admin Services, Facility Services, Payroll Services, Benefits Services, Travel Services, Security Services, Legal Services, Service Eligibility, Service SLA.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Service Catalog according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.2 Ticket Management

**SR-18.2-01:** The platform shall maintain complete lifecycle capability for Ticket Management, covering Create Ticket, Ticket Category, Ticket Subcategory, Ticket Priority, Ticket Assignment, Ticket Reassignment, Ticket Status, Ticket Comments, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Create Ticket, Ticket Category, Ticket Subcategory, Ticket Priority, Ticket Assignment, Ticket Reassignment, Ticket Status, Ticket Comments, Attachments, Internal Notes, Resolution, Closure, Reopen, Ticket History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Ticket Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.3 Department Queues

**SR-18.3-01:** The platform shall maintain complete lifecycle capability for Department Queues, covering HR Queue, IT Queue, Finance Queue, Payroll Queue, Admin Queue, Facility Queue, Security Queue, Legal Queue, role-based operations, validation, status changes, reporting, and audit history.

Coverage: HR Queue, IT Queue, Finance Queue, Payroll Queue, Admin Queue, Facility Queue, Security Queue, Legal Queue, Benefits Queue, Travel Queue.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Department Queues according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.4 Case Management

**SR-18.4-01:** The platform shall maintain complete lifecycle capability for Case Management, covering Employee Case, HR Case, Confidential Case, Case Category, Case Owner, Case Participants, Case Tasks, Case Notes, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Case, HR Case, Confidential Case, Case Category, Case Owner, Case Participants, Case Tasks, Case Notes, Case Documents, Case Timeline, Case Resolution, Case Closure.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Case Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.5 SLA and Escalation

**SR-18.5-01:** The platform shall maintain complete lifecycle capability for SLA and Escalation, covering Response SLA, Resolution SLA, SLA Timer, SLA Pause, SLA Resume, SLA Breach, Escalation, Reassignment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Response SLA, Resolution SLA, SLA Timer, SLA Pause, SLA Resume, SLA Breach, Escalation, Reassignment, Priority Upgrade, SLA Reports, SLA History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for SLA and Escalation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.6 Knowledge Base

**SR-18.6-01:** The platform shall maintain complete lifecycle capability for Knowledge Base, covering Articles, FAQs, Policies, Procedures, Troubleshooting, How-To Guides, Article Categories, Article Search, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Articles, FAQs, Policies, Procedures, Troubleshooting, How-To Guides, Article Categories, Article Search, Article Rating, Article Versioning, Article Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Knowledge Base according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.7 Employee Requests

**SR-18.7-01:** The platform shall maintain complete lifecycle capability for Employee Requests, covering Employment Letter, Salary Certificate, Experience Certificate, Address Proof, Visa Letter, Bank Letter, ID Card Request, Business Card Request, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employment Letter, Salary Certificate, Experience Certificate, Address Proof, Visa Letter, Bank Letter, ID Card Request, Business Card Request, Access Request, Document Request, Certificate Request, General HR Request, Request Tracking.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Requests according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC, Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.8 Employee Loans

**SR-18.8-01:** The platform shall maintain complete lifecycle capability for Employee Loans, covering Loan Types, Loan Eligibility, Loan Request, Loan Amount, Interest, Repayment Schedule, Approval, Payment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Loan Types, Loan Eligibility, Loan Request, Loan Amount, Interest, Repayment Schedule, Approval, Payment, Payroll Deduction, Early Settlement, Loan Closure, Loan History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Loans according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.9 Appointments and Queue

**SR-18.9-01:** The platform shall maintain complete lifecycle capability for Appointments and Queue, covering HR Appointment, Payroll Appointment, IT Appointment, Benefits Appointment, Appointment Calendar, Time Slot, Virtual Appointment, Walk-In Queue, role-based operations, validation, status changes, reporting, and audit history.

Coverage: HR Appointment, Payroll Appointment, IT Appointment, Benefits Appointment, Appointment Calendar, Time Slot, Virtual Appointment, Walk-In Queue, Token Management, Appointment History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Appointments and Queue according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.10 Service Satisfaction

**SR-18.10-01:** The platform shall maintain complete lifecycle capability for Service Satisfaction, covering Resolution Survey, Satisfaction Rating, Employee Feedback, Reopen Reason, Service Quality, Agent Rating, Service Satisfaction Analytics, Improvement Actions, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Resolution Survey, Satisfaction Rating, Employee Feedback, Reopen Reason, Service Quality, Agent Rating, Service Satisfaction Analytics, Improvement Actions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Service Satisfaction according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 18.11 Chatbot and Live Support

**SR-18.11-01:** The platform shall maintain complete lifecycle capability for Chatbot and Live Support, covering HR Chatbot, IT Chatbot, Suggested Articles, AI FAQ, Ticket Creation, Live Agent Transfer, Context Transfer, Conversation History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: HR Chatbot, IT Chatbot, Suggested Articles, AI FAQ, Ticket Creation, Live Agent Transfer, Context Transfer, Conversation History, Resolution Tracking.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Chatbot and Live Support according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 19: Assets, Inventory and Facilities

**Objective:** Domain 19 establishes the platform capabilities for Assets, Inventory and Facilities. It coordinates Asset Catalog, Asset Types, Inventory, Asset Request and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 19.1 | Operational | 11 | Document Management |
| 19.2 | Operational | 15 | Identity and RBAC |
| 19.3 | Operational | 11 | Organization Foundation |
| 19.4 | Workflow | 12 | Identity and RBAC, Workflow Engine |
| 19.5 | Operational | 10 | Worker Master, Organization Foundation |
| 19.6 | Operational | 9 | Workflow Engine |
| 19.7 | Operational | 10 | Organization Foundation, Workflow Engine |
| 19.8 | Operational | 9 | Platform Foundation |
| 19.9 | Control | 10 | Worker Master, Identity and RBAC |
| 19.10 | Operational | 12 | Workflow Engine |
| 19.11 | Operational | 10 | Platform Foundation |
| 19.12 | Operational | 9 | Workflow Engine |
| 19.13 | Operational | 10 | Platform Foundation |
| 19.14 | Integration | 9 | Identity and RBAC, Integration Platform |

#### 19.1 Asset Catalog

**SR-19.1-01:** The platform shall maintain complete lifecycle capability for Asset Catalog, covering Asset Categories, Asset Types, Asset Models, Manufacturers, Vendors, Asset Attributes, Asset Status, Asset Value, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Asset Categories, Asset Types, Asset Models, Manufacturers, Vendors, Asset Attributes, Asset Status, Asset Value, Depreciation, Warranty, Asset Documents.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Catalog according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.2 Asset Types

**SR-19.2-01:** The platform shall maintain complete lifecycle capability for Asset Types, covering Laptop, Desktop, Mobile, SIM, Monitor, Printer, Accessories, ID Card, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Laptop, Desktop, Mobile, SIM, Monitor, Printer, Accessories, ID Card, Access Card, Uniform, Vehicle, Furniture, Tools, RFID Assets, Software Licenses.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Types according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.3 Inventory

**SR-19.3-01:** The platform shall maintain complete lifecycle capability for Inventory, covering Asset Inventory, Stock Location, Available Assets, Assigned Assets, Reserved Assets, Damaged Assets, Lost Assets, Retired Assets, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Asset Inventory, Stock Location, Available Assets, Assigned Assets, Reserved Assets, Damaged Assets, Lost Assets, Retired Assets, Inventory Movement, Stock Transfer, Stock Adjustment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Inventory according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.4 Asset Request

**SR-19.4-01:** The platform shall maintain complete lifecycle capability for Asset Request, covering Laptop Request, Desktop Request, Mobile Request, SIM Request, Monitor Request, Accessory Request, Software Request, Vehicle Request, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Laptop Request, Desktop Request, Mobile Request, SIM Request, Monitor Request, Accessory Request, Software Request, Vehicle Request, Uniform Request, Approval, Fulfillment, Request History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Request according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.5 Asset Assignment

**SR-19.5-01:** The platform shall maintain complete lifecycle capability for Asset Assignment, covering Employee Assignment, Contractor Assignment, Department Assignment, Location Assignment, Assignment Date, Expected Return, Asset Condition, Employee Acceptance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Assignment, Contractor Assignment, Department Assignment, Location Assignment, Assignment Date, Expected Return, Asset Condition, Employee Acceptance, Assignment History, Reassignment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Assignment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.6 Asset Maintenance

**SR-19.6-01:** The platform shall provide governed intelligent assistance for Asset Maintenance, covering Maintenance Schedule, Repair Request, Service Vendor, Warranty, Maintenance Cost, Downtime, Repair Status, Replacement Asset, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Maintenance Schedule, Repair Request, Service Vendor, Warranty, Maintenance Cost, Downtime, Repair Status, Replacement Asset, Maintenance History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Maintenance according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.7 Asset Return and Recovery

**SR-19.7-01:** The platform shall maintain complete lifecycle capability for Asset Return and Recovery, covering Return Request, Return Checklist, Condition Check, Damage Assessment, Loss Assessment, Recovery Amount, Return Confirmation, Asset Reallocation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Return Request, Return Checklist, Condition Check, Damage Assessment, Loss Assessment, Recovery Amount, Return Confirmation, Asset Reallocation, Disposal, Return History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Return and Recovery according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.8 Software and Licenses

**SR-19.8-01:** The platform shall maintain complete lifecycle capability for Software and Licenses, covering Software Catalog, License Inventory, License Assignment, License Expiry, License Usage, License Renewal, License Recovery, License Compliance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Software Catalog, License Inventory, License Assignment, License Expiry, License Usage, License Renewal, License Recovery, License Compliance, License Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Software and Licenses according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.9 Identity and Access Cards

**SR-19.9-01:** The platform shall enforce secure, auditable controls for Identity and Access Cards, covering Employee ID Card, Visitor Card, Access Card, Card Printing, Card Assignment, Access Zone, Card Expiry, Card Blocking, policy evaluation, exception handling, and administrative review.

Coverage: Employee ID Card, Visitor Card, Access Card, Card Printing, Card Assignment, Access Zone, Card Expiry, Card Blocking, Card Replacement, Card Return.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Identity and Access Cards according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.10 Facilities

**SR-19.10-01:** The platform shall maintain complete lifecycle capability for Facilities, covering Office Space, Floor, Desk, Seating Plan, Meeting Rooms, Locker, Parking, Cafeteria, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Office Space, Floor, Desk, Seating Plan, Meeting Rooms, Locker, Parking, Cafeteria, Transportation, Facility Request, Facility Maintenance, Facility Booking.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Facilities according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.11 Fleet and Vehicles

**SR-19.11-01:** The platform shall maintain complete lifecycle capability for Fleet and Vehicles, covering Vehicle Master, Vehicle Assignment, Driver Assignment, Fuel, Maintenance, Insurance, Registration, Trip Log, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Vehicle Master, Vehicle Assignment, Driver Assignment, Fuel, Maintenance, Insurance, Registration, Trip Log, Vehicle Return, Vehicle Compliance.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Fleet and Vehicles according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.12 Consumables

**SR-19.12-01:** The platform shall maintain complete lifecycle capability for Consumables, covering Consumable Catalog, Stock, Request, Issue, Return, Reorder Level, Purchase Request, Consumption History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Consumable Catalog, Stock, Request, Issue, Return, Reorder Level, Purchase Request, Consumption History, Stock Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Consumables according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.13 Asset Audit

**SR-19.13-01:** The platform shall maintain complete lifecycle capability for Asset Audit, covering Physical Verification, Barcode Scan, QR Scan, RFID Scan, Audit Campaign, Missing Asset, Ownership Mismatch, Audit Adjustment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Physical Verification, Barcode Scan, QR Scan, RFID Scan, Audit Campaign, Missing Asset, Ownership Mismatch, Audit Adjustment, Audit Report, Audit History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Audit according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 19.14 Asset Integrations

**SR-19.14-01:** The platform shall expose governed integration capabilities for Asset Integrations, covering ITSM, Inventory Systems, Procurement, Finance, Depreciation, Access Control, Barcode Systems, RFID Systems, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: ITSM, Inventory Systems, Procurement, Finance, Depreciation, Access Control, Barcode Systems, RFID Systems, Vendor Systems.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Identity and RBAC, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 20: Employee Relations, Health, Safety and Compliance

**Objective:** Domain 20 establishes the platform capabilities for Employee Relations, Health, Safety and Compliance. It coordinates Employee Relations Cases, Grievances, Disciplinary Management, Investigation Management and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 20.1 | Workflow | 12 | Worker Master, Workflow Engine |
| 20.2 | Operational | 9 | Worker Master |
| 20.3 | Operational | 10 | Worker Master |
| 20.4 | Operational | 10 | Worker Master |
| 20.5 | Operational | 9 | Worker Master |
| 20.6 | Operational | 9 | Worker Master |
| 20.7 | Operational | 9 | Worker Master |
| 20.8 | Operational | 10 | Worker Master |
| 20.9 | Operational | 9 | Worker Master |
| 20.10 | Operational | 9 | Worker Master, Workflow Engine |
| 20.11 | Operational | 10 | Worker Master |
| 20.12 | Insight | 9 | Worker Master, Workflow Engine |

#### 20.1 Employee Relations Cases

**SR-20.1-01:** The platform shall maintain complete lifecycle capability for Employee Relations Cases, covering Case Intake, Confidential Case, Case Classification, Case Owner, Case Participants, Investigation, Evidence, Findings, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Case Intake, Confidential Case, Case Classification, Case Owner, Case Participants, Investigation, Evidence, Findings, Corrective Action, Resolution, Closure, Case History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Relations Cases according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.2 Grievances

**SR-20.2-01:** The platform shall maintain complete lifecycle capability for Grievances, covering Grievance Submission, Anonymous Grievance, Grievance Category, Grievance Review, Mediation, Appeal, Resolution, Grievance History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Grievance Submission, Anonymous Grievance, Grievance Category, Grievance Review, Mediation, Appeal, Resolution, Grievance History, Grievance Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Grievances according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.3 Disciplinary Management

**SR-20.3-01:** The platform shall maintain complete lifecycle capability for Disciplinary Management, covering Verbal Warning, Written Warning, Final Warning, Suspension, Disciplinary Hearing, Disciplinary Action, Appeal, Action Expiry, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Verbal Warning, Written Warning, Final Warning, Suspension, Disciplinary Hearing, Disciplinary Action, Appeal, Action Expiry, Employee Acknowledgment, Disciplinary History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Disciplinary Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.4 Investigation Management

**SR-20.4-01:** The platform shall maintain complete lifecycle capability for Investigation Management, covering Investigator Assignment, Investigation Plan, Interviews, Evidence, Witnesses, Findings, Recommendations, Legal Review, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Investigator Assignment, Investigation Plan, Interviews, Evidence, Witnesses, Findings, Recommendations, Legal Review, Investigation Closure, Investigation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Investigation Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.5 Ethics and Whistleblower

**SR-20.5-01:** The platform shall maintain complete lifecycle capability for Ethics and Whistleblower, covering Anonymous Reporting, Ethics Complaint, Fraud Report, Conflict of Interest, Retaliation Protection, Secure Communication, Investigation, Ethics Resolution, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Anonymous Reporting, Ethics Complaint, Fraud Report, Conflict of Interest, Retaliation Protection, Secure Communication, Investigation, Ethics Resolution, Ethics Reporting.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Ethics and Whistleblower according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.6 Harassment and Workplace Conduct

**SR-20.6-01:** The platform shall maintain complete lifecycle capability for Harassment and Workplace Conduct, covering Harassment Complaint, Discrimination Complaint, Workplace Bullying, Misconduct, Confidential Investigation, Protection Measures, Corrective Action, Resolution, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Harassment Complaint, Discrimination Complaint, Workplace Bullying, Misconduct, Confidential Investigation, Protection Measures, Corrective Action, Resolution, Reporting.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Harassment and Workplace Conduct according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.7 Labor Relations

**SR-20.7-01:** The platform shall maintain complete lifecycle capability for Labor Relations, covering Labor Union, Union Membership, Collective Agreement, Works Council, Union Consultation, Labor Dispute, Negotiation, Agreement Expiry, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Labor Union, Union Membership, Collective Agreement, Works Council, Union Consultation, Labor Dispute, Negotiation, Agreement Expiry, Labor Relations History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Labor Relations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.8 Health and Safety Incidents

**SR-20.8-01:** The platform shall maintain complete lifecycle capability for Health and Safety Incidents, covering Workplace Incident, Injury, Near Miss, Unsafe Condition, Incident Investigation, Root Cause, Corrective Action, Preventive Action, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Workplace Incident, Injury, Near Miss, Unsafe Condition, Incident Investigation, Root Cause, Corrective Action, Preventive Action, Regulatory Reporting, Incident Closure.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Health and Safety Incidents according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.9 Occupational Health

**SR-20.9-01:** The platform shall maintain complete lifecycle capability for Occupational Health, covering Medical Examination, Fitness Assessment, Health Surveillance, Vaccination, Medical Restriction, Occupational Disease, Health Clearance, Confidential Medical Records, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Medical Examination, Fitness Assessment, Health Surveillance, Vaccination, Medical Restriction, Occupational Disease, Health Clearance, Confidential Medical Records, Medical Alerts.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Occupational Health according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.10 Workplace Accommodation

**SR-20.10-01:** The platform shall maintain complete lifecycle capability for Workplace Accommodation, covering Disability Accommodation, Medical Accommodation, Flexible Work Accommodation, Workplace Modification, Equipment Accommodation, Accommodation Review, Approval, Renewal, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Disability Accommodation, Medical Accommodation, Flexible Work Accommodation, Workplace Modification, Equipment Accommodation, Accommodation Review, Approval, Renewal, Accommodation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workplace Accommodation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.11 Compliance Obligations

**SR-20.11-01:** The platform shall maintain complete lifecycle capability for Compliance Obligations, covering Labor Law Compliance, Working Time Compliance, Minimum Wage Compliance, Overtime Compliance, Leave Compliance, Employment Contract Compliance, Mandatory Training Compliance, Statutory Filing, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Labor Law Compliance, Working Time Compliance, Minimum Wage Compliance, Overtime Compliance, Leave Compliance, Employment Contract Compliance, Mandatory Training Compliance, Statutory Filing, Compliance Alerts, Compliance Calendar.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compliance Obligations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 20.12 Employee Relations Analytics

**SR-20.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Employee Relations Analytics, covering Case Volume, Case Category, Resolution Time, Grievance Trend, Disciplinary Trend, Safety Incidents, Compliance Violations, Recurring Issues and related insights.

Coverage: Case Volume, Case Category, Resolution Time, Grievance Trend, Disciplinary Trend, Safety Incidents, Compliance Violations, Recurring Issues, Case SLA.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee Relations Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 21: Separation, Exit Clearance and Full & Final Settlement

**Objective:** Domain 21 establishes the platform capabilities for Separation, Exit Clearance and Full & Final Settlement. It coordinates Separation Dashboard, Separation Initiation, Resignation, Retirement and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 21.1 | Insight | 9 | Worker Master |
| 21.2 | Operational | 9 | Worker Master, Workflow Engine, Document Management |
| 21.3 | Operational | 11 | Worker Master, Workflow Engine |
| 21.4 | Operational | 9 | Finance and Statutory Configuration, Workflow Engine, Document Management |
| 21.5 | Operational | 11 | Identity and RBAC, Workflow Engine, Document Management |
| 21.6 | Operational | 10 | Platform Foundation |
| 21.7 | Operational | 10 | Platform Foundation |
| 21.8 | Operational | 10 | Worker Master, Organization Foundation |
| 21.9 | Operational | 10 | Worker Master, Workflow Engine, Document Management |
| 21.10 | Operational | 12 | Worker Master, Organization Foundation, Identity and RBAC |
| 21.11 | Control | 14 | Identity and RBAC |
| 21.12 | Operational | 15 | Finance and Statutory Configuration |
| 21.13 | Workflow | 11 | Finance and Statutory Configuration, Workflow Engine |
| 21.14 | Operational | 10 | Finance and Statutory Configuration, Document Management |
| 21.15 | Operational | 10 | Identity and RBAC, Document Management |
| 21.16 | Insight | 11 | Platform Foundation |

#### 21.1 Separation Dashboard

**SR-21.1-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Separation Dashboard, covering Resignations, Notice Period Employees, Upcoming Exits, Pending Clearance, Pending Asset Return, Pending Full and Final, Completed Exits, Exit SLA and related insights.

Coverage: Resignations, Notice Period Employees, Upcoming Exits, Pending Clearance, Pending Asset Return, Pending Full and Final, Completed Exits, Exit SLA, Separation Alerts.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Separation Dashboard according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.2 Separation Initiation

**SR-21.2-01:** The platform shall maintain complete lifecycle capability for Separation Initiation, covering Employee-Initiated Separation, Manager-Initiated Separation, HR-Initiated Separation, Separation Type, Separation Reason, Proposed Last Working Date, Supporting Documents, Separation Status, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee-Initiated Separation, Manager-Initiated Separation, HR-Initiated Separation, Separation Type, Separation Reason, Proposed Last Working Date, Supporting Documents, Separation Status, Separation Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Separation Initiation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.3 Resignation

**SR-21.3-01:** The platform shall maintain complete lifecycle capability for Resignation, covering Resignation Request, Reason, Notice Period, Requested Last Day, Manager Review, HR Review, Counteroffer, Retention Discussion, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Resignation Request, Reason, Notice Period, Requested Last Day, Manager Review, HR Review, Counteroffer, Retention Discussion, Withdrawal, Resignation Acceptance, Resignation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Resignation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.4 Retirement

**SR-21.4-01:** The platform shall maintain complete lifecycle capability for Retirement, covering Retirement Eligibility, Retirement Notification, Retirement Date, Retirement Benefits, Knowledge Transfer, Retirement Approval, Retirement Letter, Retirement Ceremony, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Retirement Eligibility, Retirement Notification, Retirement Date, Retirement Benefits, Knowledge Transfer, Retirement Approval, Retirement Letter, Retirement Ceremony, Retirement History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Retirement according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.5 Termination

**SR-21.5-01:** The platform shall maintain complete lifecycle capability for Termination, covering Termination Request, Termination Reason, Supporting Evidence, Investigation Link, Legal Review, HR Review, Management Approval, Termination Date, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Termination Request, Termination Reason, Supporting Evidence, Investigation Link, Legal Review, HR Review, Management Approval, Termination Date, Termination Letter, Access Revocation, Termination History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Termination according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.6 Other Separation Types

**SR-21.6-01:** The platform shall maintain complete lifecycle capability for Other Separation Types, covering Contract Expiry, Mutual Separation, Redundancy, Layoff, Absconding, Death, Medical Separation, End of Assignment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Contract Expiry, Mutual Separation, Redundancy, Layoff, Absconding, Death, Medical Separation, End of Assignment, End of Internship, End of Contract.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Other Separation Types according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.7 Notice Period

**SR-21.7-01:** The platform shall maintain complete lifecycle capability for Notice Period, covering Notice Period Calculation, Notice Waiver, Notice Buyout, Notice Recovery, Garden Leave, Notice Attendance, Leave During Notice, Last Working Date, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Notice Period Calculation, Notice Waiver, Notice Buyout, Notice Recovery, Garden Leave, Notice Attendance, Leave During Notice, Last Working Date, Notice Period Tracking, Notice Adjustment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Notice Period according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.8 Exit Interview

**SR-21.8-01:** The platform shall maintain complete lifecycle capability for Exit Interview, covering Exit Interview Form, Exit Questionnaire, Interview Schedule, Interviewer, Separation Feedback, Manager Feedback, Company Feedback, Rehire Eligibility, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Exit Interview Form, Exit Questionnaire, Interview Schedule, Interviewer, Separation Feedback, Manager Feedback, Company Feedback, Rehire Eligibility, Exit Reasons, Exit Interview Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Exit Interview according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.9 Knowledge Transfer

**SR-21.9-01:** The platform shall maintain complete lifecycle capability for Knowledge Transfer, covering Handover Plan, Tasks, Projects, Documents, Client Handover, System Handover, Replacement Employee, Manager Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Handover Plan, Tasks, Projects, Documents, Client Handover, System Handover, Replacement Employee, Manager Approval, Completion Status, Knowledge Transfer History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Knowledge Transfer according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.10 Exit Clearance

**SR-21.10-01:** The platform shall maintain complete lifecycle capability for Exit Clearance, covering HR Clearance, IT Clearance, Finance Clearance, Admin Clearance, Facility Clearance, Security Clearance, Manager Clearance, Project Clearance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: HR Clearance, IT Clearance, Finance Clearance, Admin Clearance, Facility Clearance, Security Clearance, Manager Clearance, Project Clearance, Department Clearance, Legal Clearance, Clearance Exceptions, Clearance History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Exit Clearance according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.11 Asset and Access Revocation

**SR-21.11-01:** The platform shall enforce secure, auditable controls for Asset and Access Revocation, covering Laptop Return, Desktop Return, Mobile Return, SIM Return, ID Card Return, Access Card Return, Vehicle Return, Uniform Return, policy evaluation, exception handling, and administrative review.

Coverage: Laptop Return, Desktop Return, Mobile Return, SIM Return, ID Card Return, Access Card Return, Vehicle Return, Uniform Return, Software Access Removal, Email Deactivation, Application Access Removal, VPN Removal, Privileged Access Removal, Account Archive.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Asset and Access Revocation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.12 Full and Final Settlement

**SR-21.12-01:** The platform shall maintain complete lifecycle capability for Full and Final Settlement, covering Pending Salary, Leave Encashment, Bonus, Incentive, Overtime, Expense Reimbursement, Travel Settlement, Notice Recovery, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Pending Salary, Leave Encashment, Bonus, Incentive, Overtime, Expense Reimbursement, Travel Settlement, Notice Recovery, Loan Recovery, Advance Recovery, Asset Recovery, Tax, Gross Settlement, Total Deductions, Net Settlement.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Full and Final Settlement according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.13 F&F Approval and Payment

**SR-21.13-01:** The platform shall support configurable workflows for F&F Approval and Payment, including Payroll Calculation, Finance Review, HR Review, Management Approval, Settlement Statement, Payment Batch, Payment Date, Payment Status, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Payroll Calculation, Finance Review, HR Review, Management Approval, Settlement Statement, Payment Batch, Payment Date, Payment Status, Settlement Closure, F&F Reopen, F&F History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for F&F Approval and Payment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.14 Exit Documents

**SR-21.14-01:** The platform shall maintain complete lifecycle capability for Exit Documents, covering Relieving Letter, Experience Letter, Service Certificate, Full and Final Statement, Final Payslip, Tax Documents, Retirement Letter, Termination Letter, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Relieving Letter, Experience Letter, Service Certificate, Full and Final Statement, Final Payslip, Tax Documents, Retirement Letter, Termination Letter, Digital Signature, Document Delivery.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Exit Documents according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.15 Alumni and Archive

**SR-21.15-01:** The platform shall maintain complete lifecycle capability for Alumni and Archive, covering Alumni Profile, Alumni Contact, Rehire Eligibility, Alumni Community, Employment Archive, Document Archive, Data Retention, Legal Hold, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Alumni Profile, Alumni Contact, Rehire Eligibility, Alumni Community, Employment Archive, Document Archive, Data Retention, Legal Hold, Archive Access, Alumni Communication.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Alumni and Archive according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 21.16 Separation Analytics

**SR-21.16-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Separation Analytics, covering Separation Rate, Voluntary Attrition, Involuntary Attrition, Regrettable Attrition, New Hire Attrition, Exit Reasons, Notice Compliance, Clearance Time and related insights.

Coverage: Separation Rate, Voluntary Attrition, Involuntary Attrition, Regrettable Attrition, New Hire Attrition, Exit Reasons, Notice Compliance, Clearance Time, F&F Time, Rehire Eligibility, Exit Trend.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Separation Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 22: Communication and Employee Engagement

**Objective:** Domain 22 establishes the platform capabilities for Communication and Employee Engagement. It coordinates Announcements, News and Updates, Events, Birthdays and Anniversaries and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 22.1 | Operational | 11 | Worker Master, Organization Foundation, Document Management |
| 22.2 | Operational | 10 | Worker Master, Organization Foundation, Document Management |
| 22.3 | Operational | 11 | Worker Master, Organization Foundation |
| 22.4 | Operational | 8 | Worker Master |
| 22.5 | Operational | 11 | Worker Master |
| 22.6 | Operational | 9 | Worker Master |
| 22.7 | Operational | 9 | Worker Master |
| 22.8 | Operational | 10 | Worker Master, Workflow Engine, Document Management |
| 22.9 | Operational | 11 | Worker Master, Workflow Engine |
| 22.10 | Operational | 11 | Worker Master |
| 22.11 | Operational | 9 | Worker Master |
| 22.12 | Insight | 9 | Worker Master, Organization Foundation |

#### 22.1 Announcements

**SR-22.1-01:** The platform shall maintain complete lifecycle capability for Announcements, covering Company Announcement, Department Announcement, Location Announcement, Emergency Announcement, Policy Announcement, Target Audience, Publication Schedule, Expiry, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Company Announcement, Department Announcement, Location Announcement, Emergency Announcement, Policy Announcement, Target Audience, Publication Schedule, Expiry, Acknowledgment, Read Tracking, Announcement Archive.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Announcements according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.2 News and Updates

**SR-22.2-01:** The platform shall maintain complete lifecycle capability for News and Updates, covering Company News, Leadership Update, HR Update, Policy Update, Business Update, Newsletter, Featured Story, News Archive, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Company News, Leadership Update, HR Update, Policy Update, Business Update, Newsletter, Featured Story, News Archive, Comments, Reactions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for News and Updates according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.3 Events

**SR-22.3-01:** The platform shall maintain complete lifecycle capability for Events, covering Company Events, Department Events, Team Events, Town Hall, Training Events, Social Events, Recruitment Events, Event Registration, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Company Events, Department Events, Team Events, Town Hall, Training Events, Social Events, Recruitment Events, Event Registration, Attendance, Event Feedback, Event Calendar.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Events according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.4 Birthdays and Anniversaries

**SR-22.4-01:** The platform shall maintain complete lifecycle capability for Birthdays and Anniversaries, covering Birthday List, Work Anniversary, Joining Anniversary, Automated Wishes, Team Wishes, Greeting Cards, Digital Cards, Privacy Preferences, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Birthday List, Work Anniversary, Joining Anniversary, Automated Wishes, Team Wishes, Greeting Cards, Digital Cards, Privacy Preferences.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Birthdays and Anniversaries according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.5 Surveys

**SR-22.5-01:** The platform shall maintain complete lifecycle capability for Surveys, covering Engagement Survey, Pulse Survey, Lifecycle Survey, Onboarding Survey, Exit Survey, Manager Survey, Training Survey, Anonymous Survey, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Engagement Survey, Pulse Survey, Lifecycle Survey, Onboarding Survey, Exit Survey, Manager Survey, Training Survey, Anonymous Survey, Survey Scheduling, Survey Reminder, Survey Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Surveys according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.6 Polls

**SR-22.6-01:** The platform shall maintain complete lifecycle capability for Polls, covering Quick Poll, Multiple Choice, Single Choice, Anonymous Poll, Scheduled Poll, Poll Audience, Poll Results, Poll Closure, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Quick Poll, Multiple Choice, Single Choice, Anonymous Poll, Scheduled Poll, Poll Audience, Poll Results, Poll Closure, Poll History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Polls according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.7 Feedback and Suggestions

**SR-22.7-01:** The platform shall maintain complete lifecycle capability for Feedback and Suggestions, covering Employee Feedback, Anonymous Feedback, Suggestion Box, Idea Submission, Idea Voting, Idea Review, Management Response, Implementation Status, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Feedback, Anonymous Feedback, Suggestion Box, Idea Submission, Idea Voting, Idea Review, Management Response, Implementation Status, Feedback History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Feedback and Suggestions according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.8 Recognition

**SR-22.8-01:** The platform shall maintain complete lifecycle capability for Recognition, covering Peer Recognition, Manager Recognition, Team Recognition, Leadership Recognition, Kudos, Appreciation, Recognition Wall, Recognition Certificate, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Peer Recognition, Manager Recognition, Team Recognition, Leadership Recognition, Kudos, Appreciation, Recognition Wall, Recognition Certificate, Recognition History, Recognition Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Recognition according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.9 Rewards

**SR-22.9-01:** The platform shall maintain complete lifecycle capability for Rewards, covering Reward Catalog, Reward Points, Badges, Gift Cards, Merchandise, Cash Reward, Non-Cash Reward, Reward Redemption, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Reward Catalog, Reward Points, Badges, Gift Cards, Merchandise, Cash Reward, Non-Cash Reward, Reward Redemption, Reward Approval, Reward History, Reward Expiry.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Rewards according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.10 Communities and Social Feed

**SR-22.10-01:** The platform shall maintain complete lifecycle capability for Communities and Social Feed, covering Social Feed, Communities, Interest Groups, Posts, Comments, Reactions, Mentions, Hashtags, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Social Feed, Communities, Interest Groups, Posts, Comments, Reactions, Mentions, Hashtags, Moderation, Reporting, Community Administration.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Communities and Social Feed according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.11 Communication Campaigns

**SR-22.11-01:** The platform shall provide governed intelligent assistance for Communication Campaigns, covering Campaign Creation, Target Audience, Multi-Channel Campaign, Scheduled Campaign, Reminder Campaign, Read Tracking, Click Tracking, Campaign Analytics, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Campaign Creation, Target Audience, Multi-Channel Campaign, Scheduled Campaign, Reminder Campaign, Read Tracking, Click Tracking, Campaign Analytics, Campaign Archive.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Communication Campaigns according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 22.12 Engagement Analytics

**SR-22.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Engagement Analytics, covering Engagement Score, Survey Participation, Employee Sentiment, Recognition Activity, Reward Utilization, Event Participation, Communication Reach, Engagement Trend and related insights.

Coverage: Engagement Score, Survey Participation, Employee Sentiment, Recognition Activity, Reward Utilization, Event Participation, Communication Reach, Engagement Trend, Department Engagement.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Engagement Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 23: Workflow, Business Rules, Approvals and Notifications

**Objective:** Domain 23 establishes the platform capabilities for Workflow, Business Rules, Approvals and Notifications. It coordinates Workflow Designer, Business Rules Engine, Approval Center, Approval Types and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 23.1 | Workflow | 10 | Workflow Engine |
| 23.2 | Operational | 12 | Workflow Engine |
| 23.3 | Workflow | 12 | Finance and Statutory Configuration, Workflow Engine |
| 23.4 | Workflow | 13 | Finance and Statutory Configuration, Workflow Engine, Document Management |
| 23.5 | Workflow | 11 | Organization Foundation, Identity and RBAC, Workflow Engine |
| 23.6 | Workflow | 13 | Workflow Engine |
| 23.7 | Operational | 9 | Identity and RBAC, Workflow Engine |
| 23.8 | Operational | 11 | Workflow Engine |
| 23.9 | Operational | 11 | Workflow Engine |
| 23.10 | Operational | 10 | Workflow Engine, Document Management |
| 23.11 | Operational | 11 | Workflow Engine |
| 23.12 | Operational | 11 | Workflow Engine |
| 23.13 | Workflow | 10 | Workflow Engine |
| 23.14 | Workflow | 11 | Workflow Engine |

#### 23.1 Workflow Designer

**SR-23.1-01:** The platform shall support configurable workflows for Workflow Designer, including Drag-and-Drop Designer, Workflow Templates, Workflow Steps, Workflow Conditions, Workflow Actions, Workflow Variables, Workflow Start, Workflow End, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Drag-and-Drop Designer, Workflow Templates, Workflow Steps, Workflow Conditions, Workflow Actions, Workflow Variables, Workflow Start, Workflow End, Workflow Validation, Workflow Preview.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workflow Designer according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.2 Business Rules Engine

**SR-23.2-01:** The platform shall maintain complete lifecycle capability for Business Rules Engine, covering Rule Builder, Conditions, Logical Operators, Calculations, Formulas, Lookup Tables, Decision Tables, Effective Dates, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Rule Builder, Conditions, Logical Operators, Calculations, Formulas, Lookup Tables, Decision Tables, Effective Dates, Rule Priority, Rule Testing, Rule Versioning, Rule Simulation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Business Rules Engine according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.3 Approval Center

**SR-23.3-01:** The platform shall support configurable workflows for Approval Center, including My Pending Approvals, Team Approvals, HR Approvals, Finance Approvals, Payroll Approvals, Executive Approvals, Delegated Approvals, Escalated Approvals, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: My Pending Approvals, Team Approvals, HR Approvals, Finance Approvals, Payroll Approvals, Executive Approvals, Delegated Approvals, Escalated Approvals, Completed Approvals, Rejected Approvals, Cancelled Approvals, Approval History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Approval Center according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.4 Approval Types

**SR-23.4-01:** The platform shall support configurable workflows for Approval Types, including Leave Approval, Attendance Approval, Expense Approval, Travel Approval, Asset Approval, Document Approval, Recruitment Approval, Offer Approval, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Leave Approval, Attendance Approval, Expense Approval, Travel Approval, Asset Approval, Document Approval, Recruitment Approval, Offer Approval, Transfer Approval, Promotion Approval, Payroll Approval, Separation Approval, Full and Final Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Approval Types according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.5 Approval Routing

**SR-23.5-01:** The platform shall support configurable workflows for Approval Routing, including Single-Level Approval, Multi-Level Approval, Parallel Approval, Sequential Approval, Conditional Approval, Role-Based Approval, Hierarchy Approval, Amount-Based Approval, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Single-Level Approval, Multi-Level Approval, Parallel Approval, Sequential Approval, Conditional Approval, Role-Based Approval, Hierarchy Approval, Amount-Based Approval, Department-Based Approval, Auto Approval, Skip Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Approval Routing according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.6 Approval Actions

**SR-23.6-01:** The platform shall support configurable workflows for Approval Actions, including Submit, Approve, Reject, Return, Request Information, Resubmit, Cancel, Withdraw, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Submit, Approve, Reject, Return, Request Information, Resubmit, Cancel, Withdraw, Delegate, Escalate, Reassign, Add Comments, Add Attachment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Approval Actions according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.7 Delegation

**SR-23.7-01:** The platform shall maintain complete lifecycle capability for Delegation, covering Approval Delegation, Task Delegation, Date-Based Delegation, Module-Based Delegation, Role-Based Delegation, Emergency Delegation, Delegation Acceptance, Delegation Revocation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Approval Delegation, Task Delegation, Date-Based Delegation, Module-Based Delegation, Role-Based Delegation, Emergency Delegation, Delegation Acceptance, Delegation Revocation, Delegation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Delegation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.8 SLA and Escalation

**SR-23.8-01:** The platform shall maintain complete lifecycle capability for SLA and Escalation, covering SLA Definition, SLA Timer, Reminder, Escalation Level, Escalation Recipient, Auto Escalation, SLA Pause, SLA Resume, role-based operations, validation, status changes, reporting, and audit history.

Coverage: SLA Definition, SLA Timer, Reminder, Escalation Level, Escalation Recipient, Auto Escalation, SLA Pause, SLA Resume, SLA Breach, SLA Analytics, Escalation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for SLA and Escalation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.9 Task Orchestration

**SR-23.9-01:** The platform shall maintain complete lifecycle capability for Task Orchestration, covering Workflow Task, Human Task, System Task, Scheduled Task, Parallel Task, Task Assignment, Task Dependency, Task Completion, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Workflow Task, Human Task, System Task, Scheduled Task, Parallel Task, Task Assignment, Task Dependency, Task Completion, Task Failure, Task Retry, Task History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Task Orchestration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.10 Event Engine

**SR-23.10-01:** The platform shall maintain complete lifecycle capability for Event Engine, covering Business Events, System Events, Event Triggers, Event Conditions, Event Subscribers, Event Queue, Event Retry, Dead-Letter Queue, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Business Events, System Events, Event Triggers, Event Conditions, Event Subscribers, Event Queue, Event Retry, Dead-Letter Queue, Event Replay, Event History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Event Engine according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.11 Notification Engine

**SR-23.11-01:** The platform shall maintain complete lifecycle capability for Notification Engine, covering In-App Notification, Email, SMS, Push Notification, WhatsApp, Microsoft Teams, Slack, Notification Templates, role-based operations, validation, status changes, reporting, and audit history.

Coverage: In-App Notification, Email, SMS, Push Notification, WhatsApp, Microsoft Teams, Slack, Notification Templates, Notification Variables, Notification Preferences, Notification Categories.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Notification Engine according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.12 Notification Delivery

**SR-23.12-01:** The platform shall maintain complete lifecycle capability for Notification Delivery, covering Immediate Delivery, Scheduled Delivery, Digest, Reminder, Retry, Delivery Status, Failed Delivery, Bounce, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Immediate Delivery, Scheduled Delivery, Digest, Reminder, Retry, Delivery Status, Failed Delivery, Bounce, Read Receipt, Click Tracking, Delivery History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Notification Delivery according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.13 Workflow Administration

**SR-23.13-01:** The platform shall support configurable workflows for Workflow Administration, including Workflow Activation, Workflow Deactivation, Workflow Version, Workflow Clone, Workflow Migration, Workflow Test, Workflow Simulation, Workflow Monitoring, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Workflow Activation, Workflow Deactivation, Workflow Version, Workflow Clone, Workflow Migration, Workflow Test, Workflow Simulation, Workflow Monitoring, Failed Workflow Recovery, Workflow Archive.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workflow Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 23.14 Workflow Audit

**SR-23.14-01:** The platform shall support configurable workflows for Workflow Audit, including Request ID, Workflow ID, Current Step, Current Approver, Previous Approvers, Action, Comments, Timestamp, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Request ID, Workflow ID, Current Step, Current Approver, Previous Approvers, Action, Comments, Timestamp, Old Value, New Value, Complete Audit Trail.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workflow Audit according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 24: Documents, Forms and Digital Signature

**Objective:** Domain 24 establishes the platform capabilities for Documents, Forms and Digital Signature. It coordinates Document Repository, Document Metadata, Document Versioning, Document Access Control and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 24.1 | Operational | 19 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Document Management |
| 24.2 | Operational | 12 | Worker Master, Organization Foundation, Document Management |
| 24.3 | Operational | 8 | Workflow Engine, Document Management |
| 24.4 | Control | 11 | Identity and RBAC, Document Management |
| 24.5 | Operational | 10 | Worker Master, Workflow Engine, Document Management |
| 24.6 | Control | 10 | Identity and RBAC, Document Management |
| 24.7 | Operational | 10 | Document Management |
| 24.8 | Operational | 12 | Identity and RBAC, Document Management |
| 24.9 | Operational | 12 | Finance and Statutory Configuration, Document Management |
| 24.10 | Operational | 11 | Worker Master, Document Management |
| 24.11 | Operational | 11 | Worker Master, Workflow Engine, Document Management |
| 24.12 | Operational | 9 | Workflow Engine, Document Management |
| 24.13 | Operational | 9 | Worker Master, Document Management |
| 24.14 | Operational | 9 | Document Management |

#### 24.1 Document Repository

**SR-24.1-01:** The platform shall maintain complete lifecycle capability for Document Repository, covering Employee Documents, Candidate Documents, Recruitment Documents, Offer Documents, Background Verification Documents, Payroll Documents, Tax Documents, Performance Documents, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Documents, Candidate Documents, Recruitment Documents, Offer Documents, Background Verification Documents, Payroll Documents, Tax Documents, Performance Documents, Learning Documents, Compliance Documents, Separation Documents, Company Documents, HR Policies, Company Handbook, SOPs, Forms, Templates, Circulars, Notices.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Repository according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.2 Document Metadata

**SR-24.2-01:** The platform shall maintain complete lifecycle capability for Document Metadata, covering Document Type, Document Category, Document Owner, Employee, Candidate, Company, Department, Effective Date, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Document Type, Document Category, Document Owner, Employee, Candidate, Company, Department, Effective Date, Expiry Date, Confidentiality, Tags, Description.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Metadata according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.3 Document Versioning

**SR-24.3-01:** The platform shall maintain complete lifecycle capability for Document Versioning, covering Version Number, Previous Version, Current Version, Version Comments, Version Comparison, Restore Version, Version History, Version Approval, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Version Number, Previous Version, Current Version, Version Comments, Version Comparison, Restore Version, Version History, Version Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Versioning according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.4 Document Access Control

**SR-24.4-01:** The platform shall enforce secure, auditable controls for Document Access Control, covering View Permission, Download Permission, Upload Permission, Edit Permission, Delete Permission, Share Permission, Print Permission, Restricted Document, policy evaluation, exception handling, and administrative review.

Coverage: View Permission, Download Permission, Upload Permission, Edit Permission, Delete Permission, Share Permission, Print Permission, Restricted Document, Confidential Document, Expiring Access, External Sharing.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Access Control according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.5 Document Retention and Archive

**SR-24.5-01:** The platform shall maintain complete lifecycle capability for Document Retention and Archive, covering Retention Policy, Retention Period, Archive, Legal Hold, Scheduled Deletion, Permanent Record, Employee Exit Archive, Candidate Archive, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Retention Policy, Retention Period, Archive, Legal Hold, Scheduled Deletion, Permanent Record, Employee Exit Archive, Candidate Archive, Retrieval, Disposal Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Retention and Archive according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.6 Document Security

**SR-24.6-01:** The platform shall enforce secure, auditable controls for Document Security, covering Encryption, Virus Scanning, Malware Detection, Password Protection, Watermark, Download Tracking, Print Tracking, Sensitive Data Masking, policy evaluation, exception handling, and administrative review.

Coverage: Encryption, Virus Scanning, Malware Detection, Password Protection, Watermark, Download Tracking, Print Tracking, Sensitive Data Masking, Secure Preview, Document Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Security according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.7 OCR and Data Extraction

**SR-24.7-01:** The platform shall maintain complete lifecycle capability for OCR and Data Extraction, covering Scan Document, OCR, Identity Extraction, Invoice Extraction, Receipt Extraction, Certificate Extraction, Resume Extraction, Data Validation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Scan Document, OCR, Identity Extraction, Invoice Extraction, Receipt Extraction, Certificate Extraction, Resume Extraction, Data Validation, Manual Correction, Extraction History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for OCR and Data Extraction according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.8 Form Builder

**SR-24.8-01:** The platform shall maintain complete lifecycle capability for Form Builder, covering Drag-and-Drop Form, Form Sections, Field Types, Conditional Fields, Validation Rules, Calculated Fields, Repeatable Sections, Attachments, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Drag-and-Drop Form, Form Sections, Field Types, Conditional Fields, Validation Rules, Calculated Fields, Repeatable Sections, Attachments, Form Versioning, Form Preview, Form Publication, Form Permissions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Form Builder according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.9 Letter and Template Engine

**SR-24.9-01:** The platform shall maintain complete lifecycle capability for Letter and Template Engine, covering Offer Templates, Appointment Letters, Confirmation Letters, Promotion Letters, Transfer Letters, Salary Revision Letters, Warning Letters, Relieving Letters, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Offer Templates, Appointment Letters, Confirmation Letters, Promotion Letters, Transfer Letters, Salary Revision Letters, Warning Letters, Relieving Letters, Experience Letters, Separation Letters, Custom Templates, Multi-Language Templates.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Letter and Template Engine according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.10 Document Generation

**SR-24.10-01:** The platform shall maintain complete lifecycle capability for Document Generation, covering PDF Generation, DOCX Generation, Bulk Generation, Template Variables, Employee Data Merge, Candidate Data Merge, QR Code, Barcode, role-based operations, validation, status changes, reporting, and audit history.

Coverage: PDF Generation, DOCX Generation, Bulk Generation, Template Variables, Employee Data Merge, Candidate Data Merge, QR Code, Barcode, Watermark, Password Protection, Generation History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Generation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.11 Digital Signature

**SR-24.11-01:** The platform shall maintain complete lifecycle capability for Digital Signature, covering Employee Signature, Candidate Signature, HR Signature, Manager Signature, Executive Signature, Multi-Signer Workflow, Signature Order, Signature Reminder, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Signature, Candidate Signature, HR Signature, Manager Signature, Executive Signature, Multi-Signer Workflow, Signature Order, Signature Reminder, Signature Certificate, Signature Audit, Signature Status.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Digital Signature according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.12 Document Verification

**SR-24.12-01:** The platform shall maintain complete lifecycle capability for Document Verification, covering Verification Request, Verifier Assignment, Verification Status, Verified, Rejected, Clarification Required, Verification Comments, Verification History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Verification Request, Verifier Assignment, Verification Status, Verified, Rejected, Clarification Required, Verification Comments, Verification History, External Verification.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Verification according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.13 Document Expiry

**SR-24.13-01:** The platform shall maintain complete lifecycle capability for Document Expiry, covering Expiry Date, Renewal Requirement, Employee Reminder, Manager Reminder, HR Reminder, Escalation, Expired Document, Renewal Status, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Expiry Date, Renewal Requirement, Employee Reminder, Manager Reminder, HR Reminder, Escalation, Expired Document, Renewal Status, Renewal History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Document Expiry according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 24.14 Bulk Document Operations

**SR-24.14-01:** The platform shall maintain complete lifecycle capability for Bulk Document Operations, covering Bulk Upload, Bulk Download, Bulk Generate, Bulk Verify, Bulk Archive, Bulk Delete, Bulk Share, Processing Status, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Bulk Upload, Bulk Download, Bulk Generate, Bulk Verify, Bulk Archive, Bulk Delete, Bulk Share, Processing Status, Error Report.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Bulk Document Operations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 25: Reports, Analytics and Workforce Planning

**Objective:** Domain 25 establishes the platform capabilities for Reports, Analytics and Workforce Planning. It coordinates Report Catalog, Custom Report Builder, Report Distribution, Export and Print and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 25.1 | Insight | 16 | Worker Master, Finance and Statutory Configuration |
| 25.2 | Insight | 12 | Platform Foundation |
| 25.3 | Insight | 9 | Platform Foundation |
| 25.4 | Operational | 11 | Organization Foundation, Integration Platform |
| 25.5 | Operational | 11 | Finance and Statutory Configuration |
| 25.6 | Insight | 10 | Worker Master, Organization Foundation |
| 25.7 | Insight | 10 | Worker Master, Organization Foundation |
| 25.8 | Insight | 10 | Platform Foundation |
| 25.9 | Insight | 10 | Platform Foundation |
| 25.10 | Insight | 10 | Worker Master, Finance and Statutory Configuration |
| 25.11 | Insight | 10 | Organization Foundation |
| 25.12 | Insight | 9 | Platform Foundation |
| 25.13 | Insight | 9 | Platform Foundation |
| 25.14 | Operational | 10 | Organization Foundation |
| 25.15 | Operational | 9 | Organization Foundation |
| 25.16 | Operational | 10 | Organization Foundation, Workflow Engine |
| 25.17 | Insight | 9 | Finance and Statutory Configuration |
| 25.18 | Insight | 9 | Finance and Statutory Configuration |

#### 25.1 Report Catalog

**SR-25.1-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Report Catalog, covering Employee Reports, Organization Reports, Attendance Reports, Leave Reports, Payroll Reports, Compensation Reports, Recruitment Reports, Onboarding Reports and related insights.

Coverage: Employee Reports, Organization Reports, Attendance Reports, Leave Reports, Payroll Reports, Compensation Reports, Recruitment Reports, Onboarding Reports, Performance Reports, Talent Reports, Learning Reports, Expense Reports, Travel Reports, Asset Reports, Compliance Reports, Separation Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Report Catalog according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.2 Custom Report Builder

**SR-25.2-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Custom Report Builder, covering Data Source, Fields, Filters, Grouping, Sorting, Calculated Fields, Parameters, Charts and related insights.

Coverage: Data Source, Fields, Filters, Grouping, Sorting, Calculated Fields, Parameters, Charts, Tables, Pivot Tables, Report Preview, Saved Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Custom Report Builder according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.3 Report Distribution

**SR-25.3-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Report Distribution, covering Scheduled Reports, Email Reports, Report Subscription, Report Recipients, Password-Protected Reports, Report Expiry, Delivery History, Failed Delivery and related insights.

Coverage: Scheduled Reports, Email Reports, Report Subscription, Report Recipients, Password-Protected Reports, Report Expiry, Delivery History, Failed Delivery, Report Archive.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Report Distribution according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.4 Export and Print

**SR-25.4-01:** The platform shall maintain complete lifecycle capability for Export and Print, covering PDF, Excel, CSV, JSON, XML, Print, Email, Secure Download, role-based operations, validation, status changes, reporting, and audit history.

Coverage: PDF, Excel, CSV, JSON, XML, Print, Email, Secure Download, Large Export Job, Export Audit, Export History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Export and Print according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.5 Data Warehouse and Semantic Layer

**SR-25.5-01:** The platform shall maintain complete lifecycle capability for Data Warehouse and Semantic Layer, covering HR Data Mart, Payroll Data Mart, Recruitment Data Mart, Learning Data Mart, Expense Data Mart, Semantic Models, Dimensions, Measures, role-based operations, validation, status changes, reporting, and audit history.

Coverage: HR Data Mart, Payroll Data Mart, Recruitment Data Mart, Learning Data Mart, Expense Data Mart, Semantic Models, Dimensions, Measures, Historical Snapshots, Data Refresh, Data Lineage.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Warehouse and Semantic Layer according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.6 Workforce Analytics

**SR-25.6-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Workforce Analytics, covering Headcount, Active Workforce, Inactive Workforce, Workforce Growth, Employee Movement, Span of Control, Workforce Composition, Workforce Location and related insights.

Coverage: Headcount, Active Workforce, Inactive Workforce, Workforce Growth, Employee Movement, Span of Control, Workforce Composition, Workforce Location, Workforce Cost, Workforce Productivity.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workforce Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.7 Attrition Analytics

**SR-25.7-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Attrition Analytics, covering Voluntary Attrition, Involuntary Attrition, Regrettable Attrition, New Hire Attrition, Department Attrition, Location Attrition, Manager Attrition, Exit Reasons and related insights.

Coverage: Voluntary Attrition, Involuntary Attrition, Regrettable Attrition, New Hire Attrition, Department Attrition, Location Attrition, Manager Attrition, Exit Reasons, Attrition Forecast, Retention Risk.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attrition Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.8 Diversity and Inclusion Analytics

**SR-25.8-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Diversity and Inclusion Analytics, covering Gender Diversity, Age Diversity, Nationality Diversity, Disability Representation, Leadership Diversity, Hiring Diversity, Promotion Diversity, Pay Equity and related insights.

Coverage: Gender Diversity, Age Diversity, Nationality Diversity, Disability Representation, Leadership Diversity, Hiring Diversity, Promotion Diversity, Pay Equity, Inclusion Metrics, Diversity Trend.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Diversity and Inclusion Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.9 Attendance and Absence Analytics

**SR-25.9-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Attendance and Absence Analytics, covering Attendance Rate, Absence Rate, Overtime, Late Arrival, Early Exit, Leave Utilization, Leave Liability, Schedule Compliance and related insights.

Coverage: Attendance Rate, Absence Rate, Overtime, Late Arrival, Early Exit, Leave Utilization, Leave Liability, Schedule Compliance, Attendance Forecast, Absence Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Attendance and Absence Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.10 Payroll and Compensation Analytics

**SR-25.10-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Payroll and Compensation Analytics, covering Payroll Cost, Compensation Cost, Cost per Employee, Overtime Cost, Bonus Cost, Benefit Cost, Pay Equity, Salary Distribution and related insights.

Coverage: Payroll Cost, Compensation Cost, Cost per Employee, Overtime Cost, Bonus Cost, Benefit Cost, Pay Equity, Salary Distribution, Payroll Forecast, Compensation Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll and Compensation Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.11 Recruitment Analytics

**SR-25.11-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Recruitment Analytics, covering Open Positions, Hiring Funnel, Time to Hire, Time to Fill, Cost per Hire, Source Effectiveness, Offer Acceptance, Joining Ratio and related insights.

Coverage: Open Positions, Hiring Funnel, Time to Hire, Time to Fill, Cost per Hire, Source Effectiveness, Offer Acceptance, Joining Ratio, Recruitment Forecast, Recruiter Performance.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Recruitment Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.12 Performance and Talent Analytics

**SR-25.12-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Performance and Talent Analytics, covering Performance Distribution, Goal Completion, High Potential, Succession Coverage, Bench Strength, Talent Risk, Career Mobility, Retention Risk and related insights.

Coverage: Performance Distribution, Goal Completion, High Potential, Succession Coverage, Bench Strength, Talent Risk, Career Mobility, Retention Risk, Calibration Variance.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Performance and Talent Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.13 Learning and Skills Analytics

**SR-25.13-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Learning and Skills Analytics, covering Training Completion, Compliance Training, Learning Hours, Learning Cost, Certification Status, Skill Coverage, Skill Gaps, Critical Skills and related insights.

Coverage: Training Completion, Compliance Training, Learning Hours, Learning Cost, Certification Status, Skill Coverage, Skill Gaps, Critical Skills, Learning Effectiveness.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Learning and Skills Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.14 Workforce Planning

**SR-25.14-01:** The platform shall maintain complete lifecycle capability for Workforce Planning, covering Workforce Plan, Headcount Plan, Position Plan, Hiring Plan, Skills Plan, Location Plan, Contractor Plan, Workforce Demand, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Workforce Plan, Headcount Plan, Position Plan, Hiring Plan, Skills Plan, Location Plan, Contractor Plan, Workforce Demand, Workforce Supply, Workforce Gap.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workforce Planning according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.15 Scenario Planning

**SR-25.15-01:** The platform shall maintain complete lifecycle capability for Scenario Planning, covering Base Scenario, Growth Scenario, Reduction Scenario, Restructure Scenario, Automation Scenario, Location Scenario, Cost Scenario, Merger Scenario, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Base Scenario, Growth Scenario, Reduction Scenario, Restructure Scenario, Automation Scenario, Location Scenario, Cost Scenario, Merger Scenario, Scenario Comparison.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Scenario Planning according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.16 Headcount Budgeting

**SR-25.16-01:** The platform shall maintain complete lifecycle capability for Headcount Budgeting, covering Headcount Budget, Position Budget, Department Budget, Hiring Budget, Compensation Budget, Contractor Budget, Budget Approval, Budget Transfer, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Headcount Budget, Position Budget, Department Budget, Hiring Budget, Compensation Budget, Contractor Budget, Budget Approval, Budget Transfer, Budget Variance, Budget Utilization.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Headcount Budgeting according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.17 Predictive Analytics

**SR-25.17-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Predictive Analytics, covering Attrition Prediction, Absence Prediction, Hiring Prediction, Workforce Demand Prediction, Performance Risk, Retention Risk, Skills Demand, Payroll Cost Forecast and related insights.

Coverage: Attrition Prediction, Absence Prediction, Hiring Prediction, Workforce Demand Prediction, Performance Risk, Retention Risk, Skills Demand, Payroll Cost Forecast, Workforce Cost Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Predictive Analytics according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 25.18 Regulatory Reporting

**SR-25.18-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Regulatory Reporting, covering Labor Reports, Statutory Reports, Tax Reports, Diversity Reports, Health and Safety Reports, Workforce Compliance Reports, Country-Specific Reports, Audit Reports and related insights.

Coverage: Labor Reports, Statutory Reports, Tax Reports, Diversity Reports, Health and Safety Reports, Workforce Compliance Reports, Country-Specific Reports, Audit Reports, Government Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Regulatory Reporting according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 26: AI and Enterprise Search

**Objective:** Domain 26 establishes the platform capabilities for AI and Enterprise Search. It coordinates Enterprise Search, Search Controls, Employee AI Assistant, Manager AI Assistant and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 26.1 | Operational | 12 | Worker Master, Organization Foundation, Workflow Engine, Document Management |
| 26.2 | Operational | 10 | Identity and RBAC |
| 26.3 | Operational | 13 | Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 26.4 | Operational | 10 | Worker Master, Workflow Engine |
| 26.5 | Operational | 9 | Worker Master, Workflow Engine, Document Management |
| 26.6 | Operational | 10 | Worker Master, Organization Foundation |
| 26.7 | Operational | 8 | Finance and Statutory Configuration |
| 26.8 | Operational | 8 | Organization Foundation |
| 26.9 | Insight | 9 | Platform Foundation |
| 26.10 | Operational | 9 | Document Management |
| 26.11 | Operational | 8 | Worker Master, Finance and Statutory Configuration |
| 26.12 | Operational | 9 | Worker Master, Organization Foundation, Document Management |
| 26.13 | Operational | 11 | Identity and RBAC |
| 26.14 | Operational | 10 | Platform Foundation |

#### 26.1 Enterprise Search

**SR-26.1-01:** The platform shall provide governed intelligent assistance for Enterprise Search, covering Global Search, Employee Search, Organization Search, Position Search, Candidate Search, Document Search, Policy Search, Report Search, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Global Search, Employee Search, Organization Search, Position Search, Candidate Search, Document Search, Policy Search, Report Search, Service Search, Ticket Search, Asset Search, Full-Text Search.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Enterprise Search according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master, Organization Foundation, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.2 Search Controls

**SR-26.2-01:** The platform shall provide governed intelligent assistance for Search Controls, covering Permission-Aware Search, Filters, Facets, Ranking, Search Suggestions, Autocomplete, Recent Searches, Saved Searches, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Permission-Aware Search, Filters, Facets, Ranking, Search Suggestions, Autocomplete, Recent Searches, Saved Searches, Search History, Search Analytics.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Search Controls according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.3 Employee AI Assistant

**SR-26.3-01:** The platform shall provide governed intelligent assistance for Employee AI Assistant, covering Leave Assistant, Attendance Assistant, Payroll Assistant, Benefit Assistant, Expense Assistant, Travel Assistant, Policy Assistant, Document Assistant, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Leave Assistant, Attendance Assistant, Payroll Assistant, Benefit Assistant, Expense Assistant, Travel Assistant, Policy Assistant, Document Assistant, Ticket Creation, Request Status, Personal Data Questions, AI FAQ, Voice Assistant.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Employee AI Assistant according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.4 Manager AI Assistant

**SR-26.4-01:** The platform shall provide governed intelligent assistance for Manager AI Assistant, covering Team Attendance, Team Leave, Pending Approvals, Team Performance, Team Goals, Probation Due, Confirmation Due, Workforce Insights, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Team Attendance, Team Leave, Pending Approvals, Team Performance, Team Goals, Probation Due, Confirmation Due, Workforce Insights, Manager Recommendations, Team Summary.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Manager AI Assistant according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.5 HR AI Assistant

**SR-26.5-01:** The platform shall provide governed intelligent assistance for HR AI Assistant, covering Employee Search, Policy Assistance, HR Case Assistance, Workforce Questions, Report Generation, Document Summary, Compliance Alerts, HR Recommendations, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Employee Search, Policy Assistance, HR Case Assistance, Workforce Questions, Report Generation, Document Summary, Compliance Alerts, HR Recommendations, Employee Lifecycle Assistance.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for HR AI Assistant according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master, Workflow Engine, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.6 Recruitment AI

**SR-26.6-01:** The platform shall provide governed intelligent assistance for Recruitment AI, covering Resume Parsing, Resume Analyzer, Candidate Matching, Job Description Generation, Screening Assistance, Interview Question Generation, Candidate Summary, Offer Insights, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Resume Parsing, Resume Analyzer, Candidate Matching, Job Description Generation, Screening Assistance, Interview Question Generation, Candidate Summary, Offer Insights, Hiring Analytics, Candidate Ranking.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Recruitment AI according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.7 Payroll AI

**SR-26.7-01:** The platform shall manage compliant financial and compensation processes for Payroll AI, including Payroll Exception Explanation, Variance Analysis, Payslip Explanation, Tax Explanation, Anomaly Detection, Payroll Query Assistance, Reconciliation Assistance, Payroll Forecast, validations, calculations, approvals, and reports.

Coverage: Payroll Exception Explanation, Variance Analysis, Payslip Explanation, Tax Explanation, Anomaly Detection, Payroll Query Assistance, Reconciliation Assistance, Payroll Forecast.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll AI according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.8 Career and Learning AI

**SR-26.8-01:** The platform shall provide governed intelligent assistance for Career and Learning AI, covering AI Resume Builder, AI Career Advisor, Career Path Recommendation, Skill Gap Recommendation, Learning Recommendation, Mentor Recommendation, Internal Job Recommendation, Development Plan Recommendation, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: AI Resume Builder, AI Career Advisor, Career Path Recommendation, Skill Gap Recommendation, Learning Recommendation, Mentor Recommendation, Internal Job Recommendation, Development Plan Recommendation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Career and Learning AI according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.9 Analytics Copilot

**SR-26.9-01:** The platform shall provide role-aware visibility, filters, drill-downs, exports, and operational metrics for Analytics Copilot, covering Natural-Language Query, Chart Generation, Report Generation, Trend Explanation, Root Cause Analysis, Forecast Explanation, Executive Summary, Recommended Actions and related insights.

Coverage: Natural-Language Query, Chart Generation, Report Generation, Trend Explanation, Root Cause Analysis, Forecast Explanation, Executive Summary, Recommended Actions, Dashboard Insights.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Analytics Copilot according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Users can filter, drill into, export and reconcile the displayed figures back to governed source data.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.10 AI Search and Document Intelligence

**SR-26.10-01:** The platform shall provide governed intelligent assistance for AI Search and Document Intelligence, covering Semantic Search, Policy Q&A, AI Document Search, Document Classification, Document Summary, Clause Extraction, Expiry Extraction, Sensitive Data Detection, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Semantic Search, Policy Q&A, AI Document Search, Document Classification, Document Summary, Clause Extraction, Expiry Extraction, Sensitive Data Detection, Similar Document Detection.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for AI Search and Document Intelligence according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.11 AI Recommendations

**SR-26.11-01:** The platform shall provide governed intelligent assistance for AI Recommendations, covering Learning Recommendations, Career Recommendations, Candidate Recommendations, Talent Recommendations, Retention Recommendations, Workforce Recommendations, Scheduling Recommendations, Benefits Recommendations, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Learning Recommendations, Career Recommendations, Candidate Recommendations, Talent Recommendations, Retention Recommendations, Workforce Recommendations, Scheduling Recommendations, Benefits Recommendations.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for AI Recommendations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.12 AI Content Generation

**SR-26.12-01:** The platform shall provide governed intelligent assistance for AI Content Generation, covering Job Descriptions, Announcements, HR Letters, Performance Summaries, Interview Questions, Training Content, Survey Questions, Employee Communications, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Job Descriptions, Announcements, HR Letters, Performance Summaries, Interview Questions, Training Content, Survey Questions, Employee Communications, Policy Summaries.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for AI Content Generation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Worker Master, Organization Foundation, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.13 AI Governance

**SR-26.13-01:** The platform shall provide governed intelligent assistance for AI Governance, covering Approved Models, AI Permissions, Prompt Templates, Data Boundaries, Sensitive Data Redaction, Human Review, Explainability, AI Audit, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Approved Models, AI Permissions, Prompt Templates, Data Boundaries, Sensitive Data Redaction, Human Review, Explainability, AI Audit, AI Usage Logs, AI Feedback, AI Consent.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for AI Governance according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 26.14 AI Monitoring

**SR-26.14-01:** The platform shall provide governed intelligent assistance for AI Monitoring, covering Model Performance, Response Quality, Hallucination Reports, Unsafe Response Detection, Bias Monitoring, Cost Monitoring, Latency Monitoring, User Feedback, permission-aware retrieval, explainability, monitoring, and human review.

Coverage: Model Performance, Response Quality, Hallucination Reports, Unsafe Response Detection, Bias Monitoring, Cost Monitoring, Latency Monitoring, User Feedback, Model Versioning, AI Incident Management.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for AI Monitoring according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- AI and search responses respect permissions, disclose confidence or source context, and are logged for governance review.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 27: Integrations and Developer Platform

**Objective:** Domain 27 establishes the platform capabilities for Integrations and Developer Platform. It coordinates API Gateway, REST and GraphQL APIs, Webhooks and Events, Integration Catalog and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented through REST APIs, import/export services and the in-migration Node API.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 27.1 | Integration | 10 | Workflow Engine, Integration Platform |
| 27.2 | Integration | 15 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Integration Platform |
| 27.3 | Integration | 9 | Integration Platform |
| 27.4 | Integration | 9 | Identity and RBAC, Document Management, Integration Platform |
| 27.5 | Operational | 12 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Integration Platform |
| 27.6 | Integration | 10 | Integration Platform |
| 27.7 | Integration | 10 | Integration Platform |
| 27.8 | Integration | 11 | Finance and Statutory Configuration, Integration Platform |
| 27.9 | Integration | 9 | Organization Foundation, Integration Platform |
| 27.10 | Integration | 9 | Integration Platform |
| 27.11 | Operational | 11 | Identity and RBAC, Integration Platform |
| 27.12 | Integration | 10 | Integration Platform |
| 27.13 | Integration | 10 | Document Management, Integration Platform |
| 27.14 | Integration | 9 | Document Management, Integration Platform |
| 27.15 | Integration | 10 | Integration Platform |
| 27.16 | Operational | 9 | Workflow Engine, Integration Platform |
| 27.17 | Operational | 10 | Integration Platform |

#### 27.1 API Gateway

**SR-27.1-01:** The platform shall expose governed integration capabilities for API Gateway, covering API Routing, Authentication, Authorization, Rate Limiting, Throttling, Request Validation, Response Transformation, API Logging, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: API Routing, Authentication, Authorization, Rate Limiting, Throttling, Request Validation, Response Transformation, API Logging, API Versioning, API Monitoring.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for API Gateway according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Workflow Engine, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.2 REST and GraphQL APIs

**SR-27.2-01:** The platform shall expose governed integration capabilities for REST and GraphQL APIs, covering Employee APIs, Organization APIs, Position APIs, Attendance APIs, Leave APIs, Payroll APIs, Recruitment APIs, Performance APIs, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Employee APIs, Organization APIs, Position APIs, Attendance APIs, Leave APIs, Payroll APIs, Recruitment APIs, Performance APIs, Learning APIs, Expense APIs, Travel APIs, Asset APIs, Reporting APIs, GraphQL Queries, GraphQL Mutations.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for REST and GraphQL APIs according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.3 Webhooks and Events

**SR-27.3-01:** The platform shall maintain complete lifecycle capability for Webhooks and Events, covering Webhook Registration, Event Subscription, Event Payload, Signature Validation, Delivery Retry, Failure Handling, Webhook Logs, Event Replay, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Webhook Registration, Event Subscription, Event Payload, Signature Validation, Delivery Retry, Failure Handling, Webhook Logs, Event Replay, Webhook Testing.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Webhooks and Events according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.4 Integration Catalog

**SR-27.4-01:** The platform shall expose governed integration capabilities for Integration Catalog, covering Available Integrations, Installed Integrations, Integration Configuration, Integration Status, Integration Owner, Integration Documentation, Integration Version, Integration Dependencies, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Available Integrations, Installed Integrations, Integration Configuration, Integration Status, Integration Owner, Integration Documentation, Integration Version, Integration Dependencies, Integration Permissions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Integration Catalog according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Identity and RBAC, Document Management, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.5 Data Import and Export

**SR-27.5-01:** The platform shall maintain complete lifecycle capability for Data Import and Export, covering Employee Import, Organization Import, Position Import, Payroll Import, Attendance Import, Leave Import, Candidate Import, Asset Import, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Import, Organization Import, Position Import, Payroll Import, Attendance Import, Leave Import, Candidate Import, Asset Import, Bulk Export, Import Validation, Error Report, Import History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Import and Export according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.6 Identity Integrations

**SR-27.6-01:** The platform shall expose governed integration capabilities for Identity Integrations, covering Active Directory, Azure AD, Microsoft Entra ID, LDAP, Google Workspace, Microsoft 365, Identity Provisioning, User Deprovisioning, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Active Directory, Azure AD, Microsoft Entra ID, LDAP, Google Workspace, Microsoft 365, Identity Provisioning, User Deprovisioning, Group Synchronization, SSO Synchronization.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Identity Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.7 ERP and Finance Integrations

**SR-27.7-01:** The platform shall expose governed integration capabilities for ERP and Finance Integrations, covering SAP, Oracle ERP, Microsoft Dynamics, Accounting Software, General Ledger, Accounts Payable, Cost Centers, Vendor Payments, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: SAP, Oracle ERP, Microsoft Dynamics, Accounting Software, General Ledger, Accounts Payable, Cost Centers, Vendor Payments, Finance Reconciliation, Budget Systems.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for ERP and Finance Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.8 Payroll, Bank and Tax Integrations

**SR-27.8-01:** The platform shall manage compliant financial and compensation processes for Payroll, Bank and Tax Integrations, including Banking APIs, Bulk Payment, Payment Files, UPI, Payment Gateways, Tax Systems, Government Portals, Statutory Systems, validations, calculations, approvals, and reports.

Coverage: Banking APIs, Bulk Payment, Payment Files, UPI, Payment Gateways, Tax Systems, Government Portals, Statutory Systems, Pension Providers, Insurance Providers, Payroll Vendors.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Payroll, Bank and Tax Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Finance and Statutory Configuration, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.9 Recruitment Integrations

**SR-27.9-01:** The platform shall expose governed integration capabilities for Recruitment Integrations, covering Job Boards, Career Sites, Social Platforms, Assessment Providers, Background Verification Providers, Recruitment Agencies, Calendar Systems, Video Interview Platforms, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Job Boards, Career Sites, Social Platforms, Assessment Providers, Background Verification Providers, Recruitment Agencies, Calendar Systems, Video Interview Platforms, Resume Databases.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Recruitment Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Organization Foundation, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.10 Learning Integrations

**SR-27.10-01:** The platform shall expose governed integration capabilities for Learning Integrations, covering Content Providers, SCORM, xAPI, Virtual Classroom, Webinar Platforms, Certification Providers, External LMS, Learning Marketplaces, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Content Providers, SCORM, xAPI, Virtual Classroom, Webinar Platforms, Certification Providers, External LMS, Learning Marketplaces, Course Libraries.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Learning Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.11 Device and Physical Systems

**SR-27.11-01:** The platform shall maintain complete lifecycle capability for Device and Physical Systems, covering Biometric Devices, Face Recognition Devices, Fingerprint Devices, Access Control, RFID, Barcode, QR Devices, GPS Devices, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Biometric Devices, Face Recognition Devices, Fingerprint Devices, Access Control, RFID, Barcode, QR Devices, GPS Devices, Kiosk Devices, Device Health, Device Synchronization.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Device and Physical Systems according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.12 Communication Integrations

**SR-27.12-01:** The platform shall expose governed integration capabilities for Communication Integrations, covering Email Gateway, SMS Gateway, WhatsApp API, Push Notifications, Microsoft Teams, Slack, Zoom, Google Calendar, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Email Gateway, SMS Gateway, WhatsApp API, Push Notifications, Microsoft Teams, Slack, Zoom, Google Calendar, Microsoft Calendar, Communication Providers.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Communication Integrations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.13 Developer Portal

**SR-27.13-01:** The platform shall expose governed integration capabilities for Developer Portal, covering API Documentation, API Explorer, SDKs, Code Samples, Sandbox, Developer Registration, Application Registration, Usage Dashboard, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: API Documentation, API Explorer, SDKs, Code Samples, Sandbox, Developer Registration, Application Registration, Usage Dashboard, Support, Changelog.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Developer Portal according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.14 API Credentials

**SR-27.14-01:** The platform shall expose governed integration capabilities for API Credentials, covering API Keys, OAuth Clients, Client Secrets, Certificates, Credential Rotation, Credential Expiry, IP Restrictions, Usage Limits, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: API Keys, OAuth Clients, Client Secrets, Certificates, Credential Rotation, Credential Expiry, IP Restrictions, Usage Limits, Credential Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for API Credentials according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Document Management, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.15 Integration Monitoring

**SR-27.15-01:** The platform shall expose governed integration capabilities for Integration Monitoring, covering Integration Runs, Success Status, Failure Status, Error Logs, Retry, Reprocessing, Latency, Throughput, authentication, monitoring, retries, versioning, and reconciliation.

Coverage: Integration Runs, Success Status, Failure Status, Error Logs, Retry, Reprocessing, Latency, Throughput, Integration Alerts, Integration Dashboard.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Integration Monitoring according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Integration runs expose request IDs, delivery status, error messages, retries and reconciliation results.

**Dependency and implementation note:** Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.16 Reconciliation

**SR-27.16-01:** The platform shall maintain complete lifecycle capability for Reconciliation, covering Source Count, Target Count, Record Match, Missing Records, Duplicate Records, Value Differences, Reconciliation Report, Manual Resolution, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Source Count, Target Count, Record Match, Missing Records, Duplicate Records, Value Differences, Reconciliation Report, Manual Resolution, Reconciliation Approval.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Reconciliation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine, Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

#### 27.17 Data Migration

**SR-27.17-01:** The platform shall maintain complete lifecycle capability for Data Migration, covering Source Mapping, Field Mapping, Data Cleansing, Data Transformation, Trial Migration, Validation, Cutover, Rollback, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Source Mapping, Field Mapping, Data Cleansing, Data Transformation, Trial Migration, Validation, Cutover, Rollback, Migration Audit, Migration Reconciliation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Migration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Partially implemented through REST APIs, import/export services and the in-migration Node API.

### Domain 28: Data Governance, Privacy, Audit and Compliance

**Objective:** Domain 28 establishes the platform capabilities for Data Governance, Privacy, Audit and Compliance. It coordinates Data Classification, Data Ownership and Stewardship, Data Quality, Data Lineage and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Partially implemented through authorization audit, Aadhaar protection, and document access controls.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 28.1 | Operational | 11 | Finance and Statutory Configuration |
| 28.2 | Operational | 9 | Workflow Engine |
| 28.3 | Operational | 10 | Platform Foundation |
| 28.4 | Operational | 9 | Integration Platform |
| 28.5 | Operational | 9 | Worker Master |
| 28.6 | Workflow | 10 | Identity and RBAC, Workflow Engine |
| 28.7 | Operational | 10 | Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management |
| 28.8 | Operational | 9 | Platform Foundation |
| 28.9 | Operational | 10 | Integration Platform |
| 28.10 | Operational | 12 | Identity and RBAC, Workflow Engine, Integration Platform |
| 28.11 | Control | 9 | Worker Master, Identity and RBAC |
| 28.12 | Operational | 9 | Identity and RBAC, Workflow Engine |
| 28.13 | Operational | 9 | Integration Platform |
| 28.14 | Control | 10 | Identity and RBAC |
| 28.15 | Operational | 11 | Platform Foundation |

#### 28.1 Data Classification

**SR-28.1-01:** The platform shall maintain complete lifecycle capability for Data Classification, covering Public Data, Internal Data, Confidential Data, Restricted Data, Sensitive Personal Data, Financial Data, Payroll Data, Medical Data, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Public Data, Internal Data, Confidential Data, Restricted Data, Sensitive Personal Data, Financial Data, Payroll Data, Medical Data, Background Verification Data, Legal Data, Classification Labels.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Classification according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Finance and Statutory Configuration. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.2 Data Ownership and Stewardship

**SR-28.2-01:** The platform shall maintain complete lifecycle capability for Data Ownership and Stewardship, covering Data Owner, Data Steward, Business Owner, Technical Owner, Data Custodian, Ownership Approval, Stewardship Tasks, Data Accountability, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Data Owner, Data Steward, Business Owner, Technical Owner, Data Custodian, Ownership Approval, Stewardship Tasks, Data Accountability, Ownership History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Ownership and Stewardship according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.3 Data Quality

**SR-28.3-01:** The platform shall maintain complete lifecycle capability for Data Quality, covering Completeness, Accuracy, Consistency, Validity, Uniqueness, Timeliness, Data Quality Rules, Data Quality Score, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Completeness, Accuracy, Consistency, Validity, Uniqueness, Timeliness, Data Quality Rules, Data Quality Score, Data Correction, Data Quality Dashboard.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Quality according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.4 Data Lineage

**SR-28.4-01:** The platform shall maintain complete lifecycle capability for Data Lineage, covering Source System, Target System, Data Transformation, Data Flow, Field Lineage, Report Lineage, Integration Lineage, Data Usage, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Source System, Target System, Data Transformation, Data Flow, Field Lineage, Report Lineage, Integration Lineage, Data Usage, Lineage Visualization.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Lineage according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.5 Consent and Legal Basis

**SR-28.5-01:** The platform shall maintain complete lifecycle capability for Consent and Legal Basis, covering Employee Consent, Candidate Consent, Dependent Consent, Marketing Consent, Processing Purpose, Legal Basis, Consent Version, Consent Withdrawal, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Employee Consent, Candidate Consent, Dependent Consent, Marketing Consent, Processing Purpose, Legal Basis, Consent Version, Consent Withdrawal, Consent History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Consent and Legal Basis according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.6 Privacy Requests

**SR-28.6-01:** The platform shall maintain complete lifecycle capability for Privacy Requests, covering Data Access Request, Data Correction Request, Data Deletion Request, Data Portability, Processing Restriction, Objection Request, Request Verification, Request Fulfillment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Data Access Request, Data Correction Request, Data Deletion Request, Data Portability, Processing Restriction, Objection Request, Request Verification, Request Fulfillment, Request SLA, Request History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Privacy Requests according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.7 Retention and Deletion

**SR-28.7-01:** The platform shall maintain complete lifecycle capability for Retention and Deletion, covering Retention Schedule, Retention Period, Employee Retention, Candidate Retention, Payroll Retention, Document Retention, Medical Record Retention, Scheduled Deletion, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Retention Schedule, Retention Period, Employee Retention, Candidate Retention, Payroll Retention, Document Retention, Medical Record Retention, Scheduled Deletion, Deletion Approval, Deletion Certificate.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Retention and Deletion according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Finance and Statutory Configuration, Workflow Engine, Document Management. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.8 Data Residency

**SR-28.8-01:** The platform shall maintain complete lifecycle capability for Data Residency, covering Country Residency, Region Residency, Tenant Residency, Storage Region, Backup Region, Cross-Border Transfer, Residency Validation, Residency Alerts, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Country Residency, Region Residency, Tenant Residency, Storage Region, Backup Region, Cross-Border Transfer, Residency Validation, Residency Alerts, Residency Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Residency according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.9 Data Protection

**SR-28.9-01:** The platform shall maintain complete lifecycle capability for Data Protection, covering Encryption at Rest, Encryption in Transit, Field Encryption, Tokenization, Data Masking, Redaction, Key Management, Secrets Management, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Encryption at Rest, Encryption in Transit, Field Encryption, Tokenization, Data Masking, Redaction, Key Management, Secrets Management, Secure Download, Secure Export.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Protection according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.10 Audit Logs

**SR-28.10-01:** The platform shall maintain complete lifecycle capability for Audit Logs, covering Login Logs, User Activity Logs, Record Access Logs, Record Change Logs, Approval Logs, API Logs, Export Logs, Download Logs, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Login Logs, User Activity Logs, Record Access Logs, Record Change Logs, Approval Logs, API Logs, Export Logs, Download Logs, Admin Logs, Privileged Access Logs, Security Logs, Error Logs.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Audit Logs according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine, Integration Platform. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.11 Access Reviews

**SR-28.11-01:** The platform shall enforce secure, auditable controls for Access Reviews, covering Role Review, Permission Review, Sensitive Access Review, Privileged Access Review, Manager Certification, Access Removal, Access Exceptions, Review History, policy evaluation, exception handling, and administrative review.

Coverage: Role Review, Permission Review, Sensitive Access Review, Privileged Access Review, Manager Certification, Access Removal, Access Exceptions, Review History, Review Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Access Reviews according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Identity and RBAC. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.12 Segregation of Duties

**SR-28.12-01:** The platform shall maintain complete lifecycle capability for Segregation of Duties, covering Conflict Rules, Conflicting Roles, Conflicting Permissions, Risk Assessment, Mitigation, Exception Approval, SoD Monitoring, SoD Report, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Conflict Rules, Conflicting Roles, Conflicting Permissions, Risk Assessment, Mitigation, Exception Approval, SoD Monitoring, SoD Report, Conflict Resolution.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Segregation of Duties according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.13 Legal Hold and eDiscovery

**SR-28.13-01:** The platform shall maintain complete lifecycle capability for Legal Hold and eDiscovery, covering Legal Hold, Hold Scope, Custodians, Data Preservation, Search, Collection, Export, Release Hold, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Legal Hold, Hold Scope, Custodians, Data Preservation, Search, Collection, Export, Release Hold, Legal Hold Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Legal Hold and eDiscovery according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.14 Privacy and Security Incidents

**SR-28.14-01:** The platform shall enforce secure, auditable controls for Privacy and Security Incidents, covering Incident Reporting, Data Breach, Privacy Incident, Incident Classification, Impact Assessment, Containment, Notification, Remediation, policy evaluation, exception handling, and administrative review.

Coverage: Incident Reporting, Data Breach, Privacy Incident, Incident Classification, Impact Assessment, Containment, Notification, Remediation, Incident Closure, Incident History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Privacy and Security Incidents according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

#### 28.15 Compliance Frameworks

**SR-28.15-01:** The platform shall maintain complete lifecycle capability for Compliance Frameworks, covering GDPR, SOC 2, ISO 27001, HIPAA Where Applicable, Local Privacy Laws, Labor Compliance, Financial Controls, Data Protection Laws, role-based operations, validation, status changes, reporting, and audit history.

Coverage: GDPR, SOC 2, ISO 27001, HIPAA Where Applicable, Local Privacy Laws, Labor Compliance, Financial Controls, Data Protection Laws, Audit Evidence, Compliance Certification, Compliance Dashboard.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Compliance Frameworks according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Partially implemented through authorization audit, Aadhaar protection, and document access controls.

### Domain 29: Platform Operations, Monitoring, Backup and Disaster Recovery

**Objective:** Domain 29 establishes the platform capabilities for Platform Operations, Monitoring, Backup and Disaster Recovery. It coordinates System Health, Observability, Logging, Monitoring and Alerting and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 29.1 | Operational | 10 | Integration Platform |
| 29.2 | Operational | 10 | Workflow Engine |
| 29.3 | Operational | 11 | Organization Foundation, Identity and RBAC, Integration Platform |
| 29.4 | Operational | 11 | Organization Foundation, Identity and RBAC, Integration Platform |
| 29.5 | Operational | 11 | Platform Foundation |
| 29.6 | Operational | 12 | Organization Foundation, Finance and Statutory Configuration, Document Management, Integration Platform |
| 29.7 | Operational | 11 | Organization Foundation |
| 29.8 | Operational | 11 | Document Management |
| 29.9 | Operational | 10 | Platform Foundation |
| 29.10 | Operational | 9 | Platform Foundation |
| 29.11 | Operational | 11 | Platform Foundation |
| 29.12 | Operational | 10 | Identity and RBAC |
| 29.13 | Operational | 11 | Workflow Engine |
| 29.14 | Operational | 11 | Identity and RBAC |
| 29.15 | Operational | 10 | Integration Platform |
| 29.16 | Operational | 10 | Platform Foundation |

#### 29.1 System Health

**SR-29.1-01:** The platform shall maintain complete lifecycle capability for System Health, covering Application Health, Database Health, Cache Health, Queue Health, Search Health, Storage Health, Integration Health, Notification Health, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Application Health, Database Health, Cache Health, Queue Health, Search Health, Storage Health, Integration Health, Notification Health, Service Dependencies, Health Dashboard.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for System Health according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.2 Observability

**SR-29.2-01:** The platform shall maintain complete lifecycle capability for Observability, covering Logs, Metrics, Traces, Events, Dashboards, Correlation IDs, Service Maps, Request Tracing, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Logs, Metrics, Traces, Events, Dashboards, Correlation IDs, Service Maps, Request Tracing, User Journey Tracing, Distributed Tracing.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Observability according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.3 Logging

**SR-29.3-01:** The platform shall maintain complete lifecycle capability for Logging, covering Application Logs, Error Logs, API Logs, Database Logs, Security Logs, Integration Logs, Job Logs, Audit Logs, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Application Logs, Error Logs, API Logs, Database Logs, Security Logs, Integration Logs, Job Logs, Audit Logs, Log Search, Log Retention, Log Export.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Logging according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.4 Monitoring and Alerting

**SR-29.4-01:** The platform shall maintain complete lifecycle capability for Monitoring and Alerting, covering Service Alerts, Error Alerts, Performance Alerts, Security Alerts, Capacity Alerts, Integration Alerts, Job Failure Alerts, Database Alerts, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Service Alerts, Error Alerts, Performance Alerts, Security Alerts, Capacity Alerts, Integration Alerts, Job Failure Alerts, Database Alerts, Alert Routing, Alert Escalation, Alert History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Monitoring and Alerting according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.5 Capacity and Scaling

**SR-29.5-01:** The platform shall maintain complete lifecycle capability for Capacity and Scaling, covering Concurrent Users, Transaction Volume, Database Capacity, Storage Capacity, Queue Capacity, Search Capacity, Horizontal Scaling, Vertical Scaling, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Concurrent Users, Transaction Volume, Database Capacity, Storage Capacity, Queue Capacity, Search Capacity, Horizontal Scaling, Vertical Scaling, Auto Scaling, Capacity Forecast, Capacity Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Capacity and Scaling according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.6 Background Jobs

**SR-29.6-01:** The platform shall maintain complete lifecycle capability for Background Jobs, covering Job Queue, Batch Jobs, Scheduled Jobs, Payroll Jobs, Import Jobs, Export Jobs, Document Jobs, Notification Jobs, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Job Queue, Batch Jobs, Scheduled Jobs, Payroll Jobs, Import Jobs, Export Jobs, Document Jobs, Notification Jobs, Analytics Jobs, Job Retry, Dead Jobs, Job Monitoring.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Background Jobs according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Finance and Statutory Configuration, Document Management, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.7 Job Scheduler

**SR-29.7-01:** The platform shall maintain complete lifecycle capability for Job Scheduler, covering Scheduled Time, Recurrence, Dependencies, Job Priority, Time Zone, Holiday Rules, Job Calendar, Manual Trigger, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Scheduled Time, Recurrence, Dependencies, Job Priority, Time Zone, Holiday Rules, Job Calendar, Manual Trigger, Pause, Resume, Job History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Job Scheduler according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.8 Backup and Restore

**SR-29.8-01:** The platform shall maintain complete lifecycle capability for Backup and Restore, covering Database Backup, Document Backup, Configuration Backup, Incremental Backup, Full Backup, Backup Encryption, Backup Verification, Restore, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Database Backup, Document Backup, Configuration Backup, Incremental Backup, Full Backup, Backup Encryption, Backup Verification, Restore, Point-in-Time Recovery, Restore Testing, Backup History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Backup and Restore according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.9 Disaster Recovery

**SR-29.9-01:** The platform shall maintain complete lifecycle capability for Disaster Recovery, covering Recovery Region, Failover, Failback, Recovery Point Objective, Recovery Time Objective, DR Replication, DR Testing, DR Runbook, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Recovery Region, Failover, Failback, Recovery Point Objective, Recovery Time Objective, DR Replication, DR Testing, DR Runbook, DR Audit, Recovery History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Disaster Recovery according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.10 Business Continuity

**SR-29.10-01:** The platform shall maintain complete lifecycle capability for Business Continuity, covering Business Impact Analysis, Critical Services, Continuity Plan, Manual Procedures, Communication Plan, Continuity Test, Continuity Review, Service Restoration, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Business Impact Analysis, Critical Services, Continuity Plan, Manual Procedures, Communication Plan, Continuity Test, Continuity Review, Service Restoration, Continuity Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Business Continuity according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.11 Incident and Problem Management

**SR-29.11-01:** The platform shall maintain complete lifecycle capability for Incident and Problem Management, covering Incident, Severity, Assignment, Response, Resolution, Root Cause, Problem Record, Corrective Action, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Incident, Severity, Assignment, Response, Resolution, Root Cause, Problem Record, Corrective Action, Preventive Action, Post-Incident Review, Incident History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Incident and Problem Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.12 Vulnerability and Patch Management

**SR-29.12-01:** The platform shall maintain complete lifecycle capability for Vulnerability and Patch Management, covering Vulnerability Scan, Dependency Scan, Container Scan, Code Scan, Patch Plan, Patch Deployment, Security Update, Exception, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Vulnerability Scan, Dependency Scan, Container Scan, Code Scan, Patch Plan, Patch Deployment, Security Update, Exception, Remediation Tracking, Vulnerability Report.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Vulnerability and Patch Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.13 Release and Deployment

**SR-29.13-01:** The platform shall maintain complete lifecycle capability for Release and Deployment, covering Release Plan, Build, Test, Approval, Deployment, Canary Release, Blue-Green Deployment, Rolling Deployment, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Release Plan, Build, Test, Approval, Deployment, Canary Release, Blue-Green Deployment, Rolling Deployment, Rollback, Release Notes, Release History.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Release and Deployment according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.14 Environment Management

**SR-29.14-01:** The platform shall maintain complete lifecycle capability for Environment Management, covering Development, Testing, QA, UAT, Staging, Production, Environment Variables, Configuration Promotion, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Development, Testing, QA, UAT, Staging, Production, Environment Variables, Configuration Promotion, Data Refresh, Environment Access, Environment Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Environment Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.15 Performance Management

**SR-29.15-01:** The platform shall maintain complete lifecycle capability for Performance Management, covering Load Testing, Stress Testing, Endurance Testing, API Performance, Database Performance, Frontend Performance, Mobile Performance, Search Performance, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Load Testing, Stress Testing, Endurance Testing, API Performance, Database Performance, Frontend Performance, Mobile Performance, Search Performance, Performance Baseline, Regression Detection.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Performance Management according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 29.16 Service Levels

**SR-29.16-01:** The platform shall maintain complete lifecycle capability for Service Levels, covering SLA, SLO, Availability, Response Time, Throughput, Error Rate, Uptime, Downtime, role-based operations, validation, status changes, reporting, and audit history.

Coverage: SLA, SLO, Availability, Response Time, Throughput, Error Rate, Uptime, Downtime, Service Credits, Service Reports.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Service Levels according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

### Domain 30: Administration and Protected Super Admin

**Objective:** Domain 30 establishes the platform capabilities for Administration and Protected Super Admin. It coordinates Tenant Administration, Company Administration, User Administration, Role and Permission Administration and related subdomains into a governed, tenant-aware HRMS experience.

**Implementation status:** Future-state capability to be implemented or expanded in the target HRMS platform.

| Subdomain | Capability type | Feature count | Primary dependency |
| --- | --- | --- | --- |
| 30.1 | Operational | 9 | Platform Foundation |
| 30.2 | Operational | 9 | Organization Foundation |
| 30.3 | Operational | 10 | Integration Platform |
| 30.4 | Control | 10 | Identity and RBAC |
| 30.5 | Operational | 11 | Worker Master, Organization Foundation |
| 30.6 | Operational | 9 | Organization Foundation, Integration Platform |
| 30.7 | Control | 11 | Identity and RBAC, Finance and Statutory Configuration, Document Management |
| 30.8 | Operational | 10 | Document Management, Integration Platform |
| 30.9 | Workflow | 9 | Workflow Engine |
| 30.10 | Operational | 10 | Document Management |
| 30.11 | Operational | 9 | Platform Foundation |
| 30.12 | Operational | 9 | Integration Platform |
| 30.13 | Operational | 9 | Organization Foundation, Identity and RBAC |
| 30.14 | Operational | 10 | Worker Master |
| 30.15 | Operational | 12 | Worker Master, Organization Foundation, Finance and Statutory Configuration, Document Management |
| 30.16 | Operational | 10 | Integration Platform |
| 30.17 | Operational | 11 | Identity and RBAC, Workflow Engine, Integration Platform |
| 30.18 | Operational | 9 | Identity and RBAC, Workflow Engine |
| 30.19 | Operational | 12 | Organization Foundation, Identity and RBAC |
| 30.20 | Operational | 10 | Identity and RBAC, Workflow Engine |

#### 30.1 Tenant Administration

**SR-30.1-01:** The platform shall maintain complete lifecycle capability for Tenant Administration, covering Tenant Setup, Tenant Configuration, Tenant Branding, Tenant Features, Tenant Limits, Tenant Status, Tenant Data, Tenant Subscription, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Tenant Setup, Tenant Configuration, Tenant Branding, Tenant Features, Tenant Limits, Tenant Status, Tenant Data, Tenant Subscription, Tenant Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Tenant Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.2 Company Administration

**SR-30.2-01:** The platform shall maintain complete lifecycle capability for Company Administration, covering Company Setup, Legal Entity Setup, Branch Setup, Location Setup, Department Setup, Cost Center Setup, Company Calendar, Company Policies, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Company Setup, Legal Entity Setup, Branch Setup, Location Setup, Department Setup, Cost Center Setup, Company Calendar, Company Policies, Company Branding.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Company Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.3 User Administration

**SR-30.3-01:** The platform shall maintain complete lifecycle capability for User Administration, covering User Creation, User Update, User Activation, User Deactivation, User Suspension, Password Reset, Account Unlock, User Import, role-based operations, validation, status changes, reporting, and audit history.

Coverage: User Creation, User Update, User Activation, User Deactivation, User Suspension, Password Reset, Account Unlock, User Import, User Export, User Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for User Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.4 Role and Permission Administration

**SR-30.4-01:** The platform shall enforce secure, auditable controls for Role and Permission Administration, covering Role Creation, Role Assignment, Permission Assignment, Permission Matrix, Role Comparison, Role Clone, Temporary Permission, Role Expiry, policy evaluation, exception handling, and administrative review.

Coverage: Role Creation, Role Assignment, Permission Assignment, Permission Matrix, Role Comparison, Role Clone, Temporary Permission, Role Expiry, Permission Audit, Access Review.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Role and Permission Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.5 Data Scope Administration

**SR-30.5-01:** The platform shall maintain complete lifecycle capability for Data Scope Administration, covering Company Scope, Legal Entity Scope, Department Scope, Branch Scope, Location Scope, Cost Center Scope, Manager Scope, Employee Scope, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Company Scope, Legal Entity Scope, Department Scope, Branch Scope, Location Scope, Cost Center Scope, Manager Scope, Employee Scope, Country Scope, Sensitive Data Scope, Scope Exceptions.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Scope Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.6 Organization Administration

**SR-30.6-01:** The platform shall maintain complete lifecycle capability for Organization Administration, covering Organization Structure, Job Structure, Position Structure, Reporting Structure, Cost Center Structure, Organization Changes, Effective Dates, Hierarchy Validation, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Organization Structure, Job Structure, Position Structure, Reporting Structure, Cost Center Structure, Organization Changes, Effective Dates, Hierarchy Validation, Organization Import.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Organization Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.7 Policy Administration

**SR-30.7-01:** The platform shall maintain complete lifecycle capability for Policy Administration, covering Attendance Policies, Shift Policies, Leave Policies, Payroll Policies, Expense Policies, Travel Policies, Benefit Policies, Performance Policies, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Attendance Policies, Shift Policies, Leave Policies, Payroll Policies, Expense Policies, Travel Policies, Benefit Policies, Performance Policies, Learning Policies, Security Policies, Policy Assignment.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Policy Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.8 Master Data Administration

**SR-30.8-01:** The platform shall maintain complete lifecycle capability for Master Data Administration, covering Global Masters, Country Masters, Employment Masters, Document Masters, Reason Codes, Status Codes, Lookup Tables, Reference Data Import, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Global Masters, Country Masters, Employment Masters, Document Masters, Reason Codes, Status Codes, Lookup Tables, Reference Data Import, Master Data Audit, Duplicate Management.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Master Data Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.9 Workflow Administration

**SR-30.9-01:** The platform shall support configurable workflows for Workflow Administration, including Workflow Configuration, Business Rules, Approval Rules, Delegation Rules, Escalation Rules, SLA Rules, Workflow Monitoring, Failed Workflow Recovery, routing, delegation, escalation, status tracking, and audit evidence.

Coverage: Workflow Configuration, Business Rules, Approval Rules, Delegation Rules, Escalation Rules, SLA Rules, Workflow Monitoring, Failed Workflow Recovery, Workflow Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Workflow Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Requests expose status, approver, SLA, delegation, escalation and decision history from submission through closure.

**Dependency and implementation note:** Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.10 Template Administration

**SR-30.10-01:** The platform shall maintain complete lifecycle capability for Template Administration, covering Email Templates, SMS Templates, WhatsApp Templates, Push Templates, Letter Templates, Document Templates, Report Templates, Survey Templates, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Email Templates, SMS Templates, WhatsApp Templates, Push Templates, Letter Templates, Document Templates, Report Templates, Survey Templates, Form Templates, Template Versioning.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Template Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.11 Notification Administration

**SR-30.11-01:** The platform shall maintain complete lifecycle capability for Notification Administration, covering Notification Channels, Provider Configuration, Sender Configuration, Event Mapping, Template Mapping, Notification Preferences, Retry Rules, Delivery Monitoring, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Notification Channels, Provider Configuration, Sender Configuration, Event Mapping, Template Mapping, Notification Preferences, Retry Rules, Delivery Monitoring, Notification Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Notification Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Platform Foundation. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.12 Localization Administration

**SR-30.12-01:** The platform shall maintain complete lifecycle capability for Localization Administration, covering Languages, Translations, Currency, Time Zones, Date Formats, Number Formats, Regional Settings, Country Configuration, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Languages, Translations, Currency, Time Zones, Date Formats, Number Formats, Regional Settings, Country Configuration, Localization Import.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Localization Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.13 Feature Administration

**SR-30.13-01:** The platform shall maintain complete lifecycle capability for Feature Administration, covering Feature Flags, Tenant Features, Company Features, Role Features, Pilot Users, Rollout Percentage, Feature Dependencies, Feature Rollback, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Feature Flags, Tenant Features, Company Features, Role Features, Pilot Users, Rollout Percentage, Feature Dependencies, Feature Rollback, Feature Audit.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Feature Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.14 License and Subscription

**SR-30.14-01:** The platform shall maintain complete lifecycle capability for License and Subscription, covering License Plan, User Limit, Employee Limit, Module License, Usage Tracking, Renewal, Expiry, Billing, role-based operations, validation, status changes, reporting, and audit history.

Coverage: License Plan, User Limit, Employee Limit, Module License, Usage Tracking, Renewal, Expiry, Billing, Subscription History, License Alerts.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for License and Subscription according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.15 Bulk Operations

**SR-30.15-01:** The platform shall maintain complete lifecycle capability for Bulk Operations, covering Bulk Employee Update, Bulk Candidate Update, Bulk Organization Update, Bulk Position Update, Bulk Attendance, Bulk Leave, Bulk Payroll, Bulk Transfer, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Bulk Employee Update, Bulk Candidate Update, Bulk Organization Update, Bulk Position Update, Bulk Attendance, Bulk Leave, Bulk Payroll, Bulk Transfer, Bulk Promotion, Bulk Separation, Bulk Document Generation, Bulk Notification.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Bulk Operations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Worker Master, Organization Foundation, Finance and Statutory Configuration, Document Management. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.16 Data Import Administration

**SR-30.16-01:** The platform shall maintain complete lifecycle capability for Data Import Administration, covering Import Template, Field Mapping, Validation, Preview, Import, Success Records, Failed Records, Error Download, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Import Template, Field Mapping, Validation, Preview, Import, Success Records, Failed Records, Error Download, Import History, Import Rollback.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Data Import Administration according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.17 Audit Console

**SR-30.17-01:** The platform shall maintain complete lifecycle capability for Audit Console, covering User Audit, Permission Audit, Data Audit, API Audit, Workflow Audit, Export Audit, Login Audit, Privileged Audit, role-based operations, validation, status changes, reporting, and audit history.

Coverage: User Audit, Permission Audit, Data Audit, API Audit, Workflow Audit, Export Audit, Login Audit, Privileged Audit, Security Audit, Audit Search, Audit Export.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Audit Console according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine, Integration Platform. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.18 Support Operations

**SR-30.18-01:** The platform shall maintain complete lifecycle capability for Support Operations, covering Support Cases, Tenant Support, Diagnostic Data, Configuration Snapshot, Health Snapshot, Support Access, Support Notes, Support History, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Support Cases, Tenant Support, Diagnostic Data, Configuration Snapshot, Health Snapshot, Support Access, Support Notes, Support History, Support SLA.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Support Operations according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.19 Protected Super Admin

**SR-30.19-01:** The platform shall maintain complete lifecycle capability for Protected Super Admin, covering Global Tenant Access, Global Company Access, Global User Access, Global Role Access, Global Configuration, Global Feature Management, Global Monitoring, Global Audit, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Global Tenant Access, Global Company Access, Global User Access, Global Role Access, Global Configuration, Global Feature Management, Global Monitoring, Global Audit, License Management, Subscription Management, Emergency Recovery, System-Wide Search.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Protected Super Admin according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Organization Foundation, Identity and RBAC. Future-state capability to be implemented or expanded in the target HRMS platform.

#### 30.20 Break-Glass and Impersonation

**SR-30.20-01:** The platform shall maintain complete lifecycle capability for Break-Glass and Impersonation, covering Emergency Access, Reason Required, Approval Required, Time-Limited Access, Read-Only Impersonation, Controlled Write Access, Session Recording, User Notification, role-based operations, validation, status changes, reporting, and audit history.

Coverage: Emergency Access, Reason Required, Approval Required, Time-Limited Access, Read-Only Impersonation, Controlled Write Access, Session Recording, User Notification, Complete Audit, Automatic Revocation.

**Acceptance criteria:**
- Authorized users can search, view, create or update records for Break-Glass and Impersonation according to assigned permissions.
- All material changes are validated, versioned where applicable, and written to audit history with actor, timestamp, old value and new value.
- Tenant, company, country and role scope are enforced before any record is shown or changed.
- Inactive, historical or future-dated records remain reportable without corrupting current operational views.

**Dependency and implementation note:** Identity and RBAC, Workflow Engine. Future-state capability to be implemented or expanded in the target HRMS platform.

## 8. Non-Functional Requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-01 | Security | All authentication, authorization, privileged access, impersonation and API credentials shall be governed by explicit policy and complete audit history. |
| NFR-02 | Privacy | The system shall support consent, legal basis, data access, correction, deletion, retention, residency and legal hold obligations. |
| NFR-03 | Availability | Core employee, manager, HR, payroll and attendance services shall be monitored with defined SLAs, alerts and disaster recovery objectives. |
| NFR-04 | Performance | Operational pages shall support efficient search and filtering at enterprise scale; batch jobs shall expose progress, failure and retry state. |
| NFR-05 | Auditability | Every security, payroll, employee data, workflow, export, integration and privileged action shall be searchable in audit logs. |
| NFR-06 | Configurability | Policies, workflows, notifications, numbering, localization, feature flags and master data shall be tenant/company configurable. |
| NFR-07 | Interoperability | REST APIs, webhooks, imports, exports and integration catalogs shall support controlled enterprise integration. |
| NFR-08 | Usability | Role-specific dashboards and workspaces shall minimize clicks for common employee, manager, HR, payroll and admin tasks. |
| NFR-09 | Maintainability | Requirements shall remain traceable to domains, subdomains, tests, API contracts and release notes. |
| NFR-10 | AI Governance | AI features shall implement prompt governance, model approval, data boundaries, human review, feedback, monitoring and usage logs. |

## 9. Phasing Recommendation

| Phase | Focus | Representative domains |
| --- | --- | --- |
| Phase 0 | Foundation, security, tenancy, master data, audit and platform operations | 00, 01, 02, 03, 28, 29, 30 |
| Phase 1 | Employee core, dashboards, workflow, attendance, leave, payroll and documents | 04, 05, 06, 07, 08, 09, 16 |
| Phase 2 | Recruitment, onboarding, performance, learning, engagement and service delivery | 10, 11, 12, 13, 14, 15, 17, 18 |
| Phase 3 | Expenses, travel, assets, workforce planning, analytics, AI and integrations | 19, 20, 21, 22, 23, 24, 25, 26, 27 |

## 10. Open Items

- Confirm final module naming, product branding and regulatory geography before implementation sign-off.
- Confirm which countries and statutory payroll regimes are in the first production release.
- Confirm target SLA, RPO and RTO values with operations and business leadership.
- Confirm AI model/provider choices, data retention policy and human-review requirements before enabling AI features.

## Appendix A: Requirement ID Convention

- `SR-<domain>.<subdomain>-01` identifies the grouped functional requirement for a source subdomain.
- `XR-*` identifies cross-cutting requirements that apply across multiple domains.
- `NFR-*` identifies non-functional requirements.

## Appendix B: Repository Source Notes

- `docs/00-OVERVIEW.md` establishes the active product architecture and clarifies dormant projects.
- `docs/functional-analysis-report/README.md` indexes the source-grounded functional analysis report.
- `docs/master-prompt-DOMAIN-02.md` demonstrates the preferred implementation specificity for a domain-level build prompt.

## Appendix C: Assumptions

- The pasted 30-domain catalog is authoritative for future-state functional scope.
- Current repository notes are used for implementation alignment, not to restrict future-state product requirements.
- Requirement grouping is intentional to keep the SRS useful for review and delivery planning.
- Detailed API, database and UI specifications should be produced per phase after this Master SRS is approved.
