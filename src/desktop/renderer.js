let current;
const byId = (id) => document.getElementById(id);
function render(state) {
  current = state;
  byId("workspace").textContent = state.workspace;
  byId("code").value = state.code;
  byId("status").textContent = state.busy
    ? "正在处理…"
    : state.running
      ? state.online
        ? "服务运行中"
        : "引擎已退出"
      : "尚未启动";
  byId("start").disabled = state.running || state.busy;
  for (const id of ["copy", "refresh", "stop", "chat", "internet"])
    byId(id).disabled = !state.running || state.busy;
  byId("internet").disabled ||= !!state.internet;
  byId("address").textContent =
    state.internet ||
    state.urls.filter((x) => !x.includes("127.0.0.1")).join(" · ");
  if (state.error) byId("error").textContent = state.error;
  tick();
}
function tick() {
  byId("expiry").textContent = current?.running
    ? current.expiresAt > Date.now()
      ? `${Math.ceil((current.expiresAt - Date.now()) / 1000)} 秒后过期`
      : "连接码已过期，请刷新"
    : "";
}
document.querySelectorAll("[data-action]").forEach((button) =>
  button.addEventListener("click", async () => {
    byId("error").textContent = "";
    try {
      render(await window.desktop.action(button.dataset.action));
      if (button.dataset.action === "copy")
        byId("expiry").textContent = "已复制";
    } catch (e) {
      byId("error").textContent = e.message.replace(
        /^Error invoking remote method '[^']+': Error: /,
        "",
      );
    }
  }),
);
window.desktop.onState(render);
window.desktop.action("state").then(render);
setInterval(tick, 1000);
