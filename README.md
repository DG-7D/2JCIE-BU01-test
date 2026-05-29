# 2JCIE-BU01 Test

[2JCIE-BU01](https://components.omron.com/jp-ja/products/sensors/2JCIE-BU)からデータを取ってみるテスト。コマンドは色々あるがとりあえず「Latest data short」を取ってみる。

BunとPuTTY(の`plink.exe`)が必要です。

1行目の`COM_PORT`を適切なポートに変更してください。

```bash
bun run index.ts
```