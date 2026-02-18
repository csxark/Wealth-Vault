-- Add savings challenges tables
CREATE TABLE "savings_challenges" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "type" text NOT NULL,
    "target_amount" numeric(12,2) NOT NULL,
    "duration" integer NOT NULL,
    "start_date" timestamp NOT NULL,
    "end_date" timestamp NOT NULL,
    "creator_id" uuid NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "rules" jsonb DEFAULT '{"minParticipants":1,"maxParticipants":null,"allowLateJoin":false,"progressTracking":"automatic"}' NOT NULL,
    "rewards" jsonb DEFAULT '{"completionBadge":true,"leaderboardBonus":false,"customRewards":[]}' NOT NULL,
    "metadata" jsonb DEFAULT '{"participantCount":0,"totalProgress":0,"completionRate":0}' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "challenge_participants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "challenge_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "joined_at" timestamp DEFAULT now() NOT NULL,
    "current_progress" numeric(12,2) DEFAULT '0' NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "last_updated" timestamp DEFAULT now() NOT NULL,
    "metadata" jsonb DEFAULT '{"contributions":[],"milestones":[],"streakDays":0}' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "savings_challenges" ADD CONSTRAINT "savings_challenges_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_savings_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "savings_challenges"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Add unique constraint to prevent duplicate participation
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_user_id_unique" UNIQUE("challenge_id","user_id");

-- Add indexes for better performance
CREATE INDEX "savings_challenges_creator_id_idx" ON "savings_challenges"("creator_id");
CREATE INDEX "savings_challenges_type_idx" ON "savings_challenges"("type");
CREATE INDEX "savings_challenges_is_active_idx" ON "savings_challenges"("is_active");
CREATE INDEX "challenge_participants_challenge_id_idx" ON "challenge_participants"("challenge_id");
CREATE INDEX "challenge_participants_user_id_idx" ON "challenge_participants"("user_id");
CREATE INDEX "challenge_participants_status_idx" ON "challenge_participants"("status");
