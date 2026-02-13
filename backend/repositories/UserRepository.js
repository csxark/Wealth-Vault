import { eq } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';

class UserRepository {
    async findById(id) {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, id));
        return user;
    }

    async findByEmail(email) {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email));
        return user;
    }

    async create(data) {
        const [newUser] = await db
            .insert(users)
            .values(data)
            .returning();
        return newUser;
    }

    async update(id, data) {
        const [updatedUser] = await db
            .update(users)
            .set(data)
            .where(eq(users.id, id))
            .returning();
        return updatedUser;
    }

    async delete(id) {
        const [deletedUser] = await db
            .delete(users)
            .where(eq(users.id, id))
            .returning();
        return deletedUser;
    }
}

export default new UserRepository();
