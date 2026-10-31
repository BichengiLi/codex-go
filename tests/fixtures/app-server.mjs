import readline from "node:readline";
const send = (data) => process.stdout.write(JSON.stringify(data) + "\n");
let held;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (!m.method) {
    if (m.id === "approval-1")
      send({ method: "test/approvalResult", params: m.result });
    return;
  }
  if (m.method === "initialize")
    send({ id: m.id, result: { userAgent: "fixture/1.0" } });
  else if (m.method === "echo") send({ id: m.id, result: m.params });
  else if (m.method === "notify") {
    send({ method: "test/event", params: { value: 42 } });
    send({ id: m.id, result: {} });
  } else if (m.method === "approval") {
    send({
      id: "approval-1",
      method: "item/commandExecution/requestApproval",
      params: m.params,
    });
    send({ id: m.id, result: {} });
  } else if (m.method === "fail")
    send({ id: m.id, error: { code: 123, message: "secret upstream error" } });
  else if (m.method === "exit") process.exit(1);
  else if (m.method === "hold") held = m;
  else if (m.method === "release" && held) {
    send({ id: held.id, result: { released: true } });
    send({ id: m.id, result: {} });
  }
});
