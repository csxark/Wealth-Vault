
import db from '../config/db.js';
import { employees, payrollRuns, businessLedgers, corporateEntities } from '../db/schema.js';
import { eq, and, sum } from 'drizzle-orm';

class PayrollService {
    /**
     * Add employee to entity
     */
    async addEmployee(entityId, employeeData) {
        return await db.insert(employees).values({
            entityId,
            ...employeeData
        }).returning();
    }

    /**
     * Preview a payroll run (calculate totals without commit)
     */
    async previewPayrollRun(entityId, periodStart, periodEnd) {
        const activeEmployees = await db.select().from(employees).where(
            and(
                eq(employees.entityId, entityId),
                eq(employees.status, 'active')
            )
        );

        let totalGross = 0;
        const employeeDetails = activeEmployees.map(emp => {
            const gross = parseFloat(emp.salary);
            // Simple tax estimation (placeholder - normally complex)
            const tax = gross * 0.20;
            const net = gross - tax;
            totalGross += gross;
            return {
                id: emp.id,
                name: `${emp.firstName} ${emp.lastName}`,
                gross,
                tax,
                net
            };
        });

        return {
            entityId,
            periodStart,
            periodEnd,
            totalGross,
            totalTax: totalGross * 0.20,
            totalNet: totalGross * 0.80,
            employeeCount: activeEmployees.length,
            details: employeeDetails
        };
    }

    /**
     * Execute a payroll run
     */
    async executePayrollRun(entityId, data) {
        return await db.transaction(async (tx) => {
            const [run] = await tx.insert(payrollRuns).values({
                entityId,
                periodStart: new Date(data.periodStart),
                periodEnd: new Date(data.periodEnd),
                totalGross: data.totalGross.toString(),
                totalTax: data.totalTax.toString(),
                totalNet: data.totalNet.toString(),
                status: 'paid',
                paymentDate: new Date()
            }).returning();

            // Record as expense in business ledger
            await tx.insert(businessLedgers).values({
                entityId,
                transactionDate: new Date(),
                description: `Payroll Run ID: ${run.id.substring(0, 8)}`,
                amount: data.totalGross.toString(),
                type: 'expense',
                category: 'payroll',
                refId: run.id
            });

            return run;
        });
    }

    /**
     * Get payroll history for entity
     */
    async getPayrollHistory(entityId) {
        return await db.select().from(payrollRuns)
            .where(eq(payrollRuns.entityId, entityId))
            .orderBy(payrollRuns.createdAt);
    }
}

export default new PayrollService();
