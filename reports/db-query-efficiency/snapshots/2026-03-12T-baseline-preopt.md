# Database Query Efficiency Report

Generated: 2026-03-12T15:25:30.786Z
Label: 2026-03-12T-baseline-preopt
Database: postgresql://ship:***@localhost:5433/ship_dev

## How To Read This Report

- **Workflow** = a full user action, such as loading a page.
- **Request** = one HTTP call made during that workflow.
- **SQL query** = one database statement executed inside a request.
- Workflow DB time is the sum of SQL query time across all requests in that workflow.
- Request DB time is the sum of SQL query time inside that single request.

## Methodology

- Source of truth: live API route tracing against the real Express app, not copied SQL.
- Authentication: session cookie auth, so auth middleware queries are included.
- Query capture: every `pool.query()` emitted during each request.
- Plan analysis: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` rerun only for observed read queries.
- N+1 detection: flags correlated SQL subplans and repeated child lookups whose count scales with parent rows inside a request.
- Flow mapping uses the frontend routes and API calls the UI actually makes on initial load.

## Workflow Summary

| Workflow | Total SQL Queries | Slowest SQL Query (ms) | N+1 Detected? |
|---|---:|---:|---|
| Load main page | 9 | 9.18ms | No |
| View a document | 24 | 4.32ms | Yes |
| List issues | 4 | 15.93ms | No |
| Load sprint board | 17 | 1.69ms | No |
| Search content | 5 | 0.57ms | No |

## Workflow Breakdown

### Load main page
_My Week page initial load_

**Workflow Overview**

- Frontend route: `/my-week`
- Total SQL queries: 9
- Total DB time: 39.21ms
- Slowest observed SQL query: 9.18ms
- Sequential scans: No
- Nested loops: Yes

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| dashboard data | `/api/dashboard/my-week` | 200 | 9 | 39.21 |

### View a document
_Unified document page load for "Perf Wiki 0001"_

**Workflow Overview**

- Frontend route: `/documents/7542ec5b-f14b-4c55-9775-fa38d1dce5b5`
- Total SQL queries: 24
- Total DB time: 26.47ms
- Slowest observed SQL query: 4.32ms
- Sequential scans: No
- Nested loops: Yes
- N+1 findings:
  - SubPlan 1 executes 8x (once per outer row) (programs)
  - SubPlan 2 executes 8x (once per outer row) (programs)
  - SubPlan 1 executes 24x (once per outer row) (projects)
  - SubPlan 2 executes 24x (once per outer row) (projects)
  - SubPlan 3 executes 24x (once per outer row) (projects)

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| document | `/api/documents/7542ec5b-f14b-4c55-9775-fa38d1dce5b5` | 200 | 4 | 4.7 |
| document context | `/api/documents/7542ec5b-f14b-4c55-9775-fa38d1dce5b5/context` | 200 | 7 | 6.98 |
| document comments | `/api/documents/7542ec5b-f14b-4c55-9775-fa38d1dce5b5/comments` | 200 | 3 | 2.81 |
| team members | `/api/team/people` | 200 | 4 | 2.95 |
| programs | `/api/programs` | 200 | 3 | 3.83 |
| projects | `/api/projects` | 200 | 3 | 5.2 |

### List issues
_Issues page list query_

**Workflow Overview**

- Frontend route: `/issues`
- Total SQL queries: 4
- Total DB time: 18.68ms
- Slowest observed SQL query: 15.93ms
- Sequential scans: Yes
- Nested loops: Yes
- Unnecessary data fetching:
  - Fetched properties JSON for 160 rows (issues)
  - Fetched properties JSON for 440 rows (issues)

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| issues | `/api/issues` | 200 | 4 | 18.68 |

### Load sprint board
_Team allocation board initial load_

**Workflow Overview**

- Frontend route: `/team/allocation`
- Total SQL queries: 17
- Total DB time: 9.11ms
- Slowest observed SQL query: 1.69ms
- Sequential scans: No
- Nested loops: Yes
- Unnecessary data fetching:
  - Fetched properties JSON for 120 rows (team grid)
  - Fetched properties JSON for 72 rows (team assignments)
  - Fetched properties JSON for 120 rows (team assignments)

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| team grid | `/api/team/grid` | 200 | 7 | 3.99 |
| team projects | `/api/team/projects` | 200 | 4 | 1.52 |
| team assignments | `/api/team/assignments` | 200 | 6 | 3.6 |

### Search content
_Mention search for "Standup"_

**Workflow Overview**

- Frontend route: `/search?q=Standup`
- Total SQL queries: 5
- Total DB time: 1.87ms
- Slowest observed SQL query: 0.57ms
- Sequential scans: No
- Nested loops: No

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| mentions | `/api/search/mentions?q=Standup` | 200 | 5 | 1.87 |

## Individual SQL Query Plans

### List issues / issues (15.93ms)

Workflow request: `issues`

SQL: `SELECT d.id, d.title, d.ticket_number, d.properties->>'state' as state, d.properties->>'priority' as priority, d.properties->>'assignee_id' as assignee_id, CASE WHEN d.propertie...`

```
Sort (7.69ms, 160 rows)
  Nested Loop (7.54ms, 160 rows)
    Hash Join (0.17ms, 160 rows)
      Seq Scan (0ms, 24 rows)
      Hash (0.1ms, 160 rows)
        Index Scan (0.05ms, 160 rows)
    Index Scan (0.04ms, 24 rows)
