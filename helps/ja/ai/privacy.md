---
title: 注意
keywords:
  - 注意
  - 機密
  - API
category: ai
related:
  - chat.md
  - ../settings.md
commands:
  - Open Provider
---

# 注意

プロンプトと、チャットに載せたファイル／カレントタブの内容は、設定した外部 LLM API へ送信されます。Agent でも、開いている全タブの全文を毎回送ることはありません（一覧と、ツールで読んだ範囲だけ）。

カスタム以外のプロバイダはβです。接続の検証はまだ行っていません。

機密情報を送る前に、宛先の API とモデルを確認してください。
