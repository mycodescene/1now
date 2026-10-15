import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1Now Fleet Ops · Return Inspection",
  description:
    "Automated vehicle return inspection, fuel deficit & excess mileage calculation for UK car rental fleet operators.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Google Material Symbols (Rounded) — icon font used across the app */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display -- icon font: block avoids a flash of raw ligature names */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..700,0..1,-25..0&display=block"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- display face for the footer marquee */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap" />
      </head>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-geist-sans)]">
        {children}
      </body>
    </html>
  );
}
