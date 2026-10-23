# 更新、事故與審查紀錄｜CHANGELOG

這裡是 Next Stop Live 固定的更新紀錄入口。狀態以所列 commit／Actions 的驗證結果為準；它不是即時監控頁。日期以台灣時間（Asia/Taipei）記錄。

## 維護方式

每次修正、事故處理或 code review，在同一個 PR 新增一筆紀錄，最新日期放最上面。保留原始證據與未解問題；後續解決時補上解決日期和連結，不直接刪除問題。歷史採集缺口不可補成零或捏造回填。

固定格式：

1. **問題與影響**：使用者看到什麼、影響哪條流程。
2. **原因與證據**：已確認事實、推論與未知事項分開寫。
3. **修正與狀態**：已合併／待處理／受阻，附 PR 與 commit。
4. **驗證**：測試、正式部署、部署後檢查分開列。
5. **尚未解決與下一步**：剩餘限制、需要的權限或可驗證條件。

## 2026-10-23｜Collector 恢復、備援與圖表缺口修正

### 問題與原因

- **10/21 起只剩舊資料／有效新增接近零**：預設 top 搜尋候選逐漸超過本地 12 小時窗口；CLI 原有 recent 參數未接到實際搜尋路徑，舊 GraphQL 分頁也有失敗紀錄。可確認資料來源與新鮮度失效，無法從儲存庫證據確定外部平台改動的精確原因與時間。
- **失敗仍像成功、圖表呈現零值**：舊品質判斷與前端狀態轉換未正確區分過期／Partial／Failed、缺資料與真實零需求。
- **備援不足**：Notion 同步失敗會擋住有效資料回存 GitHub；缺少獨立命名的上次有效快照。近期搜尋亦沿用過大的巢狀重試預算。
- **排程缺口**：GitHub cron 曾有多小時間隔；排程宣告不等於準點執行，不能把 workflow 啟動或成功標籤當成取得有效新資料。

### 已完成

| 修正 | 狀態與證據 |
| --- | --- |
| 加入來源品質判斷、排除無效 baseline、先存檔再報來源失敗 | [PR #62](https://github.com/Gabriel-chun/threads-cli-nextstop/pull/62)，commit `01f3bb75540f653acdfd2061e32460e7af65fc60` |
| recent 參數接到真實搜尋、單頁 SSR、主分支安全恢復與兩小時 gate | [PR #63](https://github.com/Gabriel-chun/threads-cli-nextstop/pull/63)，commit `f6028100f9ceaf7c8759a5a7b0f5646a7276b1cb` |
| 保存 last-good 快照、隔離 Notion 同步失敗、限制重試、加入獨立 workflow 完成事件作為補跑機會、修正缺口與時間軸呈現 | [PR #64](https://github.com/Gabriel-chun/threads-cli-nextstop/pull/64)，commit `ec792a95588cdbbd8e109bd3747be8b7a1e800bc` |

13:52（台灣時間）的恢復樣本：raw 50、窗口內快照 26、clean 19、master 3024 → 3050；Notion 新增 26。[原始 summary](collector/archive/runs/summary_2026-10-23_055205Z.json)。這是恢復／smoke 樣本，不能改標為原生 scheduled baseline。

### Code review 發現與驗證

PR #64 的自動 review 額外指出兩項 P2：context/noise 分層數字尚未套用 sourceValid，以及時間比例圖的中間標籤仍按資料筆數選取。兩項均已修正，並加入不規則時間軸測試。

- 本機：70 個 Python 測試、47 個前端測試通過；Next 與 vinext 建置、雙語檢查、client secret boundary 檢查通過；patch 正向與反向套用檢查通過。
- 遠端：最終 PR 版本 Go 測試、Hardening CI、Dashboard CI 通過。
- 正式 main：[Dashboard CI 成功](https://github.com/Gabriel-chun/threads-cli-nextstop/actions/runs/39911138448)、[Cloudflare 部署成功](https://github.com/Gabriel-chun/threads-cli-nextstop/actions/runs/39911227013)、[Production MCP Smoke 成功](https://github.com/Gabriel-chun/threads-cli-nextstop/actions/runs/39911326474)。
- 合併後 collector 正確通過 cadence 檢查並跳過未到兩小時間隔的採集；這不等於重新驗證了一次有效採集。last-good 檔案從下一次成功的有效來源存檔開始產生。

### 尚未解決／受阻

| 狀態 | 問題 | 影響與下一步 |
| --- | --- | --- |
| 待處理 | 文件站建置需要 `docs/content`，目前儲存庫沒有該目錄 | [Docs run 39911138494](https://github.com/Gabriel-chun/threads-cli-nextstop/actions/runs/39911138494) 失敗於 Build for GitHub Pages；不是 collector 或正式儀表板部署失敗。需另行核對文件站內容來源與部署目標，不能只建立空目錄假裝修復。 |
| 原因未確認／日誌讀取受阻 | Cloudflare Workers Builds 自動預覽檢查失敗 | 目前連線缺少 `workers-ci.read`，無法讀取預覽建置日誌，因此不能推論預覽失敗原因。正式部署走另一條上述已成功的 CI-gated workflow。 |
| 未驗證 | 外部 Collector Watchdog 的可存取與執行狀態 | 曾回傳啟用成功，後續卻查不到／無法存取；不能宣稱外部備援已可靠運作。需取得可存取的排程設定及執行證據。 |
| 架構限制 | cron 與新增 heartbeat 共用 GitHub 基礎設施 | 增加補跑機會，仍非獨立的兩小時保證。需獨立、已驗證的外部時鐘才能覆蓋 GitHub 整體排程延遲。 |
| 範圍限制 | Notion 設定讀取、artifact 產生前失敗、整個 job 取消、artifact 上傳或 Git push 失敗 | 本次隔離的是下游 Notion 同步失敗，未涵蓋所有故障。保留現有存檔，維持失敗狀態，不能宣稱取得健康的新樣本。 |

完整技術範圍與回歸案例：[Code review](docs/reviews/2026-10-23-collector-code-review.md)。
可套用程式修正：[PR #64 patch](patches/2026-10-23-collector-resilience.patch)；基準為 `2eb4de05beb059b7fbc9b35e16d17c8eba7d8085`，不包含本次後續文件更新。
