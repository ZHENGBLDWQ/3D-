# LayerTrace 本地打印机代理

代理运行在打印机同一局域网的电脑、树莓派或 Klipper 主机上，主动向云端上报状态；不需要把 Moonraker 或 OctoPrint 暴露到公网。

1. 在网站“设备管理”中添加设备，点击“连接代理”，选择 `moonraker` 或 `octoprint`，复制一次性显示的令牌。
2. 安装 Python 3.10 或更新版本。
3. 设置环境变量后启动：

```powershell
$env:LAYERTRACE_TOKEN="网站生成的令牌"
$env:PRINTER_CONNECTOR="moonraker"
$env:PRINTER_URL="http://打印机局域网地址:7125"
python .\agent\layertrace_agent.py
```

OctoPrint 使用 `PRINTER_CONNECTOR=octoprint`、对应的 `PRINTER_URL`，并额外设置 `PRINTER_API_KEY`。代理令牌只显示一次；怀疑泄露时，在网站重新点击“连接代理”即可让旧令牌立即失效。
