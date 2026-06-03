-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "failed_at" TIMESTAMP(3),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "review_count" INTEGER;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "is_c_level" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "scrape_jobs" ADD COLUMN     "is_premium" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "scrape_tasks" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "zip_code" TEXT,
    "query" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "worker_id" TEXT,
    "locked_at" TIMESTAMP(3),
    "retries" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "failure_reason" TEXT,
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrape_tasks_status_created_at_idx" ON "scrape_tasks"("status", "created_at");

-- CreateIndex
CREATE INDEX "scrape_tasks_job_id_idx" ON "scrape_tasks"("job_id");

-- CreateIndex
CREATE INDEX "companies_job_id_idx" ON "companies"("job_id");

-- CreateIndex
CREATE INDEX "companies_name_address_idx" ON "companies"("name", "address");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_company_id_work_email_key" ON "contacts"("company_id", "work_email");

-- CreateIndex
CREATE INDEX "scrape_jobs_user_id_status_idx" ON "scrape_jobs"("user_id", "status");

-- AddForeignKey
ALTER TABLE "scrape_tasks" ADD CONSTRAINT "scrape_tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scrape_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
