# LayerTrace Local Hub

Local Hub 将 Bambu 打印机连接、AMS 同步、耗材消耗记录和摄像头流保留在工作室局域网内。打印机访问码不会上传到 LayerTrace。

## 一键启动

1. 安装 Docker Desktop。
2. 将 `.env.example` 复制为 `.env`，填写 LayerTrace 令牌和 LAN Access Code。`BAMBU_HOST` 与 `BAMBU_SERIAL` 留空时，Agent 会通过 SSDP 自动发现第一台打印机。
3. 支持本地 RTSP 的型号，参照 `go2rtc.yaml.example` 编辑 `go2rtc.yaml`，填写打印机 IP 和访问码；暂不使用摄像头可以保持默认空配置。
4. 在本目录执行：

```powershell
docker compose up -d --build
docker compose logs -f bambu-agent
```

连接成功后，LayerTrace 会同步打印状态、温度、层数、当前文件、AMS 单元、槽位、材料、颜色和余量。发送 3MF 时，Agent 会解析文件内的切片耗材克重；任务完成或失败后生成一条耗材消耗明细。

## 多台打印机

每台打印机必须使用独立 LayerTrace 令牌。复制一份 Local Hub 目录，为每份配置不同 `.env` 后启动，或在 Compose 中复制 `bambu-agent` 服务并为每个服务指定独立的 `env_file`。

## 摄像头

支持 RTSP 的机型可通过 `http://运行Hub的电脑IP:1984/` 查看，或使用 WebRTC 地址嵌入本地屏幕。X1 系列通常使用 `rtsps://bblp:访问码@打印机IP:322/streaming/live/1`，且必须在打印机上开启本地实时视频。

P1/A1 系列的摄像头并不都提供同一种 RTSP 能力；Bambu Studio/Handy 的云端画面可用不代表本地 RTSP 可用。Local Hub 会保留摄像头网关，但必须根据实际型号与固件联调，不能将打印机摄像头端口暴露到公网。
