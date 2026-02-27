import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neon Nexus | Dify Command Deck",
  description: "Cyberpunk 2077 inspired Dify operations dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
