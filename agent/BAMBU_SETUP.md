# Bambu Lab 局域网接入

LayerTrace 支持通过 Bambu Lab LAN Only + Developer Mode 接入 X1、P1、A1 与 A1 mini 系列。打印机的 IP、序列号和 LAN Access Code 只保存在运行 Agent 的本地电脑，不上传到网站。

## 打印机设置

1. 将打印机与运行 Agent 的 Windows 电脑连接到同一局域网。
2. 在打印机网络设置中开启 `LAN Only` 和 `Developer Mode`。
3. 记下打印机 IP、序列号与 LAN Access Code。
4. 在 LayerTrace 的“设备管理”添加打印机，点击“连接代理”，连接类型输入 `bambu_lan`，复制一次性令牌。

## Windows 启动

```powershell
$env:LAYERTRACE_TOKEN="网站生成的一次性代理令牌"
$env:PRINTER_CONNECTOR="bambu_lan"
$env:BAMBU_HOST="192.168.1.80"
$env:BAMBU_SERIAL="打印机序列号"
$env:BAMBU_ACCESS_CODE="打印机 LAN Access Code"
python .\agent\layertrace_agent.py
```

Agent 将在本地连接打印机 MQTT TLS 端口，自动同步在线状态、喷嘴/热床温度、进度、当前文件、层数、HMS 信息和 AMS 槽位。网页下发的暂停、继续、停止命令由 Agent 在局域网内执行。

对 Bambu 打印机发送 3MF 时，Agent 会通过本地加密文件传输上传到打印机，并按第一个 Plate 启动。请确保打印板已清空并有人值守；当前版本不会在没有人工确认打印板状态时自动连续开打。

## 安全要求

- 不要将 8883 或 990 端口映射到公网。
- 每台打印机使用独立 LayerTrace 代理令牌。
- 怀疑令牌泄露时，在设备页重新生成令牌，旧令牌会立即失效。
- LAN Access Code 仅设置在本地环境变量中，不填写在网页备注中。
