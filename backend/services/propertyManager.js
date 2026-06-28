import db from '../config/db.js';
import { properties, propertyMaintenance, fixedAssets } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

class PropertyManager {
    /**
     * Create a new property, optionally linking it to an existing fixed asset
     */
    async createProperty(userId, data) {
        let assetId = data.assetId;

        // If no assetId provided, create a fixed asset first
        if (!assetId) {
            const [newAsset] = await db.insert(fixedAssets).values({
                userId,
                name: data.name || data.address,
                category: 'real_estate',
                purchasePrice: data.purchasePrice || '0',
                currentValue: data.currentValue || data.purchasePrice || '0',
                location: data.address
            }).returning();
            assetId = newAsset.id;
        }

        const [newProperty] = await db.insert(properties).values({
            userId,
            assetId,
            propertyType: data.propertyType,
            address: data.address,
            units: data.units || 1,
            squareFootage: data.squareFootage,
            lotSize: data.lotSize,
            yearBuilt: data.yearBuilt,
            amenities: data.amenities || []
        }).returning();

        return newProperty;
    }

    /**
     * Get all properties for a user with their associated asset data
     */
    async getProperties(userId) {
        return await db.query.properties.findMany({
            where: eq(properties.userId, userId),
            with: {
                asset: true,
                leases: true
            }
        });
    }

    /**
     * Add a maintenance log entry
     */
    async addMaintenanceLog(userId, propertyId, logData) {
        const [log] = await db.insert(propertyMaintenance).values({
            userId,
            propertyId,
            taskName: logData.taskName,
            description: logData.description,
            category: logData.category,
            cost: logData.cost || '0',
            vendorInfo: logData.vendorInfo,
            status: logData.status || 'pending',
            scheduledDate: logData.scheduledDate ? new Date(logData.scheduledDate) : null
        }).returning();

        return log;
    }

    /**
     * Update property details
     */
    async updateProperty(userId, propertyId, updateData) {
        const [updated] = await db.update(properties)
            .set({ ...updateData, updatedAt: new Date() })
            .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
            .returning();

        return updated;
    }
}

export default new PropertyManager();
