# Database Query Efficiency Report

Generated: 2026-03-10T18:33:50.864Z
Database: postgresql://ship:***@localhost:5433/ship_dev

## Methodology

- Source of truth: live API route tracing against the real Express app, not copied SQL.
- Authentication: session cookie auth, so auth middleware queries are included.
- Query capture: every `pool.query()` emitted during each request.
- Plan analysis: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` rerun only for observed read queries.
- Flow mapping uses the frontend routes and API calls the UI actually makes on initial load.

## Audit Deliverable

| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
|---|---:|---:|---|
| Load main page | 10 | 3.41ms | No |
| View a document | 32 | 4.24ms | Yes |
| List issues | 6 | 2.13ms | No |
| Load sprint board | 20 | 2.78ms | No |
| Search content | 6 | 1.21ms | No |

## Flow Details

### Load main page
_My Week page initial load_

- Frontend route: `/my-week`
- Total queries: 10
- Total DB time: 12.67ms
- Slowest observed query: 3.41ms
- Sequential scans: No
- Nested loops: Yes

| Request | Status | Query Count | DB Time (ms) |
|---|---:|---:|---:|
| dashboard data | 200 | 10 | 12.67 |

### View a document
_Unified document page load for "Perf Wiki 0001"_

- Frontend route: `/documents/7c4d2318-afbb-4d11-864f-2d524d427362`
- Total queries: 32
- Total DB time: 26.48ms
- Slowest observed query: 4.24ms
- Sequential scans: Yes
- Nested loops: Yes
- N+1 findings:
  - SubPlan 1 executes 8x (once per outer row) (programs)
  - SubPlan 2 executes 8x (once per outer row) (programs)
  - SubPlan 1 executes 24x (once per outer row) (projects)
  - SubPlan 2 executes 24x (once per outer row) (projects)
  - SubPlan 3 executes 24x (once per outer row) (projects)

| Request | Status | Query Count | DB Time (ms) |
|---|---:|---:|---:|
| document | 200 | 5 | 4.06 |
| document context | 200 | 8 | 5.85 |
| document comments | 200 | 4 | 2.44 |
| team members | 200 | 5 | 3.53 |
| programs | 200 | 5 | 4.39 |
| projects | 200 | 5 | 6.21 |

### List issues
_Issues page list query_

- Frontend route: `/issues`
- Total queries: 6
- Total DB time: 6.01ms
- Slowest observed query: 2.13ms
- Sequential scans: Yes
- Nested loops: Yes
- Unnecessary data fetching:
  - Fetched content column for 160 rows (issues)
  - Fetched properties JSON for 440 rows (issues)

| Request | Status | Query Count | DB Time (ms) |
|---|---:|---:|---:|
| issues | 200 | 6 | 6.01 |

### Load sprint board
_Team allocation board initial load_

- Frontend route: `/team/allocation`
- Total queries: 20
- Total DB time: 16.19ms
- Slowest observed query: 2.78ms
- Sequential scans: Yes
- Nested loops: Yes
- Unnecessary data fetching:
  - Fetched properties JSON for 120 rows (team grid)
  - Fetched properties JSON for 72 rows (team assignments)
  - Fetched properties JSON for 120 rows (team assignments)

| Request | Status | Query Count | DB Time (ms) |
|---|---:|---:|---:|
| team grid | 200 | 8 | 6.26 |
| team projects | 200 | 5 | 2.91 |
| team assignments | 200 | 7 | 7.02 |

### Search content
_Mention search for "Standup"_

- Frontend route: `/search?q=Standup`
- Total queries: 6
- Total DB time: 4.6ms
- Slowest observed query: 1.21ms
- Sequential scans: Yes
- Nested loops: No

| Request | Status | Query Count | DB Time (ms) |
|---|---:|---:|---:|
| mentions | 200 | 6 | 4.6 |

## Slow Query Plans

### View a document / projects (4.24ms)

SQL: `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id, d.archived_at, d.created_at, d.updated_at, d.converted_from_id, (d.properties->>'owner_id')::uuid as owner_...`

```
Sort (0.71ms, 24 rows)
  Hash Join (0.7ms, 24 rows)
    Hash Join (0.04ms, 24 rows)
      Seq Scan (0.02ms, 208 rows)
      Hash (0.01ms, 24 rows)
        Bitmap Heap Scan (0.01ms, 24 rows)
          Bitmap Index Scan (0ms, 24 rows)
    Hash (0ms, 24 rows)
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

