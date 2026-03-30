import type { Metadata } from "next";
import { BIZ_UDPGothic } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/auth-provider";
import { Toaster } from "sonner";

const bizUDPGothic = BIZ_UDPGothic({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-biz-ud",
  display: "swap",
});

export const metadata: Metadata = {
  title: "分析くん",
  description: "CSVデータをアップロードするだけで、AIが自動で分析・インサイトを提供します。",
};

// ルートレイアウト（Server Component）
// AuthProvider でラップして全ページの認証チェックを行う
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${bizUDPGothic.variable}`}>
      <body
        className="antialiased"
      >
        <AuthProvider>
          {children}
        </AuthProvider>
        {/* トースト通知 */}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
