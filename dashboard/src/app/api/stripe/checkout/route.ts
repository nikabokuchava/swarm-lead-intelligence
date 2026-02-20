import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { checkRateLimit } from '@/lib/rateLimit';

const MAX_CHECKOUT_PER_MIN = 5;

/**
 * Server-side price-to-credits mapping.
 * SEC-02 Fix: Never trust client-provided credit amounts.
 */
const PRICE_TO_CREDITS: Record<string, number> = {
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER!]: 1000,
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH!]: 5000,
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY!]: 15000,
};

export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // SEC-06: Rate limit checkout requests per user
        const rateCheck = checkRateLimit(`checkout:${userId}`, MAX_CHECKOUT_PER_MIN);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: 'Too many requests. Please wait before trying again.' },
                { status: 429 }
            );
        }

        const { priceId } = await request.json();

        if (!priceId) {
            return NextResponse.json(
                { error: 'Missing priceId' },
                { status: 400 }
            );
        }

        // SEC-02: Validate priceId against server-side allowlist
        const credits = PRICE_TO_CREDITS[priceId];
        if (!credits) {
            return NextResponse.json(
                { error: 'Invalid price ID' },
                { status: 400 }
            );
        }

        const origin = request.headers.get('origin') || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            metadata: {
                userId,
                creditsAmount: String(credits), // Server-determined, not client-provided
            },
            success_url: `${origin}/dashboard?success=true`,
            cancel_url: `${origin}/dashboard/credits`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error('[STRIPE_CHECKOUT]', error);
        return NextResponse.json(
            { error: 'Failed to create checkout session' },
            { status: 500 }
        );
    }
}
