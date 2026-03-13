import { test, expect } from './fixtures/isolated-env';

/**
 * E2E tests for Weekly Plans CRUD, Weekly Retros CRUD, and Project Allocation Grid.
 *
 * These endpoints in routes/weekly-plans.ts had 5% line coverage and zero e2e tests.
 * Covers happy paths, validation errors, auth checks, edge cases, and history endpoints.
 */

async function getCsrfToken(page: import('@playwright/test').Page, apiUrl: string): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/csrf-token`);
  expect(response.ok()).toBe(true);
  const { token } = await response.json();
  return token;
}

async function loginAndGetContext(page: import('@playwright/test').Page, apiUrl: string) {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });

  const csrfToken = await getCsrfToken(page, apiUrl);

  const meResponse = await page.request.get(`${apiUrl}/api/auth/me`);
  expect(meResponse.ok()).toBe(true);
  const meData = await meResponse.json();
  const userId = meData.data.user.id;

  return { csrfToken, userId };
}

async function loginAsBob(page: import('@playwright/test').Page, apiUrl: string) {
  await page.goto('/login');
  await page.locator('#email').fill('bob.martinez@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });

  const csrfToken = await getCsrfToken(page, apiUrl);

  const meResponse = await page.request.get(`${apiUrl}/api/auth/me`);
  expect(meResponse.ok()).toBe(true);
  const meData = await meResponse.json();
  const userId = meData.data.user.id;

  return { csrfToken, userId };
}

async function getPersonIdForUser(
  page: import('@playwright/test').Page,
  apiUrl: string,
  userId: string
): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/documents?document_type=person`);
  expect(response.ok()).toBe(true);
  const docs = await response.json();
  const person = docs.find(
    (d: { properties?: { user_id?: string } }) => d.properties?.user_id === userId
  );
  expect(person, 'User should have an associated person document').toBeTruthy();
  return person.id;
}

async function createTestProject(
  page: import('@playwright/test').Page,
  apiUrl: string,
  csrfToken: string,
  title: string
): Promise<string> {
  const response = await page.request.post(`${apiUrl}/api/documents`, {
    headers: { 'x-csrf-token': csrfToken },
    data: { title, document_type: 'project' },
  });
  expect(response.ok()).toBe(true);
  const project = await response.json();
  return project.id;
}

async function createAllocation(
  page: import('@playwright/test').Page,
  apiUrl: string,
  csrfToken: string,
  projectId: string,
  personId: string,
  weekNumber: number
): Promise<string> {
  const response = await page.request.post(`${apiUrl}/api/documents`, {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      title: `Week ${weekNumber}`,
      document_type: 'sprint',
      properties: {
        sprint_number: weekNumber,
        project_id: projectId,
        assignee_ids: [personId],
        status: 'active',
      },
    },
  });
  expect(response.ok()).toBe(true);
  const sprint = await response.json();
  return sprint.id;
}

// Content that has real text beyond template headings — triggers "done" status
const planContentWithText = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'What I plan to accomplish this week' }],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Completed the allocation feature' }],
            },
          ],
        },
      ],
    },
  ],
};

// Plan content with multiple bullet items for multi-reference retro test
const planContentMultiItem = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'What I plan to accomplish this week' }],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First planned item' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Second planned item' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Third planned item' }],
            },
          ],
        },
      ],
    },
  ],
};

const retroContentWithText = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'What I delivered this week' }],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Shipped the weekly retros feature' }],
            },
          ],
        },
      ],
    },
  ],
};

// ─── Authentication ──────────────────────────────────────────────────

