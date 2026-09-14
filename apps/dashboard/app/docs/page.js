import { DocsClient } from "./docs-client";

export const metadata = {
  title: "Developer documentation | The Unpirator",
  description:
    "Install The Unpirator player, create secure playback sessions, and integrate protected video into Next.js, React, PHP, Django, Laravel, WordPress, or plain HTML.",
};

export default function Docs() {
  return <DocsClient />;
}