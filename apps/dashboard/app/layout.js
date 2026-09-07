import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
export const metadata = {
  title: "The Unpirator",
  description: "Protected media infrastructure for modern platforms",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
