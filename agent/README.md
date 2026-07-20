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

代理在线后，设备卡片可安全下发暂停、继续和取消命令。命令先写入云端审计队列，再由代理领取执行并回传结果；云端不会直接访问局域网打印机。

文件库中的 G-code 会显示“发送并打印”。选择目标设备后，代理通过自己的令牌下载文件、上传到 Moonraker/OctoPrint，并启动打印。模型文件 STL/3MF 不会直接发送，需先在切片软件中生成 G-code。

## Spoolman 同步

如果局域网内运行了 Spoolman，再设置其地址即可每 60 秒同步耗材卷库存：

```powershell
$env:SPOOLMAN_URL="http://Spoolman局域网地址:7912"
$env:SPOOLMAN_INTERVAL="60"
python .\agent\layertrace_agent.py
```

Spoolman 地址只存在本地环境变量中，不会上传云端。同步遵循 Spoolman REST API v1 的 `/api/v1/spool` 数据结构。