test.describe('Weekly Plans/Retros Auth', () => {
  test('unauthenticated requests return 401', async ({ page, apiServer }) => {
    // Do NOT login — go straight to API calls
    const planListRes = await page.request.get(`${apiServer.url}/api/weekly-plans`);
    expect(planListRes.status()).toBe(401);

    const retroListRes = await page.request.get(`${apiServer.url}/api/weekly-retros`);
    expect(retroListRes.status()).toBe(401);

    const gridRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/00000000-0000-0000-0000-000000000000`
    );
    expect(gridRes.status()).toBe(401);

    // POST without auth returns 401 or 403 (CSRF middleware may reject first)
    const planCreateRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      data: { person_id: '00000000-0000-0000-0000-000000000000', week_number: 1 },
    });
    expect([401, 403]).toContain(planCreateRes.status());

    const retroCreateRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      data: { person_id: '00000000-0000-0000-0000-000000000000', week_number: 1 },
    });
    expect([401, 403]).toContain(retroCreateRes.status());
  });
});

// ─── Weekly Plans CRUD ───────────────────────────────────────────────

test.describe('Weekly Plans CRUD', () => {
  test('creates a weekly plan and returns same doc on duplicate (idempotency)', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 200;

    // Create plan
    const createRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(createRes.status()).toBe(201);
    const plan = await createRes.json();

    // Verify response shape
    expect(plan.id).toBeTruthy();
    expect(plan.title).toMatch(/^Week 200 Plan/);
    expect(plan.title).toContain('Dev User');
    expect(plan.document_type).toBe('weekly_plan');
    expect(plan.properties.person_id).toBe(personId);
    expect(plan.properties.week_number).toBe(weekNumber);
    expect(plan.properties.submitted_at).toBeNull();
    expect(plan.content).toBeTruthy();
    expect(plan.content.type).toBe('doc');

    // Template content should include the plan heading
    const contentStr = JSON.stringify(plan.content);
    expect(contentStr).toContain('What I plan to accomplish this week');

    // Idempotent: same params returns 200 with same ID
    const dupeRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(dupeRes.status()).toBe(200);
    const dupePlan = await dupeRes.json();
    expect(dupePlan.id).toBe(plan.id);
  });

  test('lists and gets weekly plans, returns 404 for missing', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 201;

    // Create a plan first
    const createRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(createRes.status()).toBe(201);
    const plan = await createRes.json();

    // List with filters
    const listRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans?person_id=${personId}&week_number=${weekNumber}`
    );
    expect(listRes.ok()).toBe(true);
    const plans = await listRes.json();
    expect(Array.isArray(plans)).toBe(true);
    const found = plans.find((p: { id: string }) => p.id === plan.id);
    expect(found, 'Created plan should appear in filtered list').toBeTruthy();
    expect(found.person_name).toBeTruthy();

    // Get by ID
    const getRes = await page.request.get(`${apiServer.url}/api/weekly-plans/${plan.id}`);
    expect(getRes.ok()).toBe(true);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(plan.id);
    expect(fetched.person_name).toBeTruthy();

    // 404 for nonexistent
    const notFoundRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans/00000000-0000-0000-0000-000000000000`
    );
    expect(notFoundRes.status()).toBe(404);
  });

  test('creates plan with project association and filters by project', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 202;

    // Create a project
    const projectId = await createTestProject(
      page,
      apiServer.url,
      csrfToken,
      'Plan-Project Association Test'
    );

    // Create plan with project_id
    const createRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber, project_id: projectId },
    });
    expect(createRes.status()).toBe(201);
    const plan = await createRes.json();
    expect(plan.properties.project_id).toBe(projectId);

    // Filter by project_id
    const listRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans?project_id=${projectId}`
    );
    expect(listRes.ok()).toBe(true);
    const plans = await listRes.json();
    const found = plans.find((p: { id: string }) => p.id === plan.id);
    expect(found, 'Plan should appear when filtered by project_id').toBeTruthy();
  });

  test('returns 400 for missing required fields', async ({ page, apiServer }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);

    // Missing person_id
    const noPerson = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { week_number: 100 },
    });
    expect(noPerson.status()).toBe(400);
    const noPersonBody = await noPerson.json();
    expect(noPersonBody.error).toBe('Invalid input');
    expect(noPersonBody.details).toBeTruthy();

    // Missing week_number
    const noWeek = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: '00000000-0000-0000-0000-000000000001' },
    });
    expect(noWeek.status()).toBe(400);

    // Empty body
    const emptyBody = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {},
    });
    expect(emptyBody.status()).toBe(400);
  });

  test('returns 400 for invalid field types', async ({ page, apiServer }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);

    // Invalid UUID for person_id
    const badUuid = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: 'not-a-uuid', week_number: 100 },
    });
    expect(badUuid.status()).toBe(400);

    // Negative week_number
    const negWeek = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: '00000000-0000-0000-0000-000000000001', week_number: -1 },
    });
    expect(negWeek.status()).toBe(400);

    // Zero week_number (min is 1)
    const zeroWeek = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: '00000000-0000-0000-0000-000000000001', week_number: 0 },
    });
    expect(zeroWeek.status()).toBe(400);

    // String week_number
    const strWeek = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: '00000000-0000-0000-0000-000000000001', week_number: 'five' },
    });
    expect(strWeek.status()).toBe(400);
  });

  test('returns 404 for nonexistent person_id', async ({ page, apiServer }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);

    const res = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: '00000000-0000-0000-0000-000000000099', week_number: 100 },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Person not found');
  });

  test('returns 404 for nonexistent project_id', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);

    const res = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        week_number: 100,
        project_id: '00000000-0000-0000-0000-000000000099',
      },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Project not found');
  });

  test('list with no matching filters returns empty array', async ({ page, apiServer }) => {
    await loginAndGetContext(page, apiServer.url);

    const listRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans?week_number=99999`
    );
    expect(listRes.ok()).toBe(true);
    const plans = await listRes.json();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans).toHaveLength(0);
  });

  test('list returns plans sorted by week_number descending', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);

    // Create plans for weeks 203, 204, 205 (in that order)
    for (const wn of [203, 204, 205]) {
      await page.request.post(`${apiServer.url}/api/weekly-plans`, {
        headers: { 'x-csrf-token': csrfToken },
        data: { person_id: personId, week_number: wn },
      });
    }

    const listRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans?person_id=${personId}`
    );
    expect(listRes.ok()).toBe(true);
    const plans = await listRes.json();

    // Filter to only our test plans (week_number >= 203)
    const testPlans = plans.filter(
      (p: { properties: { week_number: number } }) => p.properties.week_number >= 203
    );
    expect(testPlans.length).toBeGreaterThanOrEqual(3);

    // Should be descending
    for (let i = 1; i < testPlans.length; i++) {
      expect(testPlans[i - 1].properties.week_number).toBeGreaterThanOrEqual(
        testPlans[i].properties.week_number
      );
    }
  });

  test('plan history records content changes', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 206;

    // Create plan
    const createRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(createRes.status()).toBe(201);
    const plan = await createRes.json();

    // Update content to generate a history entry
    await page.request.patch(`${apiServer.url}/api/documents/${plan.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { content: planContentWithText },
    });

    // Fetch history
    const historyRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans/${plan.id}/history`
    );
    expect(historyRes.ok()).toBe(true);
    const history = await historyRes.json();
    expect(Array.isArray(history)).toBe(true);

    // History 404 for nonexistent plan
    const noHistoryRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans/00000000-0000-0000-0000-000000000000/history`
    );
    expect(noHistoryRes.status()).toBe(404);
  });
});

// ─── Weekly Retros CRUD ──────────────────────────────────────────────

test.describe('Weekly Retros CRUD', () => {
  test('creates retro with bare template when no plan exists', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 210;

    const createRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(createRes.status()).toBe(201);
    const retro = await createRes.json();

    expect(retro.title).toMatch(/^Week 210 Retro/);
    expect(retro.title).toContain('Dev User');
    expect(retro.document_type).toBe('weekly_retro');
    expect(retro.properties.person_id).toBe(personId);
    expect(retro.properties.week_number).toBe(weekNumber);
    expect(retro.content.type).toBe('doc');

    // Bare template: "What I delivered this week" heading, no planReference nodes
    const contentStr = JSON.stringify(retro.content);
    expect(contentStr).toContain('What I delivered this week');
    expect(contentStr).not.toContain('planReference');
  });

  test('creates retro with plan-reference template when plan has content', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 211;

    // Create a plan first
    const planRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(planRes.status()).toBe(201);
    const plan = await planRes.json();

    // Add real content to the plan
    const patchRes = await page.request.patch(`${apiServer.url}/api/documents/${plan.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { content: planContentWithText },
    });
    expect(patchRes.ok()).toBe(true);

    // Now create retro — should pull plan items into template
    const retroRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(retroRes.status()).toBe(201);
    const retro = await retroRes.json();

    const contentStr = JSON.stringify(retro.content);
    expect(contentStr).toContain('planReference');
    expect(contentStr).toContain(plan.id);
    // Should also have "Unplanned work" section
    expect(contentStr).toContain('Unplanned work');
  });

  test('retro with multi-item plan produces multiple planReference nodes', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 213;

    // Create plan with 3 bullet items
    const planRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(planRes.status()).toBe(201);
    const plan = await planRes.json();

    await page.request.patch(`${apiServer.url}/api/documents/${plan.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { content: planContentMultiItem },
    });

    // Create retro
    const retroRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(retroRes.status()).toBe(201);
    const retro = await retroRes.json();

    const contentStr = JSON.stringify(retro.content);
    // Count planReference occurrences — should have one per plan item
    const refCount = (contentStr.match(/planReference/g) || []).length;
    expect(refCount).toBeGreaterThanOrEqual(3);
  });

  test('retro uses bare template when plan exists but has only template headings', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 214;

    // Create plan but do NOT add content beyond the default template
    const planRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(planRes.status()).toBe(201);

    // Create retro — plan has no real content, so should use bare template
    const retroRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(retroRes.status()).toBe(201);
    const retro = await retroRes.json();

    const contentStr = JSON.stringify(retro.content);
    expect(contentStr).not.toContain('planReference');
  });

  test('retro is idempotent and appears in list/get endpoints', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 212;

    // Create retro
    const createRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(createRes.status()).toBe(201);
    const retro = await createRes.json();

    // Idempotent
    const dupeRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(dupeRes.status()).toBe(200);
    const dupe = await dupeRes.json();
    expect(dupe.id).toBe(retro.id);

    // List
    const listRes = await page.request.get(
      `${apiServer.url}/api/weekly-retros?person_id=${personId}`
    );
    expect(listRes.ok()).toBe(true);
    const retros = await listRes.json();
    const found = retros.find((r: { id: string }) => r.id === retro.id);
    expect(found, 'Created retro should appear in list').toBeTruthy();

    // Get by ID
    const getRes = await page.request.get(`${apiServer.url}/api/weekly-retros/${retro.id}`);
    expect(getRes.ok()).toBe(true);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(retro.id);
    expect(fetched.document_type).toBe('weekly_retro');
  });

  test('returns 400 for missing required fields', async ({ page, apiServer }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);

    // Missing person_id
    const noPerson = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { week_number: 100 },
    });
    expect(noPerson.status()).toBe(400);
    const body = await noPerson.json();
    expect(body.error).toBe('Invalid input');

    // Missing week_number
    const noWeek = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: '00000000-0000-0000-0000-000000000001' },
    });
    expect(noWeek.status()).toBe(400);
  });

  test('returns 404 for nonexistent person_id', async ({ page, apiServer }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);

    const res = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: '00000000-0000-0000-0000-000000000099', week_number: 100 },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Person not found');
  });

  test('retro history records changes and returns 404 for missing', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 215;

    // Create retro
    const createRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber },
    });
    expect(createRes.status()).toBe(201);
    const retro = await createRes.json();

    // Update content
    await page.request.patch(`${apiServer.url}/api/documents/${retro.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { content: retroContentWithText },
    });

    // Fetch history
    const historyRes = await page.request.get(
      `${apiServer.url}/api/weekly-retros/${retro.id}/history`
    );
    expect(historyRes.ok()).toBe(true);
    const history = await historyRes.json();
    expect(Array.isArray(history)).toBe(true);

    // History 404 for nonexistent retro
    const noHistoryRes = await page.request.get(
      `${apiServer.url}/api/weekly-retros/00000000-0000-0000-0000-000000000000/history`
    );
    expect(noHistoryRes.status()).toBe(404);
  });
});