### Load main page / dashboard data (3.41ms)

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

### Load sprint board / team assignments (2.78ms)

SQL: `SELECT i.properties->>'assignee_id' as assignee_id, da_project.related_id as project_id, proj.title as project_name, proj.properties->>'color' as project_color, proj_prog_da.rel...`

```
Nested Loop (0.37ms, 120 rows)
  Nested Loop (0.29ms, 120 rows)
    Nested Loop (0.19ms, 120 rows)
      Hash Join (0.12ms, 120 rows)
        Seq Scan (0.02ms, 120 rows)
        Hash (0.09ms, 160 rows)
          Hash Join (0.07ms, 160 rows)
            Seq Scan (0.02ms, 184 rows)
            Hash (0.03ms, 160 rows)
              Bitmap Heap Scan (0.02ms, 160 rows)
                Bitmap Index Scan (0ms, 160 rows)
      Index Scan (0ms, 1 rows)
    Nested Loop (0ms, 1 rows)
      Index Scan (0ms, 1 rows)
      Memoize (0ms, 1 rows)
        Index Scan (0ms, 1 rows)
  Index Scan (0ms, 1 rows)
```

### View a document / programs (2.36ms)

SQL: `SELECT d.id, d.title, d.properties, d.archived_at, d.created_at, d.updated_at, COALESCE((d.properties->>'owner_id')::uuid, d.created_by) as owner_id, u.name as owner_name, u.ema...`

```
Sort (0.4ms, 8 rows)
  Hash Join (0.39ms, 8 rows)
    Bitmap Heap Scan (0ms, 8 rows)
      Bitmap Index Scan (0ms, 8 rows)
    Hash (0.01ms, 24 rows)
      Seq Scan (0ms, 24 rows)
    Aggregate (0.03ms, 1 rows)
      Nested Loop (0.03ms, 20 rows)
        Bitmap Heap Scan (0.01ms, 26 rows)
          Bitmap Index Scan (0ms, 26 rows)
        Memoize (0ms, 1 rows)
          Index Scan (0ms, 1 rows)
    Aggregate (0.02ms, 1 rows)
      Nested Loop (0.02ms, 3 rows)
        Bitmap Heap Scan (0ms, 26 rows)
          Bitmap Index Scan (0ms, 26 rows)
        Memoize (0ms, 0 rows)
          Index Scan (0ms, 0 rows)
```

### List issues / issues (2.13ms)

SQL: `SELECT d.id, d.title, d.properties, d.ticket_number, d.content, d.created_at, d.updated_at, d.created_by, d.started_at, d.completed_at, d.cancelled_at, d.reopened_at, d.converte...`

```
Sort (0.23ms, 160 rows)
  Hash Join (0.15ms, 160 rows)
    Hash Join (0.1ms, 160 rows)
      Bitmap Heap Scan (0.02ms, 160 rows)
        Bitmap Index Scan (0ms, 160 rows)
      Hash (0ms, 24 rows)
        Seq Scan (0ms, 24 rows)
    Hash (0.01ms, 24 rows)
      Bitmap Heap Scan (0ms, 24 rows)
        Bitmap Index Scan (0ms, 24 rows)
```

### List issues / issues (2.05ms)

SQL: `SELECT da.document_id, da.related_id as id, da.relationship_type as type, d.title, d.properties->>'color' as color FROM document_associations da LEFT JOIN documents d ON da.rela...`

```
Sort (0.24ms, 440 rows)
  Nested Loop (0.17ms, 440 rows)
    Seq Scan (0.04ms, 440 rows)
    Memoize (0ms, 1 rows)
      Index Scan (0ms, 1 rows)
```

### Load sprint board / team assignments (1.96ms)

SQL: `SELECT jsonb_array_elements_text(s.properties->'assignee_ids') as person_id, (s.properties->>'sprint_number')::int as sprint_number, s.properties->>'project_id' as project_id, p...`

