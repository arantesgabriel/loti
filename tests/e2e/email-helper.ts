import { expect, type APIRequestContext } from "@playwright/test";
export async function testEmailUrl(request: APIRequestContext, email: string, path: string) {
  let link = "";
  await expect.poll(async () => {
    const response = await request.get("http://localhost:3101/messages", { headers: { "X-Loti-Test-Mailbox": "disposable-local-only" } });
    const messages = await response.json() as { to: string[]; text: string }[];
    const matching = messages.filter(message => message.to.includes(email) && message.text.includes(path));
    link = matching.at(-1)?.text.match(/http:\/\/localhost:3100\/\S+/)?.[0] ?? "";
    return !!link;
  }).toBe(true);
  return link;
}
