import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../config/db.js';

// Mock the database connection if needed, but setup.js should handle it for now.
// For health check, we might not need DB, but for auth we do.
// Let's start with basic connectivity tests that don't rely heavily on DB state.

describe('API Endpoints', () => {

    describe('GET /api/health', () => {
        it('should return 200 and status OK', async () => {
            const res = await request(app).get('/api/health');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('status', 'OK');
            expect(res.body).toHaveProperty('message', 'Wealth Vault API is running');
        });
    });

    describe('GET /api/nonexistent-route', () => {
        it('should return 404', async () => {
            const res = await request(app).get('/api/nonexistent-route');
            expect(res.statusCode).toEqual(404);
        });
    });

});
