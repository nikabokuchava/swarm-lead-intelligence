-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "email_scraped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_scraped_at" TIMESTAMP(3),
ADD COLUMN     "emails" TEXT[] DEFAULT ARRAY[]::TEXT[];
