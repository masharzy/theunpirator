import "./globals.css";
export const metadata = {
  title: "The Unpirator",
  description: "Protected media infrastructure for modern platforms",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
