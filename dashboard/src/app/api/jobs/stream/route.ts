import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        try {
          const jobs = await prisma.scrapeJob.findMany({
            where: {
              userId,
              status: { in: ['PENDING', 'PROCESSING'] },
            },
            select: {
              id: true,
              status: true,
              resultsFound: true,
              query: true,
            },
            orderBy: { createdAt: 'desc' },
          });
          send({ type: 'jobs', jobs });
        } catch {
          send({ type: 'error', message: 'DB query failed' });
        }
      };

      poll();

      const intervalId = setInterval(poll, 3000);

      request.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
