# 2JCIE-BU01 Test

[2JCIE-BU01](https://components.omron.com/jp-ja/products/sensors/2JCIE-BU)からデータを取ってみるテスト。

BunとPuTTY(の`plink.exe`)が必要です。

```powershell
winget install Oven-sh.Bun PuTTY.PuTTY
```

```powershell
bun run index.ts
```