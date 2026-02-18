-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT 'legacy';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "mx_provider" TEXT,
ADD COLUMN     "verification_status" TEXT NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "scrape_jobs" ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT 'legacy';

-- CreateIndex
CREATE INDEX "companies_user_id_idx" ON "companies"("user_id");

-- CreateIndex
CREATE INDEX "scrape_jobs_user_id_idx" ON "scrape_jobs"("user_id");
