-- Add challenges table for social financial challenges
CREATE TABLE "challenges" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "creator_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "target_type" text NOT NULL,
    "target_amount" numeric(12,2) NOT NULL,
    "target_category_id" uuid,
    "currency" text DEFAULT 'USD',
    "start_date" timestamp DEFAULT now() NOT NULL,
    "end_date" timestamp NOT NULL,
    "is_public" boolean DEFAULT true,
    "max_participants" integer,
    "status" text DEFAULT 'active',
    "rules" jsonb DEFAULT '{}',
    "metadata" jsonb DEFAULT '{"tags": [], "difficulty": "medium", "category": "savings"}',
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- Add challenge_participants table
CREATE TABLE "challenge_participants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "challenge_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "joined_at" timestamp DEFAULT now(),
    "current_progress" numeric(12,2) DEFAULT '0',
    "target_progress" numeric(12,2) NOT NULL,
    "status" text DEFAULT 'active',
    "last_updated" timestamp DEFAULT now(),
    "metadata" jsonb DEFAULT '{"milestones": [], "streak": 0, "best_streak": 0}',
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- Add foreign key constraints
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_target_category_id_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "categories"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Add unique constraint to prevent duplicate participation
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_user_id_unique" UNIQUE("challenge_id","user_id");

-- Add indexes for performance
CREATE INDEX "challenges_creator_id_idx" ON "challenges"("creator_id");
CREATE INDEX "challenges_status_idx" ON "challenges"("status");
CREATE INDEX "challenges_start_date_end_date_idx" ON "challenges"("start_date","end_date");
CREATE INDEX "challenge_participants_challenge_id_idx" ON "challenge_participants"("challenge_id");
CREATE INDEX "challenge_participants_user_id_idx" ON "challenge_participants"("user_id");
CREATE INDEX "challenge_participants_status_idx" ON "challenge_participants"("status");
