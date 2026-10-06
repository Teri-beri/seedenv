export const dynamic = "force-static";

export function GET() {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    "Contact: mailto:terimus@seedenv.com",
    "Contact: https://seedenv.com/security",
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    "Canonical: https://seedenv.com/.well-known/security.txt",
    "Policy: https://seedenv.com/security",
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
