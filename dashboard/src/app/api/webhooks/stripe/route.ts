import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[STRIPE_WEBHOOK] Signature verification failed:', message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const creditsAmount = session.metadata?.creditsAmount;

    if (!userId || !creditsAmount) {
      console.error('[STRIPE_WEBHOOK] Missing metadata:', { userId, creditsAmount });
      return NextResponse.json({ received: true });
    }

    try {
      await prisma.user.update({
        where: { clerkId: userId },
        data: {
          credits: {
            increment: Number(creditsAmount),
          },
        },
      });

      console.log(
        `[STRIPE_WEBHOOK] Added ${creditsAmount} credits to user ${userId}`
      );
    } catch (dbError) {
      console.error('[STRIPE_WEBHOOK] DB update failed:', dbError);
      return NextResponse.json(
        { error: 'Database update failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
