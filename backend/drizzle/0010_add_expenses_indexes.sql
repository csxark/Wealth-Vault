CREATE INDEX IF NOT EXISTS "idx_expenses_user_date" ON "expenses" ("user_id", "date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_user_category" ON "expenses" ("user_id", "category_id");
