import QRCode from "qrcode";
history.scrollRestoration = "manual";
window.scrollTo({ top: 0, behavior: "instant" });
let current,
  drawn = "",
  rendering = 0;
const byId = (id) => document.getElementById(id);
async function draw(code) {
  if (drawn === code) return;
  drawn = code;
  const revision = ++rendering;
  byId("qr").hidden = true;
  byId("qr-placeholder").hidden = false;
  if (!code) return;
  try {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, code, {
      width: 460,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#10231b", light: "#ffffff" },
    });
    if (revision !== rendering) return;
    const target = byId("qr");
    target.width = target.height = 460;
    target.getContext("2d").drawImage(canvas, 0, 0);
    target.hidden = false;
    byId("qr-placeholder").hidden = true;
  } catch {
    byId("qr-placeholder").textContent = "二维码生成失败，请复制连接码";
  }
}
function render(state) {
  if (state.running === undefined) {
    byId("error").textContent = state.error || "";
    return;
  }
  current = state;
  byId("workspace").textContent = state.workspace;
  byId("status").textContent = state.running
    ? state.internet
      ? "外网连接已就绪"
      : state.online
        ? "正在建立外网连接"
        : "引擎暂不可用"
    : "已主动断开";
  byId("status").dataset.online = String(!!state.internet && state.online);
  byId("start").disabled = state.running || state.busy;
  for (const id of ["copy", "refresh", "stop", "chat", "internet"])
    byId(id).disabled = !state.running || state.busy;
  byId("internet").hidden = !!state.internet;
  byId("address").textContent =
    state.internet ||
    state.urls.filter((x) => !x.includes("127.0.0.1")).join(" · ");
  byId("qr-placeholder").textContent = state.running
    ? "正在准备安全连接…"
    : "连接已断开，请启动连接";
  byId("error").textContent = state.error || "";
  void draw(state.code);
  const deviceKey = JSON.stringify(state.devices);
  if (byId("devices").dataset.key !== deviceKey) {
    const list = byId("devices");
    list.dataset.key = deviceKey;
    list.replaceChildren();
    if (!state.devices.length) list.textContent = "等待第一台移动设备。";
    for (const device of state.devices) {
      const row = document.createElement("div");
      row.className = "device";
      const name = document.createElement("span");
      name.textContent = device.name;
      const revoke = document.createElement("button");
      revoke.textContent = "断开此设备";
      revoke.onclick = () => act("revoke", device.id);
      row.append(name, revoke);
      list.append(row);
    }
  }
  tick();
}
function tick() {
  byId("expiry").textContent =
    current?.running && current?.expiresAt > Date.now()
      ? `${Math.ceil((current.expiresAt - Date.now()) / 1000)} 秒后更新`
      : "";
}
async function act(action, value) {
  try {
    render(await window.desktop.action(action, value));
    if (action === "copy") byId("expiry").textContent = "已复制";
  } catch (e) {
    byId("error").textContent = e.message.replace(
      /^Error invoking remote method '[^']+': Error: /,
      "",
    );
  }
}
document
  .querySelectorAll("[data-action]")
  .forEach((button) =>
    button.addEventListener("click", () => act(button.dataset.action)),
  );
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }),
  { threshold: 0.12 },
);
document
  .querySelectorAll(".reveal")
  .forEach((element) => observer.observe(element));
window.desktop.onState(render);
void act("state");
setInterval(tick, 1000);
