import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Swarm Lead Scraper",
  description: "Advanced lead generation dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#f59e0b",
          colorBackground: "#18181b",
          colorText: "#fafafa",
          colorInputBackground: "#27272a",
          colorInputText: "#fafafa",
        },
      }}
    >
      <html lang="en">
        <body
          className={`${inter.variable} ${jetbrainsMono.variable} antialiased min-h-screen flex flex-col overflow-x-hidden`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
