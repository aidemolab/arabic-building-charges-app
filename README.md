# Arabic Building Charges App

An Arabic, right-to-left web application for managing building units, owners, tenants, actual payments and financial forecasts.

The project replaces a manually maintained Excel workbook with a structured application that supports secure access, validated data entry, reporting and financial oversight.

## Project purpose

The application is designed for a residential occupiers’ association that needs to:

- maintain building and unit records;
- associate owners and tenants with their units;
- record and review monthly payments;
- distinguish actual payments from future forecasts;
- search and filter records in Arabic;
- export reports to Excel;
- retain a controlled history of post-import changes.

The client-facing interface is entirely in Arabic and uses a right-to-left layout.

## Core features

### Arabic dashboard

- Actual payments summary
- July–December forecast summary
- Monthly actual-versus-forecast chart
- Unit and resident breakdown
- Combined filtering by:
  - Arabic name
  - owner or tenant status
  - month
  - unit
  - floor
  - building
  - payment status, when amounts due are available

### Data management

- Create, update and archive buildings
- Create, update and archive units
- Manage owners and tenants
- Record actual payments
- Create and approve forecasts
- Cancel incorrect financial records without permanently deleting their history

### Excel import and export

- Upload and preview an Excel workbook before import
- Validate Arabic headers and source rows
- Preserve Arabic names exactly as supplied
- Skip blank monthly cells rather than treating them as zero
- Prevent duplicate units and monthly records
- Export filtered financial records to Excel

### Roles and access

The target application supports three roles:

| Role | Access |
|---|---|
| Administrator | Full access, user management, imports, forecast approval and audit review |
| Data entry | Create and update operational records within approved limits |
| View only | View dashboards and reports without changing data |

## Financial data rules

The initial source workbook is interpreted using the following approved rules:

- January–June 2026 values are actual payments already received.
- July–December 2026 values are forecasts and must remain separate from actual payments.
- Blank cells do not represent zero payments.
- Blank cells do not automatically represent arrears.
- Forecast values must never be recorded as actual payments.
- A collection rate is shown only when valid amounts-due data exists.
- The application uses Egyptian pounds, displayed as `ج.م`.

## Audit behaviour

The initial Excel import establishes the baseline dataset and is not shown as thousands of individual user actions.

The client-facing audit log begins after the baseline import and records subsequent manual actions, including:

- record creation;
- updates;
- archiving;
- payment cancellation;
- forecast changes;
- responsible user and timestamp;
- previous and new values where relevant.

Import processing remains available as internal metadata for recovery and traceability.

## Target architecture

| Component | Responsibility |
|---|---|
| React and TypeScript | Arabic right-to-left user interface |
| Supabase PostgreSQL | Persistent relational data |
| Supabase Auth | Secure email-based authentication |
| Supabase Row Level Security | Database-enforced roles and permissions |
| Replit | Development, testing, preview and deployment |
| GitHub | Authoritative source code and version history |

## Development workflow

The project follows an AI-assisted but human-controlled workflow:

| Platform | Role |
|---|---|
| ChatGPT | Architecture, project management and technical coaching |
| Codex | Primary software engineering and GitHub control |
| GitHub | Source of truth |
| Replit | Live development, testing, preview and deployment |
| Claude | Independent code review and documentation review |

Feature work should follow this sequence:

1. Requirements and acceptance criteria are agreed.
2. Codex implements the feature on a dedicated branch.
3. The feature is previewed and tested in Replit.
4. Claude reviews the pull request and documentation.
5. Codex addresses approved findings.
6. The feature is merged into `main` and deployed.

## Security and privacy

- Application routes require authentication.
- Supabase Row Level Security protects application tables.
- Credentials and service keys must never be committed to GitHub.
- Client Excel workbooks and exported personal data must not be committed.
- Personal names, payment records and contact information remain outside the repository.
- Financial records are cancelled or archived rather than silently deleted.
- `.env` files must remain excluded from version control.

## Repository data policy

This repository may contain:

- application source code;
- database migrations;
- automated tests;
- non-sensitive technical documentation;
- anonymised fixtures for testing.

It must not contain:

- the original client workbook;
- real owner or tenant names;
- payment exports;
- passwords;
- Supabase secret keys;
- Replit secrets;
- production database backups.

## Current status

The project is in active development.

- Client project brief approved
- Arabic application prototype created
- Initial Excel import workflow tested
- Supabase project and protected application schema created
- Supabase authentication integration in progress
- Replit source migration to this GitHub repository pending

## Documentation roadmap

The repository will be expanded with:

- application setup guide;
- database and migration guide;
- Excel import specification;
- testing checklist;
- deployment guide;
- Arabic administrator guide;
- change log.

## Licence

This is currently a private client project. No open-source licence has been assigned.
