import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <SignUp
        appearance={{
          variables: {
            colorPrimary: '#f59e0b',
            colorBackground: '#18181b',
            colorText: '#fafafa',
            colorInputBackground: '#27272a',
            colorInputText: '#fafafa',
          },
          elements: {
            card: 'bg-zinc-900 border border-zinc-800 shadow-2xl',
            headerTitle: 'text-zinc-100',
            headerSubtitle: 'text-zinc-400',
            formButtonPrimary: 'bg-amber-500 hover:bg-amber-600 text-black font-semibold',
            footerActionLink: 'text-amber-500 hover:text-amber-400',
          },
        }}
      />
    </div>
  );
}