```
ProjectSet (0.2ms, 72 rows)
  Nested Loop (0.17ms, 24 rows)
    Nested Loop (0.15ms, 24 rows)
      Hash Join (0.12ms, 24 rows)
        Seq Scan (0.04ms, 665 rows)
        Hash (0.05ms, 24 rows)
          Hash Join (0.04ms, 24 rows)
            Seq Scan (0.02ms, 208 rows)
            Hash (0.01ms, 24 rows)
              Bitmap Heap Scan (0.01ms, 24 rows)
                Bitmap Index Scan (0ms, 24 rows)
      Nested Loop (0ms, 1 rows)
        Index Scan (0ms, 1 rows)
        Memoize (0ms, 1 rows)
          Index Scan (0ms, 1 rows)
    Index Scan (0ms, 1 rows)
```

### Load main page / dashboard data (1.84ms)

SQL: `SELECT s.id, s.user_id, s.workspace_id, s.expires_at, s.last_activity, s.created_at, u.is_super_admin FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = $1`

```
Hash Join (0.01ms, 1 rows)
  Seq Scan (0ms, 24 rows)
  Hash (0.01ms, 1 rows)
    Index Scan (0.01ms, 1 rows)
```

## Predicate / Index Review

- Seq Scan on document_associations (512 rows) with filter (relationship_type = 'program'::relationship_type). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: document_associations_pkey, unique_association, idx_document_associations_document_id, idx_document_associations_related_id, idx_document_associations_type, idx_document_associations_related_type, idx_document_associations_document_type
- Seq Scan on document_associations (512 rows) with filter (document_id = ANY ('{0c3cb68b-3e7c-4389-a79b-9a6339a7dacf,9c11e5a7-d2e1-48a7-aeba-3e3a7a625299,c9f5da2e-d4d8-4370-b484-19c1e88698bc,8c4686be-2923-45e3-8ddc-934bb8126e5f,82623f76-d389-4a51-9fc0-c2d1efa12ba9,471074b9-4dfb-46b0-ac3b-23682fa9b394,1636cd73-0e57-446f-aeb4-efe5834d658b,5f50f723-af97-40dd-8916-3027831c083b,b77bfbe9-fc55-4290-a416-c12c0a1d378c,ba21743e-4745-4ae7-97d7-6f8da3d9666b,aaa3e812-45fb-4924-aa6d-08331a91d9e5,dd1ebf44-3740-4034-81f7-cd3b674a4840,92b766ce-1145-413b-bfee-1f12a84e08ad,370abcb9-a540-4a63-8cb2-8cc89689c499,164f7f77-5a1a-47ca-bb63-e1dd038198fc,5e176a4d-8ff6-4525-a910-97b9f91eddad,ca5c2e4d-cacc-4ef4-9855-cef84545b520,a35ed7a1-9820-43d2-a995-8b1da39ebf60,9d020391-31ef-493f-bff4-1dce40d03aa2,2e6297bb-6e65-4bea-a38d-3c0133f7fc48,9c6fdd4f-3755-4722-8ce0-a139d5f177ed,8b07c2e2-1f1c-487a-a4f1-64b1f50508c8,0ffd75c6-2f3f-4ed8-9ed1-68cdba3cd682,05b81535-be48-4647-a667-407976bd2396,6a37e1ec-783a-4cd6-8e63-876101aef889,2ba2dfed-469c-44cb-bcde-fce8cd1ee9d1,960f74a5-40e1-4a8b-946c-8a7aa14f0629,972e51ba-4f2d-4c89-befa-eee90ab07398,20387635-7505-4a35-9e60-09b41b8569e9,81b4caa0-1c58-418f-8ad7-77641742d011,69397875-ca71-4a41-b05e-fa7740572d11,393128e5-5ba0-44cb-a4e2-521d0fccadd7,ecce8c02-67f0-4d83-8a30-2a0bed3bae8c,e9a1416e-1ea8-419a-b274-f0efaa4700c1,f30634ae-8910-4263-ad7f-f847c1ef6846,9dcbe6bf-798a-46b9-8479-352ef2247788,1fbfd196-8d10-4b93-86fd-e77c9668fda4,2cc0de5f-812d-46a9-98c3-4701867806c0,43ccbd94-3523-475c-b4a8-906e1f68ed87,4b77e5cf-ff40-4fca-8a68-a5228efd0472,9d26af9e-7b6b-4c82-a9b2-e7037eccf299,40913b5f-dd43-4530-8059-8dc798849c64,521f7775-0a9d-4353-8d39-a7af35547eea,52d2c500-30de-415e-afa2-0d27d4215e0b,d5497e52-11c8-4437-8873-6a412481aa81,0e356ef4-f25c-4a0b-966f-d1fe6cfb2132,01324ed1-9bea-4d49-9bd4-4143f405e068,229db719-fe33-4459-aea7-956bc08b0600,b6177bd2-f92d-4e9e-9f98-9898e286f662,c6478917-8528-4601-9210-127c85e9137f,68b6bdb4-db51-4bff-88f4-3e7913a5a01d,8df4c0ec-d239-4418-8711-62ef8ab7f010,97ccb4a8-c6a0-44ab-99f1-214d6fec6f6b,c304f8b3-8088-4dd0-986b-ff96e93454be,957cb6b8-5033-4fb3-8bf6-e3da20c50e2e,a1af712f-669a-490a-813f-01af973f0aa5,f68d6f90-ab48-412e-9eba-eda2377b3e2c,bca58a87-ebe7-42d3-aeda-d8abfe3db4f7,ceda6fd4-83ac-4214-9575-c0cca2c7bb16,225f0756-6888-4143-af37-f61deec33c00,218c4132-5f87-488a-9bac-69a4ef228aff,7ceff2c2-5f31-4933-a700-ddbc7e707971,ce516dd7-4481-4e2a-945e-16612c0e5bf9,e7943912-37bf-407b-9f4b-2736a460c916,011a46fd-6c03-4ceb-b221-15a02576abbc,40fbd4e2-7260-4b2b-928e-72fb92bdd830,3fb6819b-1c92-45ff-9091-635c03618c9c,196c20e6-4586-4860-b7b5-e44fba16fb40,351a1315-31a9-40aa-8419-183dd7dbeda6,c6c346c9-61b2-401d-a82b-cab503f568e6,056a8b1c-bcf4-4ba8-ae7b-859b350eb7bc,30ed1a38-d39a-457d-a3f9-1c7925269652,38e51c61-18ae-4d66-ac3f-914a8098f34f,e3d5f15d-0aa5-4db9-9dc8-cb678def852f,76036fea-ca55-47ac-b9a1-a1782d08d758,a57ee120-3f6b-4cba-8b7a-5c3aee76cdec,37952079-a3ad-4fa0-ab0f-d2dd8c7c1ad4,550f2f75-2863-4bc5-a984-6a43c4747b21,8bf4712b-6495-4c53-8403-e2789dec7f11,46fa221d-8992-4217-9c91-3a59fda72ce5,b6e8f890-3cab-4c23-9806-cd02baeb0447,2d944812-00a2-4659-a26e-cec502a887cf,bc9b4985-f2f7-4679-8993-b7afc1dd4af4,3bd7bd8d-5eda-41b3-87e5-22af6f589dac,87b8d5cc-7a3e-4a04-9756-d21186f8867a,435e19b2-616b-4b42-bed4-8f7b2a1200d0,8a9b055c-96e0-4694-a380-f2bad3d2b785,6ed0e8fe-a15a-403c-8ee7-316ac0fc3f69,293800d5-9846-4a74-9dd3-da8c0edf43ec,feb6c055-1272-433c-b08f-8eb729e43d5e,adeb2fdf-bfc7-4838-94e0-0783dd34d2c9,d18e23ab-c6f8-4427-9ead-519e9d7fcdb3,59923cfb-de47-474f-9206-b0396bbcb291,32946116-c44f-43bd-884d-e70b57d4a345,d46ed4ed-2f73-49b5-b77d-99a8c0a0a16e,b9c7497a-8659-4d26-9e10-1a8cb6e096ec,aa9ad57f-6c03-4534-992b-5b9e340574d3,6994c7db-d2e1-4dfc-ad22-679a2a3799ee,7d112a22-a40b-4b0e-a79d-ab68fef4f868,0bcd21b8-8921-406d-9324-8fe062aac213,b3c50f93-85d4-46b3-a3c1-c898794c9673,d2ced025-c71d-48ff-b86e-f4069f07a0e9,5529fd3e-57fa-4c5e-b028-173c315758f6,4e685d01-6702-423e-9547-10077092080b,43ebed46-3f84-443f-8e47-e893adcbfb47,c30b9799-578a-4224-9329-fff44e64f281,75ab7091-3a3b-413d-b005-388fbec3d1c2,33f0b2c3-d833-436d-a0dc-077d8515c486,c18c0623-387a-4289-b225-9dd5e0582198,7b28a33e-9aad-4e38-b761-d92d33900695,976ff4d1-949c-42c7-acee-2dd5d8bca9ef,7f7e1f41-470f-420c-83aa-e97c6f518568,8eff9a5d-3b7f-497a-81a3-a947ead96f5d,e23939f1-0d82-45b9-ab49-dae2b4457ba6,65d2d43b-356d-4ae8-b69f-e6464971ccf1,4baed9af-0c81-4b08-b993-08c34959ff95,44193811-c902-48c3-8ab3-41f4772bdbdd,f6cb83a2-707c-4063-a40e-ec8775dc4cdd,d38b5c70-0c35-425d-9511-43ad08c36661,ea232869-e51a-4523-aeb3-ff9021071aba,fddbcca5-081c-4f9d-a74d-9638d2f331c9,9f413516-fe61-449d-ba63-113402ba7dce,e50129ea-3f7b-469a-9f61-78cb5720a78b,9298f430-8efd-4828-bf9c-2cc49bb39c28,12e48177-7688-4c46-8bdb-10b5b6d83bca,ab8a40c8-e56f-4f4a-8cc6-d435868e592a,ca771c62-5e15-44de-b29a-577af2bc412e,08eabff5-e3f0-473f-990d-06a1f7ab5494,4fa5bdf1-92d6-400b-aeae-02028e59d3fc,9775288b-bbcc-4118-8aad-fd1cdd3ce746,949149e1-573c-4545-9854-aef334883d05,319d6714-7016-4820-9fc8-a6695fcd95ff,86338431-c91d-4915-b3d3-92f919e79303,8306838b-7a1c-43f7-be39-9b20de0b7505,e1b4da17-0dd9-4e59-90f4-dc7b4e368936,fa5ef6d4-8300-4061-95e4-9235e475ed05,d134418f-4c58-41f2-823b-c9897935cc24,14ce83f8-7586-47f1-969c-9f690ae54043,ccb53c3a-a518-4531-a943-78eeb5b3529f,e860b3e7-092b-4ff4-8ddc-fef6bb790e3f,f647999a-829e-448a-9247-e1ab681389e2,9c97c1fb-23b1-454e-9508-9a0dbd5ea6ea,a64d7711-641c-4dc5-ba1d-a1ba8088f30e,2f3b74b0-5509-4dce-a541-feebe3232205,c562811d-b51a-4f03-aa4a-38c2983f3f30,bb5ff0fa-1006-499f-9f36-35998068bacc,1bb8c483-c9c3-4677-b08c-51feb1c074e8,5c951d8f-f3b5-410f-8f9d-85c8b49d29ac,697d0f63-afee-4ed9-8abf-1f7c2b4f55b0,f09fcb91-bb30-42f4-9cae-1838045cec6e,48821c2f-60d4-46d8-900c-b19fdfd092e6,159536c9-e0b0-48de-b8e1-1316be68bd69,1c8ff040-6b05-44f2-bad7-acf16654d0e3,8cfc58da-5a90-4f79-ba87-0b70b257b4d6,72dcbefd-738a-46d2-8010-16e1bf533762,b1ce4e69-bcc2-4740-bd44-25c4d5ebb169,9215cbd5-9e2e-47e5-92a8-0d3f6157a598,34700243-30f4-4db2-9fa8-24cc16fbcd58,7abcf2be-9380-464e-9836-45be4c9d13a1,6855326f-7c92-4c6a-9f55-6f1de3cb4d40}'::uuid[])). Review existing indexes or add an index matching that predicate/expression.
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
- Seq Scan on documents (665 rows) with filter ((deleted_at IS NULL) AND (title ~~* '%Standup%'::text) AND (workspace_id = 'b9ed9dc6-5d3a-41fc-99c5-1f8dc4ec7a3d'::uuid) AND (document_type = ANY ('{wiki,issue,project,program}'::document_type[]))). Review existing indexes or add an index matching that predicate/expression.
  Existing indexes: documents_pkey, idx_documents_workspace_id, idx_documents_parent_id, idx_documents_document_type, idx_documents_properties, idx_documents_person_user_id, idx_documents_visibility, idx_documents_visibility_created_by, idx_documents_archived_at, idx_documents_deleted_at, idx_documents_active, idx_documents_converted_to, idx_documents_converted_from

## Trend

- Status: **Baseline** (first run with live-route tracing)
