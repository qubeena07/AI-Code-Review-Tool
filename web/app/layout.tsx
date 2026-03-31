import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Review Tool",
  description: "A collaborative code review platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
