import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Display face for marketing surfaces only (a real contrast axis vs. Inter body).
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Leuk",
  description: "Practice management and EHR for healthcare professionals.",
  metadataBase: new URL(process.env.LEUK_BASE_URL ?? process.env.LEUK_APP_URL ?? "https://leuk.nysgpt.com"),
  // Link previews (chat hosts, Slack, iMessage) read these; without them a
  // shared Leuk link shows a bare globe.
  openGraph: { siteName: "Leuk", type: "website", images: [{ url: "/apple-icon.png", width: 180, height: 180, alt: "Leuk" }] },
  twitter: { card: "summary", images: ["/apple-icon.png"] },
};

// viewport-fit=cover lets the app shell own the iPhone safe areas
// (status bar / home indicator) instead of Safari padding them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
