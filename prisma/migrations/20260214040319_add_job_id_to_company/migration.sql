-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "job_id" TEXT;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scrape_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
