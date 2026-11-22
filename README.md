# 天堂倖存者 小幫手

網頁遊戲「天堂倖存者」的輔助腳本：自動走位刷怪（閃避、撿取分類、自動進場）、選卡流派、變身指定、賭狗與骰子分析、戰績紀錄。

## 安裝

| 用在哪裡 | 怎麼裝 | 怎麼更新 |
|---|---|---|
| 油猴（Tampermonkey） | 打開 [game155-helper.user.js](game155-helper.user.js) 的 Raw，油猴會跳出安裝 | 油猴自動更新 |
| Chrome 擴充功能 | 下載 [Chrome 版 zip](downloads/game155-helper-chrome.zip)，解壓後在 `chrome://extensions` 開「開發人員模式」→「載入未封裝項目」 | 小幫手面板會提示新版；下載新版覆蓋後按「重新載入」 |
| Android App | 下載 [APK](downloads/game155-helper-android.apk) 安裝 | App 會自動下載新版小幫手，重新開啟就是新版 |
| HSA 多開器（Windows） | 下載 [Releases](../../releases/latest) 的多開器 exe | 多開器會自動下載新版小幫手，分頁重新整理就是新版 |

## 檔案

- `game155-helper.user.js`：小幫手本體（所有版本共用）
- `version.json`：最新版本號、更新內容、SHA-256（各版本靠它檢查與驗證更新）
- `chrome-extension/`：Chrome 擴充功能資料夾
- `downloads/`：Chrome 版 zip、Android APK

## 注意

- 小幫手不會輸入帳號密碼，登入請自己來。
- 遊戲的閒置登出規則照常生效，小幫手不會繞過。
