import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-jwt-secret-for-tests';

export const TEST_USER = {
  id: 'test-user-123',
  email: 'test@example.com',
  role: 'authenticated'
};

export const TEST_ADMIN = {
  id: 'admin-user-456',
  email: 'admin@test.com',
  role: 'authenticated'
};

export const ANONYMOUS_USER = {
  id: 'anonymous',
  email: null,
  role: 'anon'
};

export function createTestToken(user = TEST_USER) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export function createAuthHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}
