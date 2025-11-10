const request = require('supertest');
const app = require('../src/app');

describe('Tasks v2 - Idempotency & ABAC', () => {
  let userToken, user2Token, adminToken, taskId;

  const reg = (email) =>
    request(app).post('/api/v1/auth/register').send({ email, password: '123456', name: email.split('@')[0] });
  const login = (email) =>
    request(app).post('/api/v1/auth/login').send({ email, password: '123456' });

  beforeAll(async () => {
    await reg('u1@test.com');
    await reg('u2@test.com');
    await reg('admin@test.com');

    const prisma = require('../src/config/prisma');
    await prisma.user.update({
      where: { email: 'admin@test.com' },
      data: { role: 'admin' }
    });

    userToken  = (await login('u1@test.com')).body.accessToken;
    user2Token = (await login('u2@test.com')).body.accessToken;
    adminToken = (await login('admin@test.com')).body.accessToken;
  });

  test('POST /api/v2/tasks with Idempotency-Key (first -> 201)', async () => {
    const res = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', 'create-task-001')
      .send({ title: 'Fix Bug #42', priority: 'high' });
    expect(res.status).toBe(201);
    taskId = res.body.id;
  });

  test('POST same Idempotency-Key returns cached body 200', async () => {
    const res = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', 'create-task-001')
      .send({ title: 'Fix Bug #42', priority: 'high' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(taskId);
  });

  test('PATCH status by owner OK (200)', async () => {
    const res = await request(app)
      .patch(`/api/v2/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  test('PATCH status by non-owner -> 403', async () => {
    const res = await request(app)
      .patch(`/api/v2/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(403);
  });

  test('PATCH status by admin -> 200', async () => {
    const res = await request(app)
      .patch(`/api/v2/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });
});
