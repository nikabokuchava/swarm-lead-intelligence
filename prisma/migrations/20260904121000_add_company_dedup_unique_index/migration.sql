-- Create partial unique index on company name and address where status != FAILED
CREATE UNIQUE INDEX "companies_name_address_unique" 
ON "companies" (name, COALESCE(address, '')) 
WHERE status != 'FAILED';
