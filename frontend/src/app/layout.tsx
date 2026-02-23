import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neon Nexus | Control Center",
  description: "Cyberpunk Advanced AI Control Center powered by MCP & RAG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
