-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('COORDINATOR', 'RESEARCHER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('PRINCIPAL_INVESTIGATOR', 'CO_INVESTIGATOR');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('PROJECT', 'PRIVATE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PROJECT_INVITATION', 'TASK_ASSIGNED', 'TASK_UPDATED', 'PROGRESS_CREATED', 'DOCUMENT_UPLOADED', 'SCHEDULE_UPDATED', 'CHAT_MESSAGE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "system_role" "SystemRole" NOT NULL DEFAULT 'RESEARCHER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "objectives" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "start_date" DATE,
    "end_date" DATE,
    "budget" DECIMAL(14,2),
    "created_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "status" "PhaseStatus" NOT NULL DEFAULT 'PENDING',
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignee_id" UUID,
    "created_by_id" UUID NOT NULL,
    "start_date" DATE,
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "depends_on_task_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "author_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "uploaded_by_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "project_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "resource_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "phases_project_id_position_key" ON "phases"("project_id", "position");

-- CreateIndex
CREATE INDEX "tasks_phase_id_idx" ON "tasks"("phase_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "task_dependencies_depends_on_task_id_idx" ON "task_dependencies"("depends_on_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_task_id_depends_on_task_id_key" ON "task_dependencies"("task_id", "depends_on_task_id");

-- CreateIndex
CREATE INDEX "progress_project_id_created_at_idx" ON "progress"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "progress_task_id_idx" ON "progress"("task_id");

-- CreateIndex
CREATE INDEX "progress_author_id_idx" ON "progress"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_previous_version_id_key" ON "documents"("previous_version_id");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "documents_task_id_idx" ON "documents"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_project_id_key" ON "conversations"("project_id");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phases" ADD CONSTRAINT "phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
