# Database Query Efficiency Report

Generated: 2026-03-12T20:20:06.157Z
Label: current-issues-pass
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
| Load main page | 9 | 10ms | No |
| View a document | 24 | 3.31ms | No |
| List issues | 4 | 2.41ms | No |
| Load sprint board | 17 | 1.22ms | No |
| Search content | 5 | 0.5ms | No |

## Workflow Breakdown

### Load main page
_My Week page initial load_

**Workflow Overview**

- Frontend route: `/my-week`
- Total SQL queries: 9
- Total DB time: 43.93ms
- Slowest observed SQL query: 10ms
- Sequential scans: No
- Nested loops: Yes

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| dashboard data | `/api/dashboard/my-week` | 200 | 9 | 43.93 |

### View a document
_Unified document page load for "Perf Wiki 0001"_

**Workflow Overview**

- Frontend route: `/documents/b6fbd050-8e7f-4db4-8707-dcb7f6789b6a`
- Total SQL queries: 24
- Total DB time: 21.71ms
- Slowest observed SQL query: 3.31ms
- Sequential scans: Yes
- Nested loops: Yes

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| document | `/api/documents/b6fbd050-8e7f-4db4-8707-dcb7f6789b6a` | 200 | 4 | 3.74 |
| document context | `/api/documents/b6fbd050-8e7f-4db4-8707-dcb7f6789b6a/context` | 200 | 7 | 5.31 |
| document comments | `/api/documents/b6fbd050-8e7f-4db4-8707-dcb7f6789b6a/comments` | 200 | 3 | 3 |
| team members | `/api/team/people` | 200 | 4 | 2.34 |
| programs | `/api/programs` | 200 | 3 | 2.8 |
| projects | `/api/projects` | 200 | 3 | 4.52 |

### List issues
_Issues page list query_

**Workflow Overview**

- Frontend route: `/issues`
- Total SQL queries: 4
- Total DB time: 5.81ms
- Slowest observed SQL query: 2.41ms
- Sequential scans: Yes
- Nested loops: Yes
- Unnecessary data fetching:
  - Fetched properties JSON for 160 rows (issues)
  - Fetched properties JSON for 440 rows (issues)

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| issues | `/api/issues` | 200 | 4 | 5.81 |

### Load sprint board
_Team allocation board initial load_

**Workflow Overview**

- Frontend route: `/team/allocation`
- Total SQL queries: 17
- Total DB time: 7.75ms
- Slowest observed SQL query: 1.22ms
- Sequential scans: Yes
- Nested loops: Yes
- Unnecessary data fetching:
  - Fetched properties JSON for 120 rows (team grid)
  - Fetched properties JSON for 72 rows (team assignments)
  - Fetched properties JSON for 120 rows (team assignments)

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| team grid | `/api/team/grid` | 200 | 7 | 3.16 |
| team projects | `/api/team/projects` | 200 | 4 | 1.35 |
| team assignments | `/api/team/assignments` | 200 | 6 | 3.24 |

### Search content
_Mention search for "Standup"_

**Workflow Overview**

- Frontend route: `/search?q=Standup`
- Total SQL queries: 5
- Total DB time: 1.9ms
- Slowest observed SQL query: 0.5ms
- Sequential scans: Yes
- Nested loops: No

**Requests In This Workflow**

| Request | Path | Status | SQL Query Count | DB Time (ms) |
|---|---|---:|---:|---:|
| mentions | `/api/search/mentions?q=Standup` | 200 | 5 | 1.9 |

## Individual SQL Query Plans

### Load main page / dashboard data (10ms)

Workflow request: `dashboard data`

SQL: `SELECT DISTINCT proj.id as project_id, proj.title as project_title, prog.title as program_name FROM documents s JOIN documents proj ON (s.properties->>'project_id')::uuid = proj...`

```
Unique (0.01ms, 0 rows)
  Sort (0.01ms, 0 rows)
    Nested Loop (0.01ms, 0 rows)
      Nested Loop (0.01ms, 0 rows)
        Bitmap Heap Scan (0.01ms, 0 rows)
          Bitmap Index Scan (0ms, 24 rows)
        Index Scan (0ms, 0 rows)
      Nested Loop (0ms, 0 rows)
        Index Scan (0ms, 0 rows)
        Memoize (0ms, 0 rows)
          Index Scan (0ms, 0 rows)
```

### Load main page / dashboard data (9.02ms)