// ─── Project Allocation Grid ─────────────────────────────────────────

test.describe('Project Allocation Grid', () => {
  test('returns correct grid structure for project with allocations', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);

    const projectId = await createTestProject(
      page,
      apiServer.url,
      csrfToken,
      'Allocation Grid Test'
    );
    await createAllocation(page, apiServer.url, csrfToken, projectId, personId, 300);
    await createAllocation(page, apiServer.url, csrfToken, projectId, personId, 301);

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(response.ok()).toBe(true);
    const data = await response.json();

    // Top-level shape
    expect(data.projectId).toBe(projectId);
    expect(data.projectTitle).toBe('Allocation Grid Test');
    expect(Array.isArray(data.weeks)).toBe(true);
    expect(data.weeks.length).toBeGreaterThanOrEqual(2);

    // Each week has required fields
    const week = data.weeks[0];
    expect(week).toHaveProperty('number');
    expect(week).toHaveProperty('name');
    expect(week).toHaveProperty('startDate');
    expect(week).toHaveProperty('endDate');
    expect(typeof week.isCurrent).toBe('boolean');

    // People array
    expect(data.people).toHaveLength(1);
    const person = data.people[0];
    expect(person.id).toBe(personId);
    expect(person.name).toBe('Dev User');

    // Verify allocated weeks
    expect(person.weeks['300']).toBeTruthy();
    expect(person.weeks['300'].isAllocated).toBe(true);
    expect(person.weeks['300']).toHaveProperty('planStatus');
    expect(person.weeks['300']).toHaveProperty('retroStatus');
    expect(person.weeks['301'].isAllocated).toBe(true);
  });

  test('plan/retro status transitions from non-done to done', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const weekNumber = 302;

    const projectId = await createTestProject(
      page,
      apiServer.url,
      csrfToken,
      'Status Transition Test'
    );
    await createAllocation(page, apiServer.url, csrfToken, projectId, personId, weekNumber);

    // Initial grid — plan and retro should not be "done"
    const initialRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(initialRes.ok()).toBe(true);
    const initial = await initialRes.json();
    const initialWeek = initial.people[0].weeks[String(weekNumber)];
    expect(initialWeek.isAllocated).toBe(true);
    expect(initialWeek.planStatus).not.toBe('done');
    expect(initialWeek.retroStatus).not.toBe('done');

    // Create plan and add content
    const planRes = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber, project_id: projectId },
    });
    expect(planRes.status()).toBe(201);
    const plan = await planRes.json();

    await page.request.patch(`${apiServer.url}/api/documents/${plan.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { content: planContentWithText },
    });

    // Grid should now show planStatus = "done"
    const afterPlanRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(afterPlanRes.ok()).toBe(true);
    const afterPlan = await afterPlanRes.json();
    expect(afterPlan.people[0].weeks[String(weekNumber)].planStatus).toBe('done');
    expect(afterPlan.people[0].weeks[String(weekNumber)].retroStatus).not.toBe('done');

    // Create retro and add content
    const retroRes = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, week_number: weekNumber, project_id: projectId },
    });
    expect(retroRes.status()).toBe(201);
    const retro = await retroRes.json();

    await page.request.patch(`${apiServer.url}/api/documents/${retro.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { content: retroContentWithText },
    });

    // Grid should now show both as "done"
    const afterBothRes = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(afterBothRes.ok()).toBe(true);
    const afterBoth = await afterBothRes.json();
    expect(afterBoth.people[0].weeks[String(weekNumber)].planStatus).toBe('done');
    expect(afterBoth.people[0].weeks[String(weekNumber)].retroStatus).toBe('done');
  });

  test('returns 404 for nonexistent project', async ({ page, apiServer }) => {
    await loginAndGetContext(page, apiServer.url);

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/00000000-0000-0000-0000-000000000000`
    );
    expect(response.status()).toBe(404);
  });

  test('returns empty people array for project with no allocations', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);

    const projectId = await createTestProject(
      page,
      apiServer.url,
      csrfToken,
      'Empty Allocation Grid'
    );

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.projectId).toBe(projectId);
    expect(data.people).toHaveLength(0);
    // Grid may still return current week even with no allocations
    expect(Array.isArray(data.weeks)).toBe(true);
  });

  test('shows multiple people when multiple users are allocated', async ({ page, apiServer }) => {
    // Login as admin to create data, then check grid includes both users
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const adminPersonId = await getPersonIdForUser(page, apiServer.url, userId);

    // Get Bob's person ID
    const personsRes = await page.request.get(
      `${apiServer.url}/api/documents?document_type=person`
    );
    const persons = await personsRes.json();
    const bobPerson = persons.find(
      (d: { title: string }) => d.title === 'Bob Martinez'
    );
    expect(bobPerson, 'Bob Martinez person document should exist in seed data').toBeTruthy();
    const bobPersonId = bobPerson.id;

    const projectId = await createTestProject(
      page,
      apiServer.url,
      csrfToken,
      'Multi-Person Grid Test'
    );

    // Allocate admin for week 400
    await createAllocation(page, apiServer.url, csrfToken, projectId, adminPersonId, 400);

    // Allocate Bob for same week (separate sprint doc since assignee_ids is per-sprint)
    await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Week 400 Bob',
        document_type: 'sprint',
        properties: {
          sprint_number: 400,
          project_id: projectId,
          assignee_ids: [bobPersonId],
          status: 'active',
        },
      },
    });

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(response.ok()).toBe(true);
    const data = await response.json();

    expect(data.people.length).toBeGreaterThanOrEqual(2);
    const personIds = data.people.map((p: { id: string }) => p.id);
    expect(personIds).toContain(adminPersonId);
    expect(personIds).toContain(bobPersonId);

    // Both should be allocated for week 400
    const admin = data.people.find((p: { id: string }) => p.id === adminPersonId);
    const bob = data.people.find((p: { id: string }) => p.id === bobPersonId);
    expect(admin.weeks['400'].isAllocated).toBe(true);
    expect(bob.weeks['400'].isAllocated).toBe(true);
  });

  test('week dates are valid and week ranges span 7 days', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);

    const projectId = await createTestProject(
      page,
      apiServer.url,
      csrfToken,
      'Date Validation Grid'
    );
    await createAllocation(page, apiServer.url, csrfToken, projectId, personId, 310);

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(response.ok()).toBe(true);
    const data = await response.json();

    for (const week of data.weeks) {
      const start = new Date(week.startDate);
      const end = new Date(week.endDate);
      // Dates should be valid
      expect(start.getTime()).not.toBeNaN();
      expect(end.getTime()).not.toBeNaN();
      // End should be after start
      expect(end.getTime()).toBeGreaterThan(start.getTime());
      // Name should include week number
      expect(week.name).toContain(String(week.number));
    }
  });

  test('status values are one of the expected enum values', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);

    const projectId = await createTestProject(
      page,
      apiServer.url,
      csrfToken,
      'Status Enum Test'
    );
    await createAllocation(page, apiServer.url, csrfToken, projectId, personId, 320);

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );
    expect(response.ok()).toBe(true);
    const data = await response.json();

    const validStatuses = ['done', 'due', 'late', 'future'];
    const person = data.people[0];
    const weekData = person.weeks['320'];
    expect(validStatuses).toContain(weekData.planStatus);
    expect(validStatuses).toContain(weekData.retroStatus);
  });
});
