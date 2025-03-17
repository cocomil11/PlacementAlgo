# Optimal Object Positioning and Smoothing Algorithms

This documentation explains the algorithms used for finding optimal positions for UI elements and smoothing their movements. These algorithms are particularly useful for placing UI elements (like labels, info boxes, or controls) around detected objects in computer vision applications.

## Table of Contents

- [Optimal Object Positioning and Smoothing Algorithms](#optimal-object-positioning-and-smoothing-algorithms)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Key Components in app.js](#key-components-in-appjs)
    - [Object Tracking System](#object-tracking-system)
    - [Position Memory System](#position-memory-system)
  - [Algorithm 1: Optimal Position Finding](#algorithm-1-optimal-position-finding)
    - [How the Algorithm Works](#how-the-algorithm-works)
    - [Intersection Calculation](#intersection-calculation)
  - [Algorithm 2: Position Smoothing](#algorithm-2-position-smoothing)
    - [How the Smoothing Works](#how-the-smoothing-works)
    - [Memory Cleanup](#memory-cleanup)
  - [How to Implement in Your Project](#how-to-implement-in-your-project)
    - [Step 1: Set Up Object Tracking](#step-1-set-up-object-tracking)
    - [Step 2: Copy the Core Functions](#step-2-copy-the-core-functions)
    - [Step 3: Integrate Into Your Rendering Loop](#step-3-integrate-into-your-rendering-loop)
  - [Configuration Options](#configuration-options)
  - [Understanding the Scoring System](#understanding-the-scoring-system)
    - [Penalties](#penalties)
    - [Bonuses](#bonuses)
    - [Penalty and Bonus Magnitudes](#penalty-and-bonus-magnitudes)
  - [Implementing Custom Reward Rules](#implementing-custom-reward-rules)
    - [1. Adjust Existing Position Preferences](#1-adjust-existing-position-preferences)
    - [2. Add Context-Specific Rules](#2-add-context-specific-rules)
    - [3. Add Custom Penalty Factors](#3-add-custom-penalty-factors)
    - [4. Create New Position Candidates](#4-create-new-position-candidates)
    - [5. Create a Complete Custom Scoring Function](#5-create-a-complete-custom-scoring-function)
    - [Example: Implementing "Always Above Hand" Preference](#example-implementing-always-above-hand-preference)
  - [Performance Considerations](#performance-considerations)
  - [Adapting for Different Use Cases](#adapting-for-different-use-cases)

## Overview

The algorithms solve two main problems:

1. **Optimal Positioning**: Finding the best place to put UI elements around detected objects without overlapping other important elements
2. **Position Smoothing**: Preventing UI elements from jumping around when detected objects move quickly

These algorithms are implemented in `app.js` and can be adapted for any project requiring intelligent UI element placement.

## Key Components in app.js

### Object Tracking System

```javascript
// Found near the top of app.js
let allDetectedObjects = {
    faces: [],
    hands: [],
    visualizations: []
};
```

This structure stores all detected objects in the current frame, which is essential for calculating positions without overlaps.

### Position Memory System

```javascript
// Position memory for visualization stabilization
let previousRectPositions = {};
let positionTransitions = {};

// Stabilization configuration
const stabilizationConfig = {
    hysteresisThreshold: 200,
    previousPositionBonus: 150,
    smoothingFactor: 0.2,
    positionMemoryTimeout: 1000
};
```

These variables store position history and configuration for the smoothing algorithm.

## Algorithm 1: Optimal Position Finding

The core algorithm is in the `findOptimalVisualizationPosition` function:

```javascript
function findOptimalVisualizationPosition(hand, rectWidth, rectHeight, allObjects, canvasWidth, canvasHeight) {
    // Define candidate positions relative to the hand
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
    
    // Get previous position for this hand if it exists
    const prevPosition = previousRectPositions[hand.id];
    
    // Evaluate each position
    const positionScores = candidatePositions.map(pos => {
        const rect = {
            ...pos.getPosition(hand),
            width: rectWidth,
            height: rectHeight
        };
        
        // Check if visualization is within canvas bounds
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > canvasWidth || rect.y + rect.height > canvasHeight) {
            return { position: pos.name, rect, score: -1000 }; // Heavily penalize out-of-bounds
        }
        
        // Calculate scores based on intersections
        let score = 0;
        
        // Penalize intersections with faces (highest penalty)
        allObjects.faces.forEach(face => {
            const intersection = calculateIntersectionArea(rect, face);
            score -= intersection * 10; // Higher penalty for face intersections
        });
        
        // Penalize intersections with hands
        allObjects.hands.forEach(otherHand => {
            if (otherHand !== hand) { // Don't penalize intersection with self
                const intersection = calculateIntersectionArea(rect, otherHand);
                score -= intersection * 5;
            }
        });
        
        // Penalize intersections with other visualizations
        allObjects.visualizations.forEach(otherRect => {
            const intersection = calculateIntersectionArea(rect, otherRect);
            score -= intersection * 5;
        });
        
        // Prefer positions closer to the hand (distance penalty)
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
        score -= distance * 0.1; // Small distance penalty
        
        // Bonus for preferred positions (right side is preferred)
        if (pos.name === 'right') score += 100;
        if (pos.name === 'left') score += 90;
        
        // Bonus for position consistency - favor previous position
        if (prevPosition) {
            // Check if this position is close to the previous position
            const distanceToPrev = Math.sqrt(
                Math.pow(rect.x - prevPosition.x, 2) + 
                Math.pow(rect.y - prevPosition.y, 2)
            );
            
            // If we're fairly close to previous position, add a big bonus
            if (distanceToPrev < 50) {
                score += stabilizationConfig.previousPositionBonus;
            }
        }
        
        return { position: pos.name, rect, score };
    });
    
    // Find position with highest score
    positionScores.sort((a, b) => b.score - a.score);
    const bestPosition = positionScores[0];
    
    // Return null if all positions are bad (e.g., all out of bounds)
    if (bestPosition.score < -500) return null;
    
    return bestPosition.rect;
}
```

### How the Algorithm Works

1. **Define Candidate Positions**: The algorithm considers 8 positions around the object (right, left, top, bottom, and the 4 corners)
2. **Score Each Position**: Each position is scored based on:
   - Boundary violations (staying within the canvas)
   - Overlaps with other objects (faces, hands, other UI elements)
   - Distance from the associated object
   - Preferred positions (right side is favored)
   - Consistency with previous position
3. **Select Best Position**: The position with the highest score is chosen

### Intersection Calculation

The algorithm uses this helper function to calculate overlaps:

```javascript
function calculateIntersectionArea(rect1, rect2) {
    // Find the intersection coordinates
    const xOverlap = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - Math.max(rect1.x, rect2.x));
    const yOverlap = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - Math.max(rect1.y, rect2.y));
    
    // Calculate intersection area
    return xOverlap * yOverlap;
}
```

## Algorithm 2: Position Smoothing

The smoothing algorithm is implemented in the `stabilizeVisualizationPosition` function:

```javascript
function stabilizeVisualizationPosition(handId, newPosition) {
    const currentTime = Date.now();
    
    // If we have no previous position for this hand, initialize it
    if (!previousRectPositions[handId]) {
        previousRectPositions[handId] = {
            x: newPosition.x,
            y: newPosition.y,
            lastSeen: currentTime
        };
        return newPosition;
    }
    
    // Get previous position
    const prevPos = previousRectPositions[handId];
    
    // Create or update transition state
    if (!positionTransitions[handId]) {
        positionTransitions[handId] = {
            targetX: newPosition.x,
            targetY: newPosition.y,
            currentX: prevPos.x,
            currentY: prevPos.y
        };
    } else {
        // Update the target position
        positionTransitions[handId].targetX = newPosition.x;
        positionTransitions[handId].targetY = newPosition.y;
    }
    
    const transition = positionTransitions[handId];
    
    // Apply smoothing (lerp) between current and target
    transition.currentX += (transition.targetX - transition.currentX) * stabilizationConfig.smoothingFactor;
    transition.currentY += (transition.targetY - transition.currentY) * stabilizationConfig.smoothingFactor;
    
    // Update previous position
    previousRectPositions[handId] = {
        x: transition.currentX,
        y: transition.currentY,
        lastSeen: currentTime
    };
    
    // Return the smoothed position
    return {
        x: Math.round(transition.currentX),
        y: Math.round(transition.currentY)
    };
}
```

### How the Smoothing Works

1. **Position Memory**: The system remembers the previous position of each UI element
2. **Linear Interpolation**: When a new position is calculated, the UI element moves gradually toward it
3. **Smoothing Factor**: Controls how quickly the UI element moves to the new position (0.2 = 20% of the way each frame)
4. **Timestamp Tracking**: Records when each object was last seen to handle disappearing objects

### Memory Cleanup

To prevent memory leaks, the system includes a cleanup function:

```javascript
function cleanStaleHandPositions(seenHandIds) {
    const currentTime = Date.now();
    
    // Check each hand in our memory
    Object.keys(previousRectPositions).forEach(handId => {
        if (!seenHandIds.has(handId)) {
            const lastSeen = previousRectPositions[handId].lastSeen || 0;
            const timeSinceLastSeen = currentTime - lastSeen;
            
            // If we haven't seen this hand for too long, remove it
            if (timeSinceLastSeen > stabilizationConfig.positionMemoryTimeout) {
                delete previousRectPositions[handId];
                delete positionTransitions[handId];
            }
        }
    });
}
```

## How to Implement in Your Project

### Step 1: Set Up Object Tracking

```javascript
// Initialize object storage
let allObjects = {
    primaryObjects: [], // Your detected objects (e.g., faces, products, etc.)
    uiElements: []      // UI elements to position (labels, buttons, etc.)
};

// Position memory
let previousPositions = {};
let positionTransitions = {};

// Configuration
const config = {
    smoothingFactor: 0.2,      // 0-1, lower = smoother but more lag
    positionMemoryTimeout: 1000, // ms to remember positions
    previousPositionBonus: 150  // Score bonus for previous positions
};
```

### Step 2: Copy the Core Functions

Copy these functions from app.js:
- `calculateIntersectionArea`
- `findOptimalVisualizationPosition` (adapt for your object types)
- `stabilizeVisualizationPosition`
- `cleanStalePositions`

### Step 3: Integrate Into Your Rendering Loop

```javascript
function updateFrame() {
    // Get your detected objects
    const detectedObjects = yourDetectionSystem.getObjects();
    
    // Reset object tracking for this frame
    allObjects.primaryObjects = [];
    allObjects.uiElements = [];
    
    // Track which objects were seen this frame
    const seenObjectIds = new Set();
    
    // Process each detected object
    detectedObjects.forEach(obj => {
        // Add to tracking
        allObjects.primaryObjects.push({
            id: obj.id,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height
        });
        
        // Mark as seen
        seenObjectIds.add(obj.id);
        
        // Find optimal position for UI element
        const uiElement = {
            width: 100,  // Your UI element width
            height: 150  // Your UI element height
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
            // Apply smoothing
            const smoothedPosition = stabilizeVisualizationPosition(obj.id, optimalPosition);
            
            // Render your UI element
            renderUIElement(smoothedPosition.x, smoothedPosition.y, uiElement.width, uiElement.height);
            
            // Add to tracking for next element's calculations
            allObjects.uiElements.push({
                x: smoothedPosition.x,
                y: smoothedPosition.y,
                width: uiElement.width,
                height: uiElement.height
            });
        }
    });
    
    // Clean up stale positions
    cleanStalePositions(seenObjectIds);
    
    // Continue animation loop
    requestAnimationFrame(updateFrame);
}
```

## Configuration Options

You can adjust these parameters in the `stabilizationConfig` object:

| Parameter | Description | Typical Values |
|-----------|-------------|----------------|
| `smoothingFactor` | How quickly elements move to new positions | 0.1-0.3 (lower = smoother) |
| `previousPositionBonus` | Score bonus for previous positions | 100-200 (higher = more stable) |
| `positionMemoryTimeout` | How long to remember positions (ms) | 500-2000 |

## Understanding the Scoring System

The optimal position finding algorithm uses a scoring system with penalties and bonuses to evaluate each candidate position. Understanding this system is crucial for customizing it to your needs.

### Penalties

Penalties reduce the score of a position, making it less likely to be chosen:

1. **Boundary Violations**: Positions outside the canvas boundaries receive a severe penalty (-1000)
   ```javascript
   if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > canvasWidth || rect.y + rect.height > canvasHeight) {
       return { position: pos.name, rect, score: -1000 };
   }
   ```

2. **Object Intersections**: Penalties are applied based on the area of overlap with other objects
   ```javascript
   // Face intersections (highest penalty)
   allObjects.faces.forEach(face => {
       const intersection = calculateIntersectionArea(rect, face);
       score -= intersection * 10; // 10x multiplier for faces
   });
   
   // Hand intersections
   allObjects.hands.forEach(otherHand => {
       if (otherHand !== hand) {
           const intersection = calculateIntersectionArea(rect, otherHand);
           score -= intersection * 5; // 5x multiplier for hands
       }
   });
   
   // Other UI element intersections
   allObjects.visualizations.forEach(otherRect => {
       const intersection = calculateIntersectionArea(rect, otherRect);
       score -= intersection * 5; // 5x multiplier for other UI elements
   });
   ```

3. **Distance Penalty**: Positions far from the associated object receive a small penalty
   ```javascript
   const distance = Math.sqrt(
       Math.pow(handCenter.x - rectCenter.x, 2) + 
       Math.pow(handCenter.y - rectCenter.y, 2)
   );
   score -= distance * 0.1; // Small distance penalty (0.1x multiplier)
   ```

### Bonuses

Bonuses increase the score of a position, making it more likely to be chosen:

1. **Preferred Position Bonus**: Certain positions receive fixed bonuses
   ```javascript
   // Right side is most preferred
   if (pos.name === 'right') score += 100;
   // Left side is second most preferred
   if (pos.name === 'left') score += 90;
   ```

2. **Position Consistency Bonus**: Positions close to the previous position receive a bonus
   ```javascript
   if (prevPosition) {
       const distanceToPrev = Math.sqrt(
           Math.pow(rect.x - prevPosition.x, 2) + 
           Math.pow(rect.y - prevPosition.y, 2)
       );
       
       if (distanceToPrev < 50) {
           score += stabilizationConfig.previousPositionBonus; // Default: 150
       }
   }
   ```

### Penalty and Bonus Magnitudes

The relative magnitudes of penalties and bonuses determine the algorithm's behavior:

- **Intersection penalties** (5-10 per pixel²) are high to strongly avoid overlaps
- **Distance penalty** (0.1 per pixel) is low to weakly prefer closer positions
- **Position bonuses** (90-100) are moderate to influence but not override other factors
- **Consistency bonus** (150) is high to prevent frequent position changes

## Implementing Custom Reward Rules

To implement your own reward rules (e.g., preferring positions above the hand), you can modify the scoring system in the `findOptimalVisualizationPosition` function. Here's how:

### 1. Adjust Existing Position Preferences

To prefer positions above the hand, modify the position bonus section:

```javascript
// Bonus for preferred positions
if (pos.name === 'top') score += 150;      // Highest preference for top
if (pos.name === 'topLeft') score += 140;  // Second preference
if (pos.name === 'topRight') score += 130; // Third preference
if (pos.name === 'right') score += 100;    // Lower preference
if (pos.name === 'left') score += 90;      // Lower preference
```

### 2. Add Context-Specific Rules

You can add rules based on the specific context of your application:

```javascript
// Example: Prefer positions based on screen quadrant
const screenCenterX = canvasWidth / 2;
const screenCenterY = canvasHeight / 2;

// If object is in top-left quadrant, prefer bottom-right positioning
if (hand.x < screenCenterX && hand.y < screenCenterY) {
    if (pos.name === 'bottomRight') score += 120;
}
// If object is in bottom-right quadrant, prefer top-left positioning
else if (hand.x >= screenCenterX && hand.y >= screenCenterY) {
    if (pos.name === 'topLeft') score += 120;
}
```

### 3. Add Custom Penalty Factors

You can create custom penalties based on your application's requirements:

```javascript
// Example: Penalize positions that would be off-screen on mobile devices
const mobileScreenWidth = 375; // Typical mobile width
if (rect.x + rect.width > mobileScreenWidth) {
    // Apply penalty for positions that might be off-screen on mobile
    score -= 50;
}
```

### 4. Create New Position Candidates

You can add new candidate positions to the `candidatePositions` array:

```javascript
// Add more granular position options
const candidatePositions = [
    // Existing positions...
    
    // New positions
    { name: 'topNear', getPosition: (h) => ({ 
        x: h.x + (h.width/2) - (rectWidth/2), 
        y: h.y - rectHeight - 5 // Closer to the object
    })},
    { name: 'topFar', getPosition: (h) => ({ 
        x: h.x + (h.width/2) - (rectWidth/2), 
        y: h.y - rectHeight - 30 // Further from the object
    })},
    // Add more custom positions...
];
```

### 5. Create a Complete Custom Scoring Function

For maximum flexibility, you can replace the entire scoring logic:

```javascript
function customPositionScoring(rect, hand, allObjects) {
    let score = 1000; // Start with a base score
    
    // Your custom scoring logic here
    // ...
    
    return score;
}

// Then use it in the position evaluation
const positionScores = candidatePositions.map(pos => {
    const rect = {
        ...pos.getPosition(hand),
        width: rectWidth,
        height: rectHeight
    };
    
    // Use custom scoring instead of the default logic
    const score = customPositionScoring(rect, hand, allObjects);
    
    return { position: pos.name, rect, score };
});
```

### Example: Implementing "Always Above Hand" Preference

Here's a complete example of modifying the algorithm to strongly prefer positions above the hand:

```javascript
function findOptimalVisualizationPosition(hand, rectWidth, rectHeight, allObjects, canvasWidth, canvasHeight) {
    // Define candidate positions with more options above the hand
    const candidatePositions = [
        // Standard positions
        { name: 'right', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y + (h.height/2) - (rectHeight/2) }) },
        { name: 'left', getPosition: (h) => ({ x: h.x - rectWidth - 10, y: h.y + (h.height/2) - (rectHeight/2) }) },
        { name: 'bottom', getPosition: (h) => ({ x: h.x + (h.width/2) - (rectWidth/2), y: h.y + h.height + 10 }) },
        
        // More detailed "above" positions
        { name: 'topCenter', getPosition: (h) => ({ x: h.x + (h.width/2) - (rectWidth/2), y: h.y - rectHeight - 10 }) },
        { name: 'topLeft', getPosition: (h) => ({ x: h.x - rectWidth/2, y: h.y - rectHeight - 10 }) },
        { name: 'topRight', getPosition: (h) => ({ x: h.x + h.width - rectWidth/2, y: h.y - rectHeight - 10 }) },
        { name: 'topFarLeft', getPosition: (h) => ({ x: h.x - rectWidth, y: h.y - rectHeight - 10 }) },
        { name: 'topFarRight', getPosition: (h) => ({ x: h.x + h.width, y: h.y - rectHeight - 10 }) },
    ];
    
    // Evaluate positions with modified scoring
    const positionScores = candidatePositions.map(pos => {
        // Create visualization at this position
        const rect = { ...pos.getPosition(hand), width: rectWidth, height: rectHeight };
        
        // Standard boundary check
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > canvasWidth || rect.y + rect.height > canvasHeight) {
            return { position: pos.name, rect, score: -1000 };
        }
        
        let score = 0;
        
        // Standard intersection penalties
        // ...
        
        // Strong bonus for positions above the hand
        if (pos.name.startsWith('top')) {
            score += 200; // Much higher bonus for any "top" position
        }
        
        // Additional bonus for the center-top position
        if (pos.name === 'topCenter') {
            score += 50; // Extra bonus for center alignment
        }
        
        // Standard position consistency bonus
        // ...
        
        return { position: pos.name, rect, score };
    });
    
    // Find best position as before
    positionScores.sort((a, b) => b.score - a.score);
    return positionScores[0].rect;
}
```

By understanding and modifying the scoring system, you can adapt the algorithm to meet the specific requirements of your application.

## Performance Considerations

1. **Intersection Calculations**: For many objects, optimize the intersection calculations
2. **Candidate Positions**: Reduce the number of candidate positions for better performance
3. **Object Filtering**: Only consider nearby objects for intersection tests
4. **Throttling**: Consider calculating optimal positions less frequently than rendering

## Adapting for Different Use Cases

- **Different Object Types**: Modify the scoring system based on your application's priorities
- **Different UI Elements**: Adjust candidate positions based on your UI element's purpose
- **Mobile vs Desktop**: Consider different positioning strategies based on screen size
- **3D Applications**: Extend to 3D by adding depth considerations to positioning

---

This algorithm provides a robust solution for positioning UI elements in dynamic environments where objects are being detected and tracked in real-time. 