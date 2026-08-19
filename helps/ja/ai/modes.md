---
title: Ask / Edit / Agent
keywords:
  - Ask
  - Edit
  - Agent
  - モード
category: ai
related:
  - chat.md
  - proposals.md
commands:
  - Focus Chat
---

# Ask / Edit / Agent

送信前にモードを選びます。スレッドごとに最後に使ったモードを覚えます。

- **Ask**: いま開いている文書の本文を渡して、説明・要約・質問に答えます。ファイルは書き換えません。変更案カードは出ません。
- **Edit**: いま開いている文書の本文を渡し、変更案を1つ出します。提案カードの適用で文書に入ります。共同編集中なら全員に見えます。
- **Agent**: 本文は渡しません。開いているタブを `list_open_tabs` / `read_tab` で読んでから、必要なら複数の変更案を出します。ステップ数は設定で上限を決められます。
