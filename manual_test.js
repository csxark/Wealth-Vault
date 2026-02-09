
import express from 'express';
import request from 'supertest';
import expensesRouter from './backend/routes/expenses.js';

const app = express();
app.use(express.json());
app.use('/api/expenses', expensesRouter);

async function test() {
    try {
        console.log('Starting manual test...');
        const res = await request(app).get('/api/expenses');
        console.log('Status:', res.status);
    } catch (err) {
        console.error('FAILED:', err);
    }
}

test();
