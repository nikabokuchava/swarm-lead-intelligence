import Stripe from 'stripe';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