```

### Load main page / dashboard data (9.18ms)

Workflow request: `dashboard data`

SQL: `SELECT DISTINCT proj.id as project_id, proj.title as project_title, prog.title as program_name FROM documents s JOIN documents proj ON (s.properties->>'project_id')::uuid = proj...`

```
Unique (0.05ms, 0 rows)
  Sort (0.05ms, 0 rows)
    Nested Loop (0.04ms, 0 rows)
      Nested Loop (0.04ms, 0 rows)
        Index Scan (0.04ms, 0 rows)
        Index Scan (0ms, 0 rows)
      Nested Loop (0ms, 0 rows)
        Index Scan (0ms, 0 rows)
        Memoize (0ms, 0 rows)
          Index Scan (0ms, 0 rows)
```

### Load main page / dashboard data (8.11ms)

Workflow request: `dashboard data`

SQL: `SELECT id, title, properties, created_at, updated_at FROM documents WHERE workspace_id = $1 AND document_type = 'standup' AND (properties->>'author_id') = $2 AND (properties->>'...`

```
Sort (0.05ms, 3 rows)
  Index Scan (0.05ms, 3 rows)
```

### Load main page / dashboard data (8.03ms)

Workflow request: `dashboard data`

SQL: `SELECT id, title, properties FROM documents WHERE workspace_id = $1 AND document_type = 'weekly_retro' AND (properties->>'person_id') = $2 AND (properties->>'week_number')::int ...`

```
Limit (0.05ms, 1 rows)
  Index Scan (0.05ms, 1 rows)
```

### Load main page / dashboard data (7.1ms)

Workflow request: `dashboard data`

SQL: `SELECT sprint_start_date FROM workspaces WHERE id = $1`

```
Seq Scan (0ms, 1 rows)
```

### View a document / projects (4.32ms)

Workflow request: `projects`

SQL: `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id, d.archived_at, d.created_at, d.updated_at, d.converted_from_id, (d.properties->>'owner_id')::uuid as owner_...`

```
Sort (0.94ms, 24 rows)
  Hash Join (0.93ms, 24 rows)
    Nested Loop (0.1ms, 24 rows)
      Index Scan (0.05ms, 24 rows)
      Index Scan (0ms, 1 rows)
    Hash (0.02ms, 24 rows)
      Seq Scan (0ms, 24 rows)
    Aggregate (0.01ms, 1 rows)
      Nested Loop (0.01ms, 1 rows)
        Bitmap Heap Scan (0ms, 8 rows)
          Bitmap Index Scan (0ms, 8 rows)
        Memoize (0ms, 0 rows)
          Index Scan (0ms, 0 rows)
    Aggregate (0.01ms, 1 rows)
      Nested Loop (0.01ms, 7 rows)
        Bitmap Heap Scan (0ms, 8 rows)
          Bitmap Index Scan (0ms, 8 rows)
        Memoize (0ms, 1 rows)
          Index Scan (0ms, 1 rows)
    Aggregate (0.01ms, 1 rows)
      Nested Loop (0.01ms, 1 rows)
        Bitmap Heap Scan (0.01ms, 1 rows)
          Bitmap Index Scan (0ms, 24 rows)
        Seq Scan (0ms, 1 rows)
```

### View a document / programs (2.79ms)

Workflow request: `programs`

SQL: `SELECT d.id, d.title, d.properties, d.archived_at, d.created_at, d.updated_at, COALESCE((d.properties->>'owner_id')::uuid, d.created_by) as owner_id, u.name as owner_name, u.ema...`

```
Sort (0.5ms, 8 rows)
  Hash Join (0.49ms, 8 rows)
    Seq Scan (0ms, 24 rows)
    Hash (0.04ms, 8 rows)
      Index Scan (0.04ms, 8 rows)
    Aggregate (0.03ms, 1 rows)
      Nested Loop (0.03ms, 20 rows)
        Bitmap Heap Scan (0.01ms, 26 rows)
          Bitmap Index Scan (0ms, 26 rows)
        Memoize (0ms, 1 rows)
          Index Scan (0ms, 1 rows)
    Aggregate (0.03ms, 1 rows)
      Nested Loop (0.02ms, 3 rows)
        Bitmap Heap Scan (0.01ms, 26 rows)
          Bitmap Index Scan (0ms, 26 rows)
        Memoize (0ms, 0 rows)
          Index Scan (0ms, 0 rows)
```

### Load main page / dashboard data (2.18ms)

Workflow request: `dashboard data`

SQL: `SELECT s.id, s.user_id, s.workspace_id, s.expires_at, s.last_activity, s.created_at, u.is_super_admin FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = $1`

```
Hash Join (0.01ms, 1 rows)
  Seq Scan (0ms, 24 rows)
  Hash (0ms, 1 rows)
    Seq Scan (0ms, 1 rows)
```

## Predicate / Index Review

- Seq Scan on document_associations (512 rows) with filter (document_id = ANY ('{b62a9ba4-dcf5-4577-92de-1acdd240eb6f,633f47a0-d299-401a-b4e4-dd5cfc464f0b,889fbcfc-25fa-4c8d-be68-fb7f34ce01eb,e0750f4d-43ee-4384-af02-9feb1ab8d9ca,4c2b22ba-a4b8-4a63-8cfb-9d93dd2be442,0432f644-074d-4eb8-9ffc-b0ef2382072e,9dcbdff2-7565-4c61-b74a-1d7daf5f5823,8b665577-2a15-44c2-83c2-925a1dc4c22b,8ad3c83f-cca1-43a0-8a9e-55c8001dbe4e,ff17db8e-90da-4115-bb51-3def55df48ea,79c44ad0-0240-47a4-85ac-b352de2af3c3,a568fc49-8ad9-4910-ac70-f5356b8a1ec9,4eca0005-8263-4fd3-be7a-060455ff2676,1839ae0c-8823-4ae5-acb7-3b0d0eb1ff79,6e28b2ad-3831-4fb7-b852-56e183c2cd5d,7814f4af-d02b-46d7-b051-11cea4016489,4404e548-95c2-4fff-b8ed-c559215789a8,845f3909-7bf2-47c8-9bcd-1c47eea4ad62,8536747f-4dda-46d5-b0d9-2e97dd7a4985,d9afc7ac-ab0b-4f6b-8c39-e80c21675d48,ad7d167b-39c7-4a9f-a90d-1605c481ce82,ae18d58b-626b-4b79-a108-255f5a46f172,83fec9fb-9d64-4f1e-bbc7-3b36f8d09469,15bf44cf-4490-478f-b26e-30f3ff0fa563,542d45d7-ef69-43bb-8224-4c686f724e4e,84ff22f6-4cd5-4745-adc7-9ba094f16614,17ea1bf8-6703-4fb8-bad6-aafa3ba82ccf,c35923b2-6c71-44f4-a36f-b45172b2467d,bd58a54a-c840-46c2-a3d6-163338ac9cd8,b9ce068d-b94f-4708-aaa1-764ad29730e5,12890f5c-b701-4a1a-a95d-8b4add208b14,b356d4fc-70a3-4827-8a26-b8098b1766a0,1ce94596-1472-48bd-a022-b274e76852be,aa4106f3-eb06-40cb-b62c-10836a3f77ea,022d04a4-50c1-46a5-a655-ecc1e8c54553,cfd2e292-226a-4916-a5c8-ed4170ed6590,98538873-eb3c-4ed3-a630-1eafb38b004f,40784a60-965f-416f-93da-39b58438c67b,3eba0ab1-fc7f-4ae0-9a39-4475b2087c81,1a705b32-de4d-45e6-b749-d9dcacbec17e,02981395-ce59-41bc-8104-fcffd5e4f7e3,157e9f07-700c-4f9f-8bfd-a6c8b6c8ce5c,8f30338e-e6bf-41ad-8081-7c3419e79044,845cae44-659a-4381-b28d-1a012400376e,c77a2f12-78b4-4060-81cb-066cfc2dff6f,bbfeeca0-3672-4268-af11-7b1b2e98a7cd,822f4791-d9b1-4572-a667-9461d0a3baf3,49f8fa23-21b7-4d86-8a75-8e55486762db,1b836951-d768-44b7-9aa8-fb032c2e4a38,fae351ad-4133-411e-a956-14ab3d523e3e,44a0bab8-432c-4b25-8c58-eb21422148da,4782f78d-895c-4b04-b3bf-b34ba8f5b9ac,81d96cd7-c723-42fa-a098-1f60f9a9d634,e8bf8bc7-a67d-45a0-bcad-311caa641797,d537467d-87cb-4e11-8d03-e519f23b86f3,a12f7448-01fd-4f72-90ae-dd53ae5108b8,0598e200-f019-4fd6-96aa-edc2c40ac06a,cdc94d1f-1da8-4978-970c-7249a9ef52fe,2cef62ce-d378-4ff7-8178-9552adee7be2,302193ba-0a8a-408d-80cd-5e6c2d9e053d,ad6e4853-a97e-4bb3-b33e-8ca2a11eeec9,aff21491-3ed0-4a5b-bde8-3cf05a40c753,2b1b927d-4b47-407a-b534-359481db9278,05a5ed64-580f-42b0-bea6-88c2acd0f8f8,0a99b4a1-61f6-40c1-ab14-88bd4af4970b,0f298ec0-c760-4ea0-b35a-14e10e8c08bf,6a034f2f-4c58-485a-b485-3c8d6f40ad9d,94a82322-6738-4398-a07e-4935895386b2,76ec3fa5-a4e0-4947-9d06-b550eaf2db15,1541b3b1-607c-4d76-ac3a-80622396270a,395a80cb-13cb-4fbe-82b7-c796d4557d74,1006132b-8118-4182-bcc9-0f97b68266be,5f5cd851-04a9-4155-bf61-b34ca6b33da3,55f046bd-4a3e-4b21-8179-fb7a16dad5bb,026c8ecd-0a84-48e5-9e49-4cd2c79eb45f,ac87f72d-8a17-4ba3-abff-9af34f3da925,3acb10ac-84ae-45fc-821f-974a991531bd,73a32050-8cd7-453e-aa5f-b69458cd6950,05f75eed-1924-414b-8016-d5338d01f77f,45d6d074-6f04-42c1-b970-5e25fc91a5c1,87ed665b-9310-4c08-a181-267bbb572643,eb3939cb-5a61-47c6-b766-628bb5aed9fd,04611d14-2c0f-4a8f-b6ba-7e904cfd45ef,48ad8092-dce0-41b2-b0b4-33f5b3bc31d8,4c72a172-ab7a-4fd8-b677-ff922a443422,952c6ad7-dbd1-4abf-95b6-1c1f4478bcaa,bd3061ca-f102-4760-92f2-152d96c4e286,4b117ed7-cbe8-471e-a756-1506ead93719,cba3a9db-382f-4f54-98e8-2001fcc19818,d0bf267f-63b9-4356-8789-8cc2e23bdf08,751fe691-885f-4446-9a55-53a92b1c7405,0eb860fa-c74d-4655-abc9-5dc982092dd5,b3c98588-5252-42df-8106-0c2b712c1fd8,f6840197-78f6-496e-a3a0-4b4c11eef144,a13c59be-7175-4102-b6ce-1cd00fa74e32,b007832f-12db-4d46-ac0b-f77337b7fbdf,9b50e999-9080-4733-ab36-075451fa7743,8342fd7f-e589-4081-aac0-bf63a4101116,c9c09c49-aa07-4b2b-a906-adb701101ef6,614452ef-d227-4086-bcb4-a3d718127041,e5ef396f-740f-4efc-b731-4a1b4c49cbd3,108530a8-9361-41c8-915a-dfd1d2de1060,167c9098-7bc7-4a0c-a85d-dfd2dad91b36,169fd0f4-7aed-4664-b2d1-1aae31756e90,8a7f942f-1ced-485a-97e9-0d689d139c94,fe1dc227-3255-4869-ab3c-81663c99fc70,8cffcf01-b552-4d21-928b-3c21b9bf56ca,108fe628-6843-48fe-9450-50031686ec80,b19fe953-d052-4f5d-a9cb-bf80dce7f285,4f3ccbfd-04fd-4a36-853b-cfabab169b2d,dd521f0a-53e5-4040-8113-4e104b1107a0,b150c501-fb4c-4506-b717-5552cf2d67af,eb0aff29-04c7-494e-b203-e720672691f7,ea3909de-3b91-4f90-90a6-42fa71e6c0ea,9dc50467-1f0e-4d05-951d-80c7ad71e20d,948a6a26-6479-4314-bc68-0be62cee7597,246f2dcd-7b13-4d1f-bf1b-4d1bec7b9bcb,4223ec69-0fa9-4974-846a-7ff3e0b38698,844dddcc-e315-4598-8639-a673d866a956,511bfaf3-126c-42af-9644-630471e773fb,868dc169-2753-452d-baab-31392a0fd934,29f90e1c-a6ce-4cd6-ae39-9c5e59a9ec1b,9ff6bed7-0c22-4daa-b2ed-2bd9ac25694e,c523fdca-b05b-44b6-973a-59ad48f60920,fecdc876-18b3-4c47-aa2e-65d27dfdf88f,aa2799f5-4585-4ad9-a290-de0f0f92eadf,042a3e2e-1511-4c07-980d-685b963fbe27,fdab54c2-d809-426c-b4ce-7926703cd331,aa31c067-f666-40ae-b42a-4ccc71b34537,606cce99-10ca-4618-b364-4e6b3dca281d,6b426e9c-2e1a-4c43-a7b1-06759aa77b6a,8559ad40-f890-4393-b70f-e522307b22d8,712a0c00-4b31-49aa-acb5-f6466119031c,ec379046-03d4-4f21-a86f-18974722a31b,3b297a0c-df74-4e7d-8fd6-3ed7d374fe47,579efc91-bdd9-47f5-8a2f-c11a07604526,64a4f375-4bab-4350-91e5-c4cf8e8d42e9,d489c84a-ab7a-4e42-a23f-64255990f17a,fe5ca6fa-0ab5-4c4d-8420-f1ffb34e7e59,92ddddbd-eed6-4e97-8d34-7bfa12be80b8,3acf5fb3-4dcb-4f6b-8bd7-27f296eab2b4,1f73ad2c-97ff-4c24-9287-01a666f650b8,f1d7d300-5a13-47ce-9f7b-c86cdcf6b022,127ab65d-4f83-4f49-9191-ab80bf1a9e60,b7f7b0f6-ca97-4be4-b365-66c51b33af05,8e1cde64-6281-4caa-bb73-3d936198f5cb,975bcc21-b617-404a-9bc2-7adbd004232e,420f3cb3-442d-4013-b123-762b9e358b09,cfe003ac-b9a4-4fb8-9cf1-e0019d417177,e4e094ad-f71e-4dc9-9a4c-57dfc79e2d3a,95f174db-2d32-492e-9ba6-0d3ad2c036e9,6e3e069e-fb81-49e4-9a0e-f2dd6fc64f97,9d019360-f6d1-431d-b270-fb0b55bf74f3,50321f38-3339-4cff-8588-270eac8240b7,ff03fcc3-37a1-4cd3-87ed-d79b40fae8b0,7ecc60a6-09e4-4c28-ad1f-d7193d5dbbe7,8b8312d0-1ac0-467e-b0ff-b3aec8130fa3,a2a71cac-6725-41c1-b020-63456a62eac7,10d3c975-0b65-4a87-9db3-3d92846ad46a,9a1f4a1d-17e8-4353-8296-492b21f2a04a}'::uuid[])). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on documents (665 rows). Review whether an index should support this access pattern.
  Existing indexes: documents_pkey, idx_documents_workspace_id, idx_documents_parent_id, idx_documents_document_type, idx_documents_properties, idx_documents_person_user_id, idx_documents_visibility, idx_documents_visibility_created_by, idx_documents_archived_at, idx_documents_deleted_at, idx_documents_active, idx_documents_converted_to, idx_documents_converted_from

## Trend

- Status: **regressing**
- Avg query duration delta: 0.73ms

