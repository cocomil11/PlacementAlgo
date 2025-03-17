# 最適なオブジェクトの配置とスムージングアルゴリズム

このドキュメントは、UI要素の最適な位置を見つけるためのアルゴリズムと、その動きをスムーズにするためのアルゴリズムを説明しています。これらのアルゴリズムは、コンピュータビジョンアプリケーションで検出されたオブジェクトの周りにUI要素（ラベル、情報ボックス、コントロールなど）を配置するのに特に役立ちます。

## 目次

- [最適なオブジェクトの配置とスムージングアルゴリズム](#最適なオブジェクトの配置とスムージングアルゴリズム)
  - [目次](#目次)
  - [概要](#概要)
  - [app.jsの主要コンポーネント](#appjsの主要コンポーネント)
    - [オブジェクトトラッキングシステム](#オブジェクトトラッキングシステム)
    - [位置メモリシステム](#位置メモリシステム)
  - [アルゴリズム1: 最適位置の発見](#アルゴリズム1-最適位置の発見)
    - [アルゴリズムの仕組み](#アルゴリズムの仕組み)
    - [交差計算](#交差計算)
  - [アルゴリズム2: 位置のスムージング](#アルゴリズム2-位置のスムージング)
    - [スムージングの仕組み](#スムージングの仕組み)
    - [メモリクリーンアップ](#メモリクリーンアップ)
  - [プロジェクトへの実装方法](#プロジェクトへの実装方法)
    - [ステップ1: オブジェクトトラッキングのセットアップ](#ステップ1-オブジェクトトラッキングのセットアップ)
    - [ステップ2: コア関数のコピー](#ステップ2-コア関数のコピー)
    - [ステップ3: レンダリングループへの統合](#ステップ3-レンダリングループへの統合)
  - [設定オプション](#設定オプション)
  - [スコアリングシステムの理解](#スコアリングシステムの理解)
    - [ペナルティ](#ペナルティ)
    - [ボーナス](#ボーナス)
    - [ペナルティとボーナスの大きさ](#ペナルティとボーナスの大きさ)
  - [カスタム報酬ルールの実装](#カスタム報酬ルールの実装)
    - [1. 既存の位置の好みを調整する](#1-既存の位置の好みを調整する)
    - [2. コンテキスト固有のルールを追加する](#2-コンテキスト固有のルールを追加する)
    - [3. カスタムペナルティファクターを追加する](#3-カスタムペナルティファクターを追加する)
    - [4. 新しい位置候補を作成する](#4-新しい位置候補を作成する)
    - [5. 完全なカスタムスコアリング関数を作成する](#5-完全なカスタムスコアリング関数を作成する)
    - [例: "常に手の上に"の好みを実装する](#例-常に手の上にの好みを実装する)
  - [パフォーマンスの考慮事項](#パフォーマンスの考慮事項)
  - [異なるユースケースへの適応](#異なるユースケースへの適応)

## 概要

このアルゴリズムは、2つの主要な問題を解決します:

1. **最適な配置**: 他の重要な要素と重ならないように、検出されたオブジェクトの周りにUI要素を配置する最適な場所を見つけること
2. **位置のスムージング**: 検出されたオブジェクトが急速に移動したときにUI要素が飛び跳ねるのを防ぐこと

これらのアルゴリズムは`app.js`に実装されており、インテリジェントなUI要素の配置を必要とする任意のプロジェクトに適応させることができます。

## app.jsの主要コンポーネント

### オブジェクトトラッキングシステム

```javascript
// app.jsの上部付近にあります
let allDetectedObjects = {
    faces: [],
    hands: [],
    visualizations: []
};
```

この構造は、現在のフレームで検出されたすべてのオブジェクトを格納し、重複のない位置を計算するために不可欠です。

### 位置メモリシステム

```javascript
// ビジュアライゼーションの安定化のための位置メモリ
let previousRectPositions = {};
let positionTransitions = {};

// 安定化の設定
const stabilizationConfig = {
    hysteresisThreshold: 200,
    previousPositionBonus: 150,
    smoothingFactor: 0.2,
    positionMemoryTimeout: 1000
};
```

これらの変数は、スムージングアルゴリズムのための位置履歴と設定を格納します。

## アルゴリズム1: 最適位置の発見

コアアルゴリズムは`findOptimalVisualizationPosition`関数にあります:

```javascript
function findOptimalVisualizationPosition(hand, rectWidth, rectHeight, allObjects, canvasWidth, canvasHeight) {
    // 手に対する候補位置を定義
    const candidatePositions = [
        { name: 'right', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y + (h.height/2) - (rectHeight/2) }) },
        { name: 'left', getPosition: (h) => ({ x: h.x - rectWidth - 10, y: h.y + (h.height/2) - (rectHeight/2) }) },
        { name: 'top', getPosition: (h) => ({ x: h.x + (h.width/2) - (rectWidth/2), y: h.y - rectHeight - 10 }) },
        { name: 'bottom', getPosition: (h) => ({ x: h.x + (h.width/2) - (rectWidth/2), y: h.y + h.height + 10 }) },
        { name: 'topRight', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y - rectHeight - 10 }) },
        { name: 'topLeft', getPosition: (h) => ({ x: h.x - rectWidth - 10, y: h.y - rectHeight - 10 }) },
        { name: 'bottomRight', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y + h.height + 10 }) },
        { name: 'bottomLeft', getPosition: (h) => ({ x: h.x - rectWidth - 10, y: h.y + h.height + 10 }) }
    ];
    
    // この手の前の位置が存在する場合は取得
    const prevPosition = previousRectPositions[hand.id];
    
    // 各位置を評価
    const positionScores = candidatePositions.map(pos => {
        const rect = {
            ...pos.getPosition(hand),
            width: rectWidth,
            height: rectHeight
        };
        
        // ビジュアライゼーションがキャンバスの範囲内にあるか確認
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > canvasWidth || rect.y + rect.height > canvasHeight) {
            return { position: pos.name, rect, score: -1000 }; // 範囲外に対して大きなペナルティ
        }
        
        // 交差に基づいてスコアを計算
        let score = 0;
        
        // 顔との交差にペナルティ（最高のペナルティ）
        allObjects.faces.forEach(face => {
            const intersection = calculateIntersectionArea(rect, face);
            score -= intersection * 10; // 顔の交差に対する高いペナルティ
        });
        
        // 手との交差にペナルティ
        allObjects.hands.forEach(otherHand => {
            if (otherHand !== hand) { // 自分との交差にはペナルティを与えない
                const intersection = calculateIntersectionArea(rect, otherHand);
                score -= intersection * 5;
            }
        });
        
        // 他のビジュアライゼーションとの交差にペナルティ
        allObjects.visualizations.forEach(otherRect => {
            const intersection = calculateIntersectionArea(rect, otherRect);
            score -= intersection * 5;
        });
        
        // 手に近い位置を好む（距離ペナルティ）
        const handCenter = {
            x: hand.x + hand.width/2,
            y: hand.y + hand.height/2
        };
        const rectCenter = {
            x: rect.x + rect.width/2,
            y: rect.y + rect.height/2
        };
        const distance = Math.sqrt(
            Math.pow(handCenter.x - rectCenter.x, 2) + 
            Math.pow(handCenter.y - rectCenter.y, 2)
        );
        score -= distance * 0.1; // 小さな距離ペナルティ
        
        // 好ましい位置にボーナス（右側が好ましい）
        if (pos.name === 'right') score += 100;
        if (pos.name === 'left') score += 90;
        
        // 位置の一貫性にボーナス - 前の位置を好む
        if (prevPosition) {
            // この位置が前の位置に近いか確認
            const distanceToPrev = Math.sqrt(
                Math.pow(rect.x - prevPosition.x, 2) + 
                Math.pow(rect.y - prevPosition.y, 2)
            );
            
            // 前の位置にかなり近い場合、大きなボーナスを追加
            if (distanceToPrev < 50) {
                score += stabilizationConfig.previousPositionBonus;
            }
        }
        
        return { position: pos.name, rect, score };
    });
    
    // 最高のスコアを持つ位置を見つける
    positionScores.sort((a, b) => b.score - a.score);
    const bestPosition = positionScores[0];
    
    // すべての位置が悪い場合（例: すべて範囲外）、nullを返す
    if (bestPosition.score < -500) return null;
    
    return bestPosition.rect;
}
```

### アルゴリズムの仕組み

1. **候補位置の定義**: アルゴリズムは、オブジェクトの周りの8つの位置（右、左、上、下、および4つの角）を考慮します
2. **各位置のスコアリング**: 各位置は以下に基づいてスコアリングされます:
   - 境界違反（キャンバス内に留まること）
   - 他のオブジェクトとの重なり（顔、手、他のUI要素）
   - 関連オブジェクトからの距離
   - 好ましい位置（右側が好ましい）
   - 前の位置との一貫性
3. **最適な位置の選択**: 最高のスコアを持つ位置が選ばれます

### 交差計算

アルゴリズムは、このヘルパー関数を使用して重なりを計算します:

```javascript
function calculateIntersectionArea(rect1, rect2) {
    // 交差座標を見つける
    const xOverlap = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - Math.max(rect1.x, rect2.x));
    const yOverlap = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - Math.max(rect1.y, rect2.y));
    
    // 交差面積を計算
    return xOverlap * yOverlap;
}
```

## アルゴリズム2: 位置のスムージング

スムージングアルゴリズムは`stabilizeVisualizationPosition`関数に実装されています:

```javascript
function stabilizeVisualizationPosition(handId, newPosition) {
    const currentTime = Date.now();
    
    // この手の前の位置がない場合、初期化
    if (!previousRectPositions[handId]) {
        previousRectPositions[handId] = {
            x: newPosition.x,
            y: newPosition.y,
            lastSeen: currentTime
        };
        return newPosition;
    }
    
    // 前の位置を取得
    const prevPos = previousRectPositions[handId];
    
    // 遷移状態を作成または更新
    if (!positionTransitions[handId]) {
        positionTransitions[handId] = {
            targetX: newPosition.x,
            targetY: newPosition.y,
            currentX: prevPos.x,
            currentY: prevPos.y
        };
    } else {
        // 目標位置を更新
        positionTransitions[handId].targetX = newPosition.x;
        positionTransitions[handId].targetY = newPosition.y;
    }
    
    const transition = positionTransitions[handId];
    
    // 現在と目標の間でスムージング（線形補間）を適用
    transition.currentX += (transition.targetX - transition.currentX) * stabilizationConfig.smoothingFactor;
    transition.currentY += (transition.targetY - transition.currentY) * stabilizationConfig.smoothingFactor;
    
    // 前の位置を更新
    previousRectPositions[handId] = {
        x: transition.currentX,
        y: transition.currentY,
        lastSeen: currentTime
    };
    
    // スムージングされた位置を返す
    return {
        x: Math.round(transition.currentX),
        y: Math.round(transition.currentY)
    };
}
```

### スムージングの仕組み

1. **位置メモリ**: システムは各UI要素の前の位置を記憶します
2. **線形補間**: 新しい位置が計算されると、UI要素は徐々にその位置に移動します
3. **スムージングファクター**: UI要素が新しい位置に移動する速さを制御します（0.2 = 各フレームで20%の移動）
4. **タイムスタンプの追跡**: 各オブジェクトが最後に見られた時間を記録し、消えたオブジェクトを処理します

### メモリクリーンアップ

メモリリークを防ぐため、システムにはクリーンアップ関数が含まれています:

```javascript
function cleanStaleHandPositions(seenHandIds) {
    const currentTime = Date.now();
    
    // メモリ内の各手を確認
    Object.keys(previousRectPositions).forEach(handId => {
        if (!seenHandIds.has(handId)) {
            const lastSeen = previousRectPositions[handId].lastSeen || 0;
            const timeSinceLastSeen = currentTime - lastSeen;
            
            // この手が長い間見られていない場合、削除
            if (timeSinceLastSeen > stabilizationConfig.positionMemoryTimeout) {
                delete previousRectPositions[handId];
                delete positionTransitions[handId];
            }
        }
    });
}
```

## プロジェクトへの実装方法

### ステップ1: オブジェクトトラッキングのセットアップ

```javascript
// オブジェクトストレージの初期化
let allObjects = {
    primaryObjects: [], // 検出されたオブジェクト（例: 顔、製品など）
    uiElements: []      // 配置するUI要素（ラベル、ボタンなど）
};

// 位置メモリ
let previousPositions = {};
let positionTransitions = {};

// 設定
const config = {
    smoothingFactor: 0.2,      // 0-1, 低いほどスムーズだが遅延が増える
    positionMemoryTimeout: 1000, // 位置を記憶する時間（ミリ秒）
    previousPositionBonus: 150  // 前の位置に対するスコアボーナス
};
```

### ステップ2: コア関数のコピー

以下の関数をapp.jsからコピーします:
- `calculateIntersectionArea`
- `findOptimalVisualizationPosition`（オブジェクトタイプに合わせて適応）
- `stabilizeVisualizationPosition`
- `cleanStalePositions`

### ステップ3: レンダリングループへの統合

```javascript
function updateFrame() {
    // 検出されたオブジェクトを取得
    const detectedObjects = yourDetectionSystem.getObjects();
    
    // このフレームのためにオブジェクトトラッキングをリセット
    allObjects.primaryObjects = [];
    allObjects.uiElements = [];
    
    // このフレームで見られたオブジェクトを追跡
    const seenObjectIds = new Set();
    
    // 各検出オブジェクトを処理
    detectedObjects.forEach(obj => {
        // トラッキングに追加
        allObjects.primaryObjects.push({
            id: obj.id,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height
        });
        
        // 見られたとしてマーク
        seenObjectIds.add(obj.id);
        
        // UI要素の最適な位置を見つける
        const uiElement = {
            width: 100,  // UI要素の幅
            height: 150  // UI要素の高さ
        };
        
        const optimalPosition = findOptimalVisualizationPosition(
            obj,
            uiElement.width,
            uiElement.height,
            allObjects,
            canvas.width,
            canvas.height
        );
        
        if (optimalPosition) {
            // スムージングを適用
            const smoothedPosition = stabilizeVisualizationPosition(obj.id, optimalPosition);
            
            // UI要素をレンダリング
            renderUIElement(smoothedPosition.x, smoothedPosition.y, uiElement.width, uiElement.height);
            
            // 次の要素の計算のためにトラッキングに追加
            allObjects.uiElements.push({
                x: smoothedPosition.x,
                y: smoothedPosition.y,
                width: uiElement.width,
                height: uiElement.height
            });
        }
    });
    
    // 古い位置をクリーンアップ
    cleanStalePositions(seenObjectIds);
    
    // アニメーションループを続行
    requestAnimationFrame(updateFrame);
}
```

## 設定オプション

`stabilizationConfig`オブジェクトでこれらのパラメータを調整できます:

| パラメータ | 説明 | 典型的な値 |
|-----------|-------------|----------------|
| `smoothingFactor` | 要素が新しい位置に移動する速さ | 0.1-0.3（低いほどスムーズ） |
| `previousPositionBonus` | 前の位置に対するスコアボーナス | 100-200（高いほど安定） |
| `positionMemoryTimeout` | 位置を記憶する時間（ミリ秒） | 500-2000 |

## スコアリングシステムの理解

最適な位置を見つけるアルゴリズムは、各候補位置を評価するためにペナルティとボーナスを使用するスコアリングシステムを使用します。このシステムを理解することは、ニーズに合わせてカスタマイズするために重要です。

### ペナルティ

ペナルティは位置のスコアを減少させ、選ばれる可能性を低くします:

1. **境界違反**: キャンバスの境界外の位置は厳しいペナルティを受けます（-1000）
   ```javascript
   if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > canvasWidth || rect.y + rect.height > canvasHeight) {
       return { position: pos.name, rect, score: -1000 };
   }
   ```

2. **オブジェクトの交差**: 他のオブジェクトとの重なり面積に基づいてペナルティが適用されます
   ```javascript
   // 顔の交差（最高のペナルティ）
   allObjects.faces.forEach(face => {
       const intersection = calculateIntersectionArea(rect, face);
       score -= intersection * 10; // 顔に対する10倍のペナルティ
   });
   
   // 手の交差
   allObjects.hands.forEach(otherHand => {
       if (otherHand !== hand) {
           const intersection = calculateIntersectionArea(rect, otherHand);
           score -= intersection * 5; // 手に対する5倍のペナルティ
       }
   });
   
   // 他のUI要素の交差
   allObjects.visualizations.forEach(otherRect => {
       const intersection = calculateIntersectionArea(rect, otherRect);
       score -= intersection * 5; // 他のUI要素に対する5倍のペナルティ
   });
   ```

3. **距離ペナルティ**: 関連オブジェクトから遠い位置は小さなペナルティを受けます
   ```javascript
   const distance = Math.sqrt(
       Math.pow(handCenter.x - rectCenter.x, 2) + 
       Math.pow(handCenter.y - rectCenter.y, 2)
   );
   score -= distance * 0.1; // 小さな距離ペナルティ（0.1倍）
   ```

### ボーナス

ボーナスは位置のスコアを増加させ、選ばれる可能性を高くします:

1. **好ましい位置ボーナス**: 特定の位置は固定ボーナスを受けます
   ```javascript
   // 右側が最も好ましい
   if (pos.name === 'right') score += 100;
   // 左側が2番目に好ましい
   if (pos.name === 'left') score += 90;
   ```

2. **位置の一貫性ボーナス**: 前の位置に近い位置はボーナスを受けます
   ```javascript
   if (prevPosition) {
       const distanceToPrev = Math.sqrt(
           Math.pow(rect.x - prevPosition.x, 2) + 
           Math.pow(rect.y - prevPosition.y, 2)
       );
       
       if (distanceToPrev < 50) {
           score += stabilizationConfig.previousPositionBonus; // デフォルト: 150
       }
   }
   ```

### ペナルティとボーナスの大きさ

ペナルティとボーナスの相対的な大きさは、アルゴリズムの動作を決定します:

- **交差ペナルティ**（ピクセル²あたり5-10）は、重なりを強く避けるために高い
- **距離ペナルティ**（ピクセルあたり0.1）は、近い位置を弱く好むために低い
- **位置ボーナス**（90-100）は、他の要因を上書きしないように中程度
- **一貫性ボーナス**（150）は、頻繁な位置変更を防ぐために高い

## カスタム報酬ルールの実装

独自の報酬ルール（例: 手の上の位置を好む）を実装するには、`findOptimalVisualizationPosition`関数のスコアリングシステムを変更できます。方法は次のとおりです:

### 1. 既存の位置の好みを調整する

手の上の位置を好むには、位置ボーナスセクションを変更します:

```javascript
// 好ましい位置にボーナス
if (pos.name === 'top') score += 150;      // 最高の好みは上
if (pos.name === 'topLeft') score += 140;  // 2番目の好み
if (pos.name === 'topRight') score += 130; // 3番目の好み
if (pos.name === 'right') score += 100;    // 低い好み
if (pos.name === 'left') score += 90;      // 低い好み
```

### 2. コンテキスト固有のルールを追加する

アプリケーションの特定のコンテキストに基づいてルールを追加できます:

```javascript
// 例: 画面の象限に基づいて位置を好む
const screenCenterX = canvasWidth / 2;
const screenCenterY = canvasHeight / 2;

// オブジェクトが左上の象限にある場合、右下の位置を好む
if (hand.x < screenCenterX && hand.y < screenCenterY) {
    if (pos.name === 'bottomRight') score += 120;
}
// オブジェクトが右下の象限にある場合、左上の位置を好む
else if (hand.x >= screenCenterX && hand.y >= screenCenterY) {
    if (pos.name === 'topLeft') score += 120;
}
```

### 3. カスタムペナルティファクターを追加する

アプリケーションの要件に基づいてカスタムペナルティを作成できます:

```javascript
// 例: モバイルデバイスで画面外になる位置にペナルティを与える
const mobileScreenWidth = 375; // 典型的なモバイル幅
if (rect.x + rect.width > mobileScreenWidth) {
    // モバイルで画面外になる可能性のある位置にペナルティを適用
    score -= 50;
}
```

### 4. 新しい位置候補を作成する

`candidatePositions`配列に新しい候補位置を追加できます:

```javascript
// より細かい位置オプションを追加
const candidatePositions = [
    // 既存の位置...
    
    // 新しい位置
    { name: 'topNear', getPosition: (h) => ({ 
        x: h.x + (h.width/2) - (rectWidth/2), 
        y: h.y - rectHeight - 5 // オブジェクトに近い
    })},
    { name: 'topFar', getPosition: (h) => ({ 
        x: h.x + (h.width/2) - (rectWidth/2), 
        y: h.y - rectHeight - 30 // オブジェクトから遠い
    })},
    // さらにカスタム位置を追加...
];
```

### 5. 完全なカスタムスコアリング関数を作成する

最大限の柔軟性を持たせるために、スコアリングロジック全体を置き換えることができます:

```javascript
function customPositionScoring(rect, hand, allObjects) {
    let score = 1000; // 基本スコアで開始
    
    // 独自のスコアリングロジックをここに
    // ...
    
    return score;
}

// その後、位置評価で使用
const positionScores = candidatePositions.map(pos => {
    const rect = {
        ...pos.getPosition(hand),
        width: rectWidth,
        height: rectHeight
    };
    
    // デフォルトのロジックの代わりにカスタムスコアリングを使用
    const score = customPositionScoring(rect, hand, allObjects);
    
    return { position: pos.name, rect, score };
});
```

### 例: "常に手の上に"の好みを実装する

アルゴリズムを変更して、手の上の位置を強く好むようにする完全な例を示します:

```javascript
function findOptimalVisualizationPosition(hand, rectWidth, rectHeight, allObjects, canvasWidth, canvasHeight) {
    // 手の上により多くのオプションを持つ候補位置を定義
    const candidatePositions = [
        // 標準の位置
        { name: 'right', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y + (h.height/2) - (rectHeight/2) }) },
        { name: 'left', getPosition: (h) => ({ x: h.x - rectWidth - 10, y: h.y + (h.height/2) - (rectHeight/2) }) },
        { name: 'bottom', getPosition: (h) => ({ x: h.x + (h.width/2) - (rectWidth/2), y: h.y + h.height + 10 }) },
        
        // より詳細な「上」の位置
        { name: 'topCenter', getPosition: (h) => ({ x: h.x + (h.width/2) - (rectWidth/2), y: h.y - rectHeight - 10 }) },
        { name: 'topLeft', getPosition: (h) => ({ x: h.x - rectWidth/2, y: h.y - rectHeight - 10 }) },
        { name: 'topRight', getPosition: (h) => ({ x: h.x + h.width - rectWidth/2, y: h.y - rectHeight - 10 }) },
        { name: 'topFarLeft', getPosition: (h) => ({ x: h.x - rectWidth, y: h.y - rectHeight - 10 }) },
        { name: 'topFarRight', getPosition: (h) => ({ x: h.x + h.width, y: h.y - rectHeight - 10 }) },
    ];
    
    // 修正されたスコアリングで位置を評価
    const positionScores = candidatePositions.map(pos => {
        // この位置にビジュアライゼーションを作成
        const rect = { ...pos.getPosition(hand), width: rectWidth, height: rectHeight };
        
        // 標準の境界チェック
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > canvasWidth || rect.y + rect.height > canvasHeight) {
            return { position: pos.name, rect, score: -1000 };
        }
        
        let score = 0;
        
        // 標準の交差ペナルティ
        // ...
        
        // 手の上の位置に強いボーナス
        if (pos.name.startsWith('top')) {
            score += 200; // すべての「上」位置に対する非常に高いボーナス
        }
        
        // 中央上の位置に追加ボーナス
        if (pos.name === 'topCenter') {
            score += 50; // 中央揃えに対する追加ボーナス
        }
        
        // 標準の位置の一貫性ボーナス
        // ...
        
        return { position: pos.name, rect, score };
    });
    
    // 以前と同様に最適な位置を見つける
    positionScores.sort((a, b) => b.score - a.score);
    return positionScores[0].rect;
}
```

スコアリングシステムを理解し、変更することで、アプリケーションの特定の要件にアルゴリズムを適応させることができます。

## パフォーマンスの考慮事項

1. **交差計算**: 多くのオブジェクトに対して、交差計算を最適化します
2. **候補位置**: パフォーマンスを向上させるために候補位置の数を減らします
3. **オブジェクトフィルタリング**: 交差テストのために近くのオブジェクトのみを考慮します
4. **スロットリング**: レンダリングよりも頻度を減らして最適な位置を計算することを検討します

## 異なるユースケースへの適応

- **異なるオブジェクトタイプ**: アプリケーションの優先順位に基づいてスコアリングシステムを変更します
- **異なるUI要素**: UI要素の目的に基づいて候補位置を調整します
- **モバイル対デスクトップ**: 画面サイズに基づいて異なる配置戦略を検討します
- **3Dアプリケーション**: 位置決定に深度の考慮を追加して3Dに拡張します

---

このアルゴリズムは、オブジェクトがリアルタイムで検出および追跡されている動的な環境でUI要素を配置するための堅牢なソリューションを提供します。 