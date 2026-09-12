import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
export const metadata = {
  title: "The Unpirator",
  description: "Protected media infrastructure for modern platforms",
  other: {
    "unpirator-site-verification": "4gk2gIPKoyu29HiqO9JM26xv-Jr70SNk",
  },
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
