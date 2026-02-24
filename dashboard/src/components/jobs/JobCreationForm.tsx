'use client';

import { createScrapeJob } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play } from 'lucide-react';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        'Starting...'
      ) : (
        <>
          <Play className="mr-2 h-4 w-4" /> Start Scraping
        </>
      )}
    </Button>
  );
}

export function JobCreationForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Scrape Job</CardTitle>
        <CardDescription>Start a new background scraping task.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createScrapeJob} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="query">Search Query</Label>
            <Input
              id="query"
              name="query"
              placeholder="e.g. Dentists in New York"
              required
            />
          </div>
          
          <div className="space-y-2">
             <div className="flex justify-between">
                <Label htmlFor="maxResults">Max Results</Label>
                <span className="text-xs text-muted-foreground">Desired global quota</span>
             </div>
             <Input 
                id="maxResults" 
                name="maxResults" 
                type="number" 
                min="1" 
                max="5000" 
                defaultValue="20"
             />
          </div>

          <div className="space-y-2">
             <div className="flex justify-between">
                <Label htmlFor="zipCodes">Target Zip Codes (Optional)</Label>
                <span className="text-xs text-muted-foreground">Comma-separated</span>
             </div>
             <Input
                id="zipCodes"
                name="zipCodes"
                placeholder="e.g. 10001, 10002, 10003"
             />
             <p className="text-[10px] text-muted-foreground">Leaves blank for general city-wide searches.</p>
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