Workflow request: `dashboard data`

SQL: `SELECT sprint_start_date FROM workspaces WHERE id = $1`

```
Index Scan (0ms, 1 rows)
```

### Load main page / dashboard data (8.59ms)

Workflow request: `dashboard data`

SQL: `SELECT id, title, properties FROM documents WHERE workspace_id = $1 AND document_type = 'weekly_retro' AND (properties->>'person_id') = $2 AND (properties->>'week_number')::int ...`

```
Limit (0ms, 1 rows)
  Index Scan (0ms, 1 rows)
```

### Load main page / dashboard data (8.54ms)

Workflow request: `dashboard data`

SQL: `SELECT id, title, properties, created_at, updated_at FROM documents WHERE workspace_id = $1 AND document_type = 'standup' AND (properties->>'author_id') = $2 AND (properties->>'...`

```
Sort (0.01ms, 3 rows)
  Bitmap Heap Scan (0ms, 3 rows)
    Bitmap Index Scan (0ms, 3 rows)
```

### View a document / projects (3.31ms)

Workflow request: `projects`

SQL: `WITH project_sprint_counts AS ( SELECT da.related_id AS project_id, COUNT(*)::int AS sprint_count FROM document_associations da JOIN documents s ON s.id = da.document_id WHERE d...`

```
Sort (0.45ms, 24 rows)
  Hash Join (0.43ms, 24 rows)
    Hash Join (0.26ms, 24 rows)
      Hash Join (0.16ms, 24 rows)
        Hash Join (0.11ms, 24 rows)
          Hash Join (0.08ms, 24 rows)
            Seq Scan (0.04ms, 208 rows)
            Hash (0.01ms, 24 rows)
              Bitmap Heap Scan (0.01ms, 24 rows)
                Bitmap Index Scan (0ms, 24 rows)
          Hash (0.01ms, 24 rows)
            Seq Scan (0ms, 24 rows)
        Hash (0.05ms, 24 rows)
          Subquery Scan (0.05ms, 24 rows)
            Aggregate (0.04ms, 24 rows)
              Sort (0.04ms, 24 rows)
                Hash Join (0.03ms, 24 rows)
                  Seq Scan (0.02ms, 184 rows)
                  Hash (0.01ms, 24 rows)
                    Bitmap Heap Scan (0.01ms, 24 rows)
                      Bitmap Index Scan (0ms, 24 rows)
      Hash (0.09ms, 24 rows)
        Subquery Scan (0.07ms, 24 rows)
          Aggregate (0.06ms, 24 rows)
            Hash Join (0.05ms, 160 rows)
              Seq Scan (0.02ms, 184 rows)
              Hash (0.02ms, 160 rows)
                Bitmap Heap Scan (0.01ms, 160 rows)
                  Bitmap Index Scan (0ms, 160 rows)
    Hash (0.14ms, 24 rows)
      Subquery Scan (0.13ms, 24 rows)
        Aggregate (0.13ms, 24 rows)
          Sort (0.1ms, 24 rows)
            Nested Loop (0.08ms, 24 rows)
              Bitmap Heap Scan (0.04ms, 24 rows)
                BitmapAnd (0.01ms, 0 rows)
                  Bitmap Index Scan (0ms, 24 rows)
                  Bitmap Index Scan (0.01ms, 26 rows)
              Index Scan (0ms, 1 rows)
```

### Load main page / dashboard data (2.52ms)

Workflow request: `dashboard data`

SQL: `SELECT id, title, content, properties, created_at, updated_at FROM documents WHERE workspace_id = $1 AND document_type = 'weekly_plan' AND (properties->>'person_id') = $2 AND (p...`

```
Limit (0ms, 1 rows)
  Index Scan (0ms, 1 rows)
```

### List issues / issues (2.41ms)

Workflow request: `issues`

SQL: `WITH filtered_issues AS ( SELECT d.id, d.workspace_id, d.title, d.ticket_number, d.properties->>'state' as state, d.properties->>'priority' as priority, d.properties->>'assignee...`

```
Sort (0.27ms, 160 rows)
  Bitmap Heap Scan (0.06ms, 160 rows)
    Bitmap Index Scan (0ms, 160 rows)
  Hash Join (0.2ms, 160 rows)
    Hash Join (0.05ms, 24 rows)
      Hash Join (0.03ms, 24 rows)
        Bitmap Heap Scan (0ms, 24 rows)
          Bitmap Index Scan (0ms, 24 rows)
        Hash (0.02ms, 24 rows)
          Aggregate (0.02ms, 24 rows)
            CTE Scan (0.01ms, 160 rows)
      Hash (0ms, 24 rows)
        Seq Scan (0ms, 24 rows)
    Hash (0.13ms, 160 rows)
      CTE Scan (0.11ms, 160 rows)
```

### Load main page / dashboard data (2.4ms)

Workflow request: `dashboard data`

SQL: `SELECT s.id, s.user_id, s.workspace_id, s.expires_at, s.last_activity, s.created_at, u.is_super_admin FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = $1`

```
Hash Join (0.01ms, 1 rows)
  Seq Scan (0ms, 24 rows)
  Hash (0ms, 1 rows)
    Index Scan (0ms, 1 rows)
```

## Predicate / Index Review

- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'program'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'program'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'project'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (document_id = ANY ('{ba914e63-063e-4432-b5ef-73e19e72f83c,bfc2c1c7-6428-49ef-a1fe-f200a6624f3f,6d80bef6-cb6c-4f7b-8335-fac4a477c781,b1e37004-ec09-4393-8989-ee4efd7681bc,5f64a1af-e789-433d-b2b4-1c9488b20026,5c4dac6d-234f-46fd-a5a7-bb4d7c690f3b,29ed55b3-79f7-4bba-96a7-f8d82de09d84,f9b94d92-9c48-4e20-8ac4-e33c38086cec,03e25f45-a8c3-4f56-8b55-01a805422299,74b566a9-7e70-47e4-b86e-697e7cb14d1e,525fc281-e39e-4a3a-9955-bf332c4fb134,ca103955-e60a-4ae4-a865-317b9efcb787,4f95327b-11fc-4ac8-ae20-20bc2c42b205,48c5996b-ed9f-4a0e-ae6e-c524b1131aad,87b59221-a92f-4162-8089-26865991b557,818e3b95-60ce-4310-a884-1e69e2c3120f,941fc953-9349-4319-8347-1315a5bc1ab7,969acfed-6660-47b4-94b3-d0a99c5a2eab,8ae6b8c5-0bea-4177-8d8c-3d21b749a1c5,1a3de61f-1961-44d9-9e87-09a4f401961e,04191d3c-147a-4cde-918b-4f9765561edd,f5ed8f7e-518a-410c-929c-f4a58c310594,2404b21c-1811-4420-8398-b84a34bff6c1,3a263918-36e6-4f20-a0cf-3df8efa48370,c0fd0f6b-1c59-4af9-982e-ed185e24b087,def3673f-a436-407c-b6cd-fb2cf4891613,46ced34c-fa2d-4036-a244-d6093eb018f9,3e84d7af-b4ca-4bb1-af77-fc4b80ee2f7d,2f36ab9e-80c2-42f1-a5fd-8026285d0b2a,1916867e-4dfb-4ea4-a518-674873b39573,97c69f4e-d59a-4ab7-94f2-c929001bb19d,915300d7-d8a7-4f71-b8f9-574622e8eea4,98c88309-64fd-4e2b-8649-214182765d06,644482e9-a2f7-436f-9e35-bd929a90eb5f,8395f9e6-05e0-42d6-8988-60ca138d707a,f0c3af4e-f15d-4690-97f4-1adc74e23e40,9fbc937f-4e67-4424-b0a9-79f69ba07443,82a19e87-fe90-4cba-b42a-cf9a74e303e7,fb5092c8-7762-412c-8e95-20419fb27e6d,0e459de1-4071-460d-ad72-d0671bbc155d,dd6aac35-0337-4ade-8108-400b53cfc71d,52e19536-497a-4ba4-81e5-938e89d97c2e,602f0244-12d4-4c98-a596-cffdf7d31a5a,ecdcc0a7-638b-4e9a-9397-86a66e9e936f,bf83408c-9e34-4d51-8643-0cfc5aafb95f,5da5bc72-7c8b-463a-8c95-f17e4144b046,6ab1f10e-03cc-4b59-ba8b-51ca5389acf1,0c9d5fa8-1dcc-4d10-b626-81187aee9807,997a7a9c-3133-4fe4-9f1d-838c88cc251f,889cfc62-c601-44d5-8a5f-4e669d013a9c,60b21590-5478-4e84-bce4-5aca0b823ab1,40630734-18a2-46ff-bb9e-498613bb0a8e,761b8bbd-426b-4ed6-934c-bfa9e1933947,b748f8eb-d0b6-41ee-8f99-c76c500e41f3,3ffcab0b-c19b-481b-9547-62bf03445a8c,5108ac42-cbff-4c27-99f8-11de3b25f2ba,47bd8291-465f-4cf9-b563-e867bb01a50e,c40f97ce-0571-4a3e-a958-a3fd6ad72f4b,dd7622c8-6780-4d21-aacd-e6d5040a1527,8c6b243a-f21d-4a69-9885-699a595bb4d9,79f215a0-f456-4092-999d-70ae765e42e9,9f6da9eb-4cf2-4243-9a20-9847090894dc,7867a490-2be8-4c7b-aaa3-3ccc364c7603,704452df-e84e-44ec-8634-dee2a5fe483c,0994bd3a-c53c-4fc6-b59a-f578450edcf8,cfe070b5-10b6-4c3c-b639-c0ce566d1a94,83b181a3-8907-416d-a137-f1956fa47197,65398b18-c4e1-4992-8f9c-3834fe22b42b,b7763eae-c905-4d87-96fd-03b36ee0aca0,88fdd60c-f7c8-493e-a34f-995bb0bd9fe1,6486be7e-0561-4f88-911b-0994ed0857f5,f009534f-6a56-43fb-b8fb-27fb1c5d6fe8,5705c510-0e70-488d-b314-7938b92961d5,6ad1675c-345e-4d93-9b05-f580e4aa6d24,cc7f4a4d-b552-4147-ba82-d5092e252424,12729806-1d59-4683-be72-76fd54feae54,13db5b79-01ad-4d54-9a5c-e90cdd79aa10,df75aaef-e605-4c65-bd39-f182ce2a63df,849ee02c-e9ee-404d-8d75-95915910ae83,7fbffa5e-81f0-440b-96ba-19c7d920ea89,fb9abbb1-1c1e-4cdc-b7a4-c85e3920c765,34b2a1ed-90a4-427a-942d-db63db99e8f3,e42ad4f3-2d66-4a75-ad16-d20685d685ec,860f4b6b-9bcd-48f3-b36b-2965cac3f8f0,c9937b83-14ec-423c-a633-6b87a5c51d65,c28d4556-1278-4e5f-a486-83725e3132e6,69126bbe-f61f-4521-b5ee-75753510df3e,f2fe9edb-1b25-489c-a185-d1bea85f4af3,01bc3f79-04e2-4b3c-b7eb-4f84b40f42e8,d72e862b-56c1-4a92-9ea7-d04a43bdeb21,bbcf2883-0f2f-4d00-b791-3b1840833fef,5b636d15-77b3-4f4a-9663-1a2695d55621,cfa656ae-8a07-44b4-80d0-87f79544f2d0,5efb6ab9-6dd2-4017-9776-ba92535d8f06,3ff579a8-94bc-40aa-8e22-605d45a8966a,1e1e7861-565e-49a2-9387-7affcac55982,6d3741d4-a597-499c-9144-9046592d8908,0b01f1bf-31e1-45c0-80b2-1739477d8f3f,61ec9b93-5e4e-4a19-87c7-b45e469a4316,93d67596-03e8-4cbc-b42b-af84e489fdd5,603f1330-2aa2-48d8-8b8f-4829e154216f,bd80265c-4acc-4de0-bd93-47066f3c4c7a,25c97b9e-d189-4817-9724-e7b37ead71b4,73c6d9ca-8fb3-45d3-99bf-e6fcc4582cdc,d2f782a8-6ad9-451a-98b9-ef814fddac3c,ae3e4309-dd11-48f5-ba74-c84b6cc7d673,c6fa7aba-2fa5-404d-9dd0-37164e78924c,68b1843f-033e-4b89-a223-010c2d3bd816,dceffa23-b895-45fa-87b4-e1b875d69743,46830a59-5195-4b78-8216-c506f04b25ea,88e5d33d-99af-4207-86f3-7f4477426cb6,2294e68c-2f41-47b2-9deb-2ecb0a9c4f03,9e14e3f7-69a4-4ca9-a828-0c8f257f7e9b,68c0ded7-6860-46d8-91fc-09580e6c9fbd,878b2ac5-778f-49dd-9472-11aee9afdd85,504eeac0-0fa0-42f4-92aa-7e4065f5b42f,7cb65bc4-3b52-444f-8754-00bbe945cf5f,64d4acf5-0b51-48f6-bc68-21cce7c4bdd6,9041d742-66b4-4eec-acaf-54fdbb4d70e5,06d65acf-ef84-42b2-84ea-cf4824e814d1,9a5cc7d2-c6ef-4e43-9790-a9ed88bf29a1,ce4b0933-b291-4393-8fea-01dda1ea77fa,56f30c16-5f0b-4989-b20a-bcb0b7fd3b9f,7387117e-87ef-4660-a469-29d498f6d5a7,4185fa3c-deae-4dfe-875f-b2e30e973d8d,f2c957b4-e425-41cf-97ec-fd0cf06b315b,e42fae20-f3a6-49be-95c8-f5a0762718c3,2b698ffc-f779-4f75-b1cb-3af096b09993,982a1665-05aa-44b9-8181-669490baa688,7e2e7da8-e78e-49fd-8b8b-3784e4874d22,5b8b27dc-879d-455b-aac2-fed1d32dc47e,8a3a3a45-15fe-4cff-9bd2-fe8c79bc36bc,87aa6780-619b-42d6-8645-ac96f94599e2,8d8745a5-f073-4ba9-be5b-c9440fb10927,fd3d0d42-f01b-47b6-8985-a6a4fec92a3b,363ad808-a367-4aef-b9c0-e3e51c8c5e68,de8f20f6-a3c1-417f-a44d-f7b9c182e09d,52c3153d-2cc0-4a79-aa1b-6ba39a6c22cc,ebc57f94-d2f7-475e-b970-62a6e44cae23,224e4e28-3343-45c5-95cf-65d7657224df,04b1635e-3e15-42ce-8899-fcd76ba724ca,d6827a85-de3f-476c-9c40-bc5bcdddfb78,b99c5454-6e8f-44b1-83cb-a0131aa3c159,e70bc89e-2c1a-4d3e-a500-e89918975017,4e9df89d-559f-40d7-a344-8693d384429a,d0f71349-137e-49a6-a4e3-06f2dcbaa3e8,0fda1eaa-b3a2-4e01-a894-afdb096682aa,b18ea9d9-b2bc-446f-ba80-fb56a563dae5,c7a8f317-a237-44ff-b62a-48032bf0f6c8,d8387fd8-4e6a-4ed4-bf48-92750e190ece,0999e853-cadd-4881-be01-e7f3810191e0,8b456a48-2b2b-4453-a9c3-08c3294efe9d,6604b7f7-ed2d-41fa-951b-075c43235bfb,efb1ae42-5bd6-406c-be1b-81f1321d0d37,a169c898-2962-401a-9592-e90ba05a0b39,f98ed4e0-010c-400a-92cf-e203de709cd7,1d442a9a-3c98-42c9-bd4e-43444e52c411,0bbba954-2b0a-46ff-8deb-76eed1f47863,94ed8e7c-6a05-4c18-8bd1-b55ab54d6646,252ae20d-9c77-42fe-9a1a-105d22651add}'::uuid[])). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'program'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'sprint'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'program'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on documents (665 rows). Review whether an index should support this access pattern.
  Existing indexes: documents_pkey, idx_documents_workspace_id, idx_documents_parent_id, idx_documents_document_type, idx_documents_properties, idx_documents_person_user_id, idx_documents_visibility, idx_documents_visibility_created_by, idx_documents_archived_at, idx_documents_deleted_at, idx_documents_active, idx_documents_converted_to, idx_documents_converted_from
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'program'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'sprint'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'project'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on documents (665 rows) with filter ((deleted_at IS NULL) AND (title ~~* '%Standup%'::text) AND (workspace_id = '08ccf779-5c46-4df0-be73-a1a262466133'::uuid) AND (document_type = ANY ('{wiki,issue,project,program}'::document_type[]))). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: documents_pkey, idx_documents_workspace_id, idx_documents_parent_id, idx_documents_document_type, idx_documents_properties, idx_documents_person_user_id, idx_documents_visibility, idx_documents_visibility_created_by, idx_documents_archived_at, idx_documents_deleted_at, idx_documents_active, idx_documents_converted_to, idx_documents_converted_from

## Trend

- Status: **stable**
- Avg query duration delta: -0.32ms
