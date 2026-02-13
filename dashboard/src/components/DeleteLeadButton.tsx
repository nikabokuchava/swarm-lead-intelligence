'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { deleteCompany } from '@/app/actions';

export function DeleteLeadButton({ id }: { id: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    
    setIsDeleting(true);
    try {
      await deleteCompany(id);
    } catch (error) {
      console.error('Failed to delete', error);
      alert('Failed to delete lead');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-destructive hover:text-destructive/90"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      <Trash2 className="h-4 w-4" />
      <span className="sr-only">Delete</span>
    </Button>
  );
}
