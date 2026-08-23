# Desk Mosaic So02 自動予約

Desk Mosaic の `01_アレア品川16F` にある `So02` を、指定日に **終日（09:00–17:30）** 予約する GitHub Actions です。予約可能になる7日前から処理します。予約フォームの初期値をそのまま使用するため、「終日」ボタンは押しません。

## 1. 予約日を設定する

[`config/reservations.json`](config/reservations.json) の `dates` に、予約したい日を `YYYY-MM-DD` 形式で追加します。

```json
"dates": [
  "2026-09-01",
  "2026-09-03"
]
```

過去の日付はスキップされ、8日以上先の日付は予約可能になるまで待機します。同じアカウントによる `So02` の終日予約を検出した場合は何もせず正常終了します。予約に成功した日付は設定ファイルから自動削除され、GitHubへ記録されます。

## 2. GitHub Secrets を登録する

GitHub リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で次の2件を登録します。

| Secret | 内容 |
|---|---|
| `DESK_MOSAIC_EMAIL` | Desk Mosaic のログイン用メールアドレス |
| `DESK_MOSAIC_PASSWORD` | Desk Mosaic のログイン用パスワード |

認証情報は設定ファイルやコードに書かないでください。

## 3. GitHub に push する

このフォルダを GitHub リポジトリに push すると定期実行が有効になります。Actions の利用を無効化しているリポジトリでは、先に有効化してください。

定期実行は次の構成です（GitHub の cron は UTC です）。

- 日本時間 00:00–00:30：5分間隔（予約受付開始直後の再試行）
- それ以外：1時間間隔（後から日付を追加した場合や一時障害への再試行）

GitHub のスケジュール実行は混雑時に数分遅れることがあります。

## 手動テスト

GitHub の **Actions → Reserve Desk Mosaic seat → Run workflow** から実行できます。

- `target_date`: 空欄なら設定ファイルの日付を使用。入力すると、その日だけを一時的に対象にします。
- `dry_run`: 初期値は `true`。ログインから終日予約フォームの確認まで行い、予約ボタンは押しません。実際に予約するときだけ `false` にします。

まず予約可能な日付で `dry_run: true` を成功させてから定期実行に任せることを推奨します。

## 安全な動作

- 対象は map ID `1`（`01_アレア品川16F`）、seat ID `So02` に限定しています。
- 「終日」ボタンは押さず、送信直前に初期値が日付・席・フロア・`09:00–17:30` であることを再検証します。初期値が異なる場合は予約せず停止します。
- 他の人が席を予約済みなら失敗として通知します。
- 自分の部分予約がある場合は、重複作成せず失敗として通知します。
- 予約成功後は対象日を設定から自動削除するため、後から予約をキャンセルしても自動で取り直しません。
- CAPTCHA、追加認証、ログイン方式の変更が発生した場合は安全に停止します。

## ローカル実行（任意）

Node.js 22 と pnpm が必要です。

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test
DESK_MOSAIC_EMAIL="..." DESK_MOSAIC_PASSWORD="..." DRY_RUN=true pnpm reserve
```

Windows PowerShell では環境変数を `$env:DESK_MOSAIC_EMAIL = "..."` の形式で設定してください。

