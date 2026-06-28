import db from '../config/db.js';
import { fixedAssets, assetValuations } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

class AssetRepository {
    async findById(id, userId) {
        return await db.query.fixedAssets.findFirst({
            where: and(eq(fixedAssets.id, id), eq(fixedAssets.userId, userId)),
            with: {
                valuations: {
                    orderBy: [desc(assetValuations.date)],
                    limit: 20,
                },
            },
        });
    }

    async findFirst(id) {
        return await db.query.fixedAssets.findFirst({
            where: eq(fixedAssets.id, id),
        });
    }

    async findAll(userId) {
        return await db.query.fixedAssets.findMany({
            where: eq(fixedAssets.userId, userId),
            with: {
                valuations: {
                    orderBy: [desc(assetValuations.date)],
                    limit: 5,
                },
            },
            orderBy: [desc(fixedAssets.createdAt)],
        });
    }

    async findSimpleAll(userId) {
        return await db
            .select()
            .from(fixedAssets)
            .where(eq(fixedAssets.userId, userId));
    }

    async create(data) {
        const [asset] = await db
            .insert(fixedAssets)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();
        return asset;
    }

    async update(id, data) {
        const [updated] = await db
            .update(fixedAssets)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(fixedAssets.id, id))
            .returning();
        return updated;
    }

    async delete(id, userId) {
        const [asset] = await db
            .select()
            .from(fixedAssets)
            .where(and(eq(fixedAssets.id, id), eq(fixedAssets.userId, userId)));

        if (!asset) return null;

        await db.delete(fixedAssets).where(eq(fixedAssets.id, id));
        return asset;
    }

    async addValuation(data) {
        const [valuation] = await db
            .insert(assetValuations)
            .values({
                ...data,
                date: new Date(),
            })
            .returning();
        return valuation;
    }

    async findValuations(assetId, limit = 5) {
        return await db
            .select()
            .from(assetValuations)
            .where(eq(assetValuations.assetId, assetId))
            .orderBy(desc(assetValuations.date))
            .limit(limit);
    }
}

export default new AssetRepository();
