import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transport Kadence",
  description: "Se hvor ofte du kan komme fra A til B med offentlig transport",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
