import React from 'react';
import { ClerkProvider, SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

interface ClerkWrapperProps {
  children: React.ReactNode;
}

export default function ClerkWrapper({ children }: ClerkWrapperProps) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#0f172a',
          }}
        >
          <SignIn routing="hash" />
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}
