<div align="center">

[**繁體中文**](./README.md) · [English](./README.en.md)

# Google Maps 觸控板雙指拖曳與縮放

讓 Google Maps 網頁版擁有更符合 MacBook 使用習慣的觸控板操作。

[![從 Greasy Fork 安裝](https://img.shields.io/badge/Greasy%20Fork-安裝腳本-b82929)](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485b)](https://www.tampermonkey.net/)

[立即安裝](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放) · [回報問題](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/issues)

</div>

## 簡介

Google Maps 預設會將觸控板的雙指上下滑動解讀為縮放，而不是平移地圖。這個
Tampermonkey 使用者腳本會重新安排操作方式，讓網頁版地圖更接近原生地圖應用程式：

| 輸入方式 | 操作結果 |
| --- | --- |
| 觸控板雙指滑動 | 上下、左右平移地圖 |
| 觸控板雙指捏合 | 使用 Google Maps 原生縮放 |
| 一般滑鼠滾輪 | 保留 Google Maps 原生滾輪縮放 |

腳本只會攔截地圖表面上的觸控板滑動，不會影響搜尋結果、側邊欄或其他介面區域的
正常捲動。

## 特色

- 支援垂直、水平及斜向雙指平移。
- 保留以游標位置為中心的原生捏合縮放。
- 自動辨識觸控板手勢與一般滑鼠滾輪。
- 保留觸控板的慣性滑動手感。
- 支援 Google Maps 動態載入及網址切換。
- 無資料收集、無追蹤，也不會向第三方服務傳送資料。

## 安裝

### Greasy Fork（建議）

1. 安裝 [Tampermonkey](https://www.tampermonkey.net/) 或其他相容的使用者腳本管理器。
2. 開啟 [Greasy Fork 腳本頁面](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放)。
3. 按下「安裝此腳本」，並在腳本管理器中確認安裝。
4. 重新整理 [Google Maps](https://www.google.com/maps)。

### 手動安裝

1. 在 Tampermonkey 中建立新的使用者腳本。
2. 複製 [`google-maps-trackpad.user.js`](./google-maps-trackpad.user.js) 的完整內容。
3. 貼到編輯器、儲存，然後重新整理 Google Maps。

## 設定

若需要調整手感，可編輯腳本頂端附近的 `SETTINGS`：

```js
const SETTINGS = Object.freeze({
  panSpeed: 1,
  gestureEndDelayMs: 90,
  minimumDelta: 0.01,
  inputDevice: 'auto',
  mouseWheelDeltaThreshold: 50,
  inputTransactionTimeoutMs: 180,
});
```

| 設定 | 預設值 | 說明 |
| --- | --- | --- |
| `panSpeed` | `1` | 地圖平移速度倍率；數值越大，移動越快。 |
| `gestureEndDelayMs` | `90` | 停止收到事件後，等待多久才結束模擬拖曳。 |
| `minimumDelta` | `0.01` | 忽略極小輸入，避免感測雜訊觸發拖曳。 |
| `inputDevice` | `'auto'` | 輸入辨識模式：`'auto'`、`'trackpad'` 或 `'mouse'`。 |
| `mouseWheelDeltaThreshold` | `50` | 自動模式下，判定為滑鼠滾輪的大位移門檻。 |
| `inputTransactionTimeoutMs` | `180` | 將連續滾輪事件視為同一個手勢的間隔上限。 |

## 輸入裝置辨識

瀏覽器目前不會直接告訴網頁 `WheelEvent` 是來自滑鼠或觸控板。因此，腳本會根據
位移單位、初始位移量、水平輸入及連續事件分組，自動推測輸入裝置。

大多數情況請保留：

```js
inputDevice: 'auto'
```

若特殊滑鼠或驅動程式被錯誤辨識，可以改成：

```js
inputDevice: 'mouse'
```

若要強制將所有非捏合的滾輪事件用於平移地圖，則改成：

```js
inputDevice: 'trackpad'
```

## 運作原理

在 macOS 上，一般雙指滑動通常會產生 `WheelEvent`，而雙指捏合通常會產生
`ctrlKey === true` 的 `WheelEvent`。腳本會在事件擷取階段處理地圖上的一般
觸控板滑動，阻止 Google Maps 將它解讀為縮放，再將位移轉換成連續的滑鼠拖曳
事件。捏合及一般滑鼠滾輪則會原樣交給 Google Maps 處理。

## 相容性

- 主要針對 macOS 與 MacBook 觸控板設計。
- 已在 Chromium 架構瀏覽器的 Google Maps 網頁版驗證。
- Firefox 及其他精密觸控板是否完全相容，取決於瀏覽器回報的滾輪事件格式。

## 疑難排解

### 滑鼠滾輪被當成地圖平移

將 `inputDevice` 設為 `'mouse'`；或在自動模式下降低
`mouseWheelDeltaThreshold`。

### 觸控板雙指滑動仍然縮放

將 `inputDevice` 設為 `'trackpad'`；或在自動模式下提高
`mouseWheelDeltaThreshold`。

### 平移方向與預期相反

將 `panSpeed` 改成負值，例如 `-1`。

## 相關連結

- [Greasy Fork](https://greasyfork.org/zh-TW/scripts/588879-google-maps-觸控板雙指拖曳與縮放)
- [原始碼](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad)
- [問題回報](https://github.com/TW527E/Google-Maps-Drag-with-Trackpad/issues)
