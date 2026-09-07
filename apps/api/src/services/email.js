export async function sendEmail(config, { to, subject, html }) {
  if (!config.RESEND_API_KEY) return { delivered: false };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: config.EMAIL_FROM, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
  return { delivered: true };
}
