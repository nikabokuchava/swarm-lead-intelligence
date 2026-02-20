/*
  Warnings:

  - The `status` column on the `scrape_jobs` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "scrape_jobs" DROP COLUMN "status",
ADD COLUMN     "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING';
