import { assertEquals } from "jsr:@std/assert@1";

Deno.test("entrypoint serves a 400 on the first request when import.meta.main", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const guard = src.lastIndexOf("if (import.meta.main)");
  const serveBare = src.lastIndexOf("Deno.serve(handler)");
  const servePort = src.lastIndexOf("Deno.serve({ port: Number(raw) }, handler)");
  assertEquals(guard > 0, true);
  assertEquals(serveBare > guard, true);
  assertEquals(servePort > guard, true);
  assertEquals(src.includes("BOOT_ERROR"), false);

  const port = 18000 + Math.floor(Math.random() * 1000);
  const proc = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-lock",
      "--allow-net",
      "--allow-env",
      "--allow-import",
      "--allow-read",
      "--node-modules-dir=auto",
      new URL("./index.ts", import.meta.url).pathname,
    ],
    env: {
      ...Deno.env.toObject(),
      CLIENT_PORTAL_PORT: String(port),
    },
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const url = `http://127.0.0.1:${port}/`;
  let res: Response | null = null;
  try {
    for (let i = 0; i < 40; i++) {
      try {
        res = await fetch(url);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assertEquals(res != null, true, "entrypoint did not listen");
    const body = await res!.json();
    assertEquals(res!.status, 400);
    assertEquals(body.error, "token required");
    assertEquals(res!.status === 503, false);
  } finally {
    proc.kill("SIGTERM");
    await proc.status;
  }
});
