-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "retries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "worker_id" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "email_source" TEXT,
ADD COLUMN     "email_type" TEXT,
ADD COLUMN     "job_id" TEXT;

-- CreateIndex
CREATE INDEX "companies_status_created_at_idx" ON "companies"("status", "created_at");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scrape_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
