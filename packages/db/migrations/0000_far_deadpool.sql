CREATE TYPE "public"."tier" AS ENUM('beginner', 'intermediate', 'advanced', 'master');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tactics" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"tier" "tier" NOT NULL,
	"order_in_tier" integer NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "tactics_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tactics_tier_order_uq" UNIQUE("tier","order_in_tier")
);
--> statement-breakpoint
CREATE TABLE "tactic_puzzles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tactic_id" integer NOT NULL,
	"grid_state" varchar(81) NOT NULL,
	"solution_state" varchar(81) NOT NULL,
	"step_data" jsonb NOT NULL,
	"is_teaching_example" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tactic_progress" (
	"user_id" uuid NOT NULL,
	"tactic_id" integer NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "user_tactic_progress_user_id_tactic_id_pk" PRIMARY KEY("user_id","tactic_id")
);
--> statement-breakpoint
CREATE TABLE "user_favorite_tactics" (
	"user_id" uuid NOT NULL,
	"tactic_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_tactics_user_id_tactic_id_pk" PRIMARY KEY("user_id","tactic_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tactic_puzzles" ADD CONSTRAINT "tactic_puzzles_tactic_id_tactics_id_fk" FOREIGN KEY ("tactic_id") REFERENCES "public"."tactics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tactic_progress" ADD CONSTRAINT "user_tactic_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tactic_progress" ADD CONSTRAINT "user_tactic_progress_tactic_id_tactics_id_fk" FOREIGN KEY ("tactic_id") REFERENCES "public"."tactics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_tactics" ADD CONSTRAINT "user_favorite_tactics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_tactics" ADD CONSTRAINT "user_favorite_tactics_tactic_id_tactics_id_fk" FOREIGN KEY ("tactic_id") REFERENCES "public"."tactics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tactic_puzzles_tactic_id_idx" ON "tactic_puzzles" USING btree ("tactic_id");