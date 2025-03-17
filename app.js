// DOM elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const detectionsElement = document.getElementById('detections');

// Global variables
let faceModel;
let handModel;
let stream;
let isDetecting = false;
let animationId;

// Store all detected objects for visualization placement optimization
let allDetectedObjects = {
    faces: [],
    physicalObjects: [],
    visualizations: []
};

// Position memory for visualization stabilization
let previousVisualizationPositions = {};
let positionTransitions = {};

// Colors for different detections
const colors = {
    face: '#FF0000',  // Red
    hand: '#00FF00'   // Green
};

// Visualization dimensions
const visualizationConfig = {
    width: 100,
    height: 160
};

// Stabilization configuration
const stabilizationConfig = {
    // Minimum score difference needed to change positions
    hysteresisThreshold: 200,
    // Bonus score for previous position to maintain stability
    previousPositionBonus: 150,
    // How quickly to move toward new target position (0-1, lower = slower)
    smoothingFactor: 0.2,
    // Maximum time (ms) to remember a hand's position when not detected
    positionMemoryTimeout: 1000
};

// Initialize the application
async function init() {
    try {
        // Load face and hand detection models
        console.log('Loading detection models...');
        
        // Load face model
        faceModel = await blazeface.load();
        
        // Load MediaPipe Hands model with multi-hand support
        const detectorConfig = {
            runtime: 'mediapipe',
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
            modelType: 'full',
            maxHands: 2  // Set to detect up to 2 hands
        };
        handModel = await handPoseDetection.createDetector(
            handPoseDetection.SupportedModels.MediaPipeHands,
            detectorConfig
        );
        
        console.log('Models loaded successfully');
        
        // Add event listeners
        startBtn.addEventListener('click', startDetection);
        stopBtn.addEventListener('click', stopDetection);
        
        // Enable start button
        startBtn.disabled = false;
    } catch (error) {
        console.error('Error initializing the application:', error);
        alert('Error initializing the application. Please check the console for details.');
    }
}

// Start webcam and detection
async function startDetection() {
    try {
        // Get webcam access
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },  // Use front camera for better face detection
            audio: false
        });
        
        // Set video source to webcam stream
        video.srcObject = stream;
        
        // Wait for video to load metadata
        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Play video
        await video.play();
        
        // Update buttons
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Reset position memory
        previousVisualizationPositions = {};
        positionTransitions = {};
        
        // Start detection
        isDetecting = true;
        detectObjects();
        
    } catch (error) {
        console.error('Error starting detection:', error);
        alert('Could not access the webcam. Please make sure you have given permission and no other application is using it.');
    }
}

// Stop webcam and detection
function stopDetection() {
    // Stop animation frame
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // Stop webcam stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Clear detections list
    detectionsElement.innerHTML = '';
    
    // Update buttons
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    // Update detection flag
    isDetecting = false;
}

// Detect objects in the video stream
async function detectObjects() {
    if (!isDetecting) return;
    
    try {
        // Run face and hand detection in parallel
        const [faceDetections, handDetections] = await Promise.all([
            faceModel.estimateFaces(video),
            handModel.estimateHands(video)
        ]);
        
        // Clear previous detections
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        detectionsElement.innerHTML = '';
        
        // Reset detected objects for this frame
        allDetectedObjects = {
            faces: [],
            physicalObjects: [],
            visualizations: []
        };
        
        // Track which objectIds were seen this frame
        const seenPhysicalObjectIds = new Set();
        
        // Draw face detections
        drawFaceDetections(faceDetections);
        
        // Draw hand detections
        drawHandDetections(handDetections, seenPhysicalObjectIds);
        
        // Clean up any stale physical object positions
        cleanStalePhysicalObjectPositions(seenPhysicalObjectIds);
        
        // Continue detection loop
        animationId = requestAnimationFrame(detectObjects);
    } catch (error) {
        console.error('Error during detection:', error);
    }
}

// Clean up physical object positions that haven't been seen recently
function cleanStalePhysicalObjectPositions(seenPhysicalObjectIds) {
    const currentTime = Date.now();
    
    // Check each physical object in our memory
    Object.keys(previousVisualizationPositions).forEach(objectId => {
        if (!seenPhysicalObjectIds.has(objectId)) {
            const lastSeen = previousVisualizationPositions[objectId].lastSeen || 0;
            const timeSinceLastSeen = currentTime - lastSeen;
            
            // If we haven't seen this physical object for too long, remove it
            if (timeSinceLastSeen > stabilizationConfig.positionMemoryTimeout) {
                delete previousVisualizationPositions[objectId];
                delete positionTransitions[objectId];
            }
        }
    });
}

// Draw face bounding boxes
function drawFaceDetections(faceDetections) {
    // Font settings for labels
    ctx.font = '16px Arial';
    ctx.lineWidth = 2;
    
    // Process each face prediction
    faceDetections.forEach(face => {
        // BlazeFace returns different bbox format
        const topLeft = face.topLeft;
        const bottomRight = face.bottomRight;
        const width = bottomRight[0] - topLeft[0];
        const height = bottomRight[1] - topLeft[1];
        
        // Store face data for visualization placement
        allDetectedObjects.faces.push({
            x: topLeft[0],
            y: topLeft[1],
            width: width,
            height: height
        });
        
        // Get confidence score
        const confidence = Math.round(face.probability[0] * 100);
        
        // Draw bounding box
        ctx.strokeStyle = colors.face;
        ctx.fillStyle = colors.face;
        ctx.beginPath();
        ctx.rect(topLeft[0], topLeft[1], width, height);
        ctx.stroke();
        
        // Draw background for text
        const label = "Face";
        const textWidth = ctx.measureText(`${label} ${confidence}%`).width;
        ctx.fillRect(topLeft[0], topLeft[1] - 20, textWidth + 10, 20);
        
        // Draw text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${label} ${confidence}%`, topLeft[0] + 5, topLeft[1] - 5);
        
        // Add to detections list
        const detectionItem = document.createElement('div');
        detectionItem.className = 'detection-item';
        detectionItem.innerHTML = `
            <span class="detection-label">${label}</span>
            <span class="detection-confidence">${confidence}% confidence</span>
        `;
        detectionsElement.appendChild(detectionItem);
    });
}

// Draw hand bounding boxes
function drawHandDetections(handDetections, seenPhysicalObjectIds) {
    // Process each hand prediction
    handDetections.forEach((hand, index) => {
        // MediaPipe Hands returns keypoints differently than HandPose
        // Calculate bounding box from keypoints
        const keypoints = hand.keypoints;
        const xs = keypoints.map(point => point.x);
        const ys = keypoints.map(point => point.y);
        
        // Calculate bounding box
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        // Add padding to bounding box
        const padding = 10;
        const x = Math.max(0, minX - padding);
        const y = Math.max(0, minY - padding);
        const boxWidth = width + 2 * padding;
        const boxHeight = height + 2 * padding;
        
        // Get hand label (left/right hand)
        const handedness = hand.handedness === 'Left' ? 'Right' : 'Left';  // Camera inversion
        const label = `${handedness} Hand`;
        
        // Create a unique ID for this hand
        const handId = `${handedness}_${index}`;
        
        // Mark this hand as seen in this frame
        seenPhysicalObjectIds.add(handId);
        
        // Update lastSeen timestamp if we have previous position data
        if (previousVisualizationPositions[handId]) {
            previousVisualizationPositions[handId].lastSeen = Date.now();
        }
        
        // Store hand data for visualization placement
        const handObject = {
            id: handId,
            x: x,
            y: y,
            width: boxWidth,
            height: boxHeight,
            label: handedness
        };
        allDetectedObjects.physicalObjects.push(handObject);
        
        // Draw bounding box
        ctx.strokeStyle = colors.hand;
        ctx.fillStyle = colors.hand;
        ctx.beginPath();
        ctx.rect(x, y, boxWidth, boxHeight);
        ctx.stroke();
        
        // Draw background for text
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x, y - 20, textWidth + 10, 20);
        
        // Draw text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, x + 5, y - 5);
        
        // Add to detections list
        const detectionItem = document.createElement('div');
        detectionItem.className = 'detection-item';
        detectionItem.innerHTML = `
            <span class="detection-label">${label}</span>
        `;
        detectionsElement.appendChild(detectionItem);
        
        // Calculate the optimal position for the red visualization
        const visualizationPosition = findOptimalVisualizationPosition(
            handObject,
            visualizationConfig.width,
            visualizationConfig.height,
            allDetectedObjects,
            canvas.width,
            canvas.height
        );
        
        // If we found a valid position
        if (visualizationPosition) {
            // Apply position stabilization
            const stabilizedPosition = stabilizeVisualizationPosition(handId, visualizationPosition);
            
            // Draw the red visualization
            ctx.fillStyle = '#FF0000'; // Red color
            ctx.fillRect(
                stabilizedPosition.x, 
                stabilizedPosition.y, 
                visualizationConfig.width, 
                visualizationConfig.height
            );
            
            // Add a white border to make it more visible
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                stabilizedPosition.x, 
                stabilizedPosition.y, 
                visualizationConfig.width, 
                visualizationConfig.height
            );
            
            // Add hand label on the red visualization
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                handedness[0], 
                stabilizedPosition.x + visualizationConfig.width/2, 
                stabilizedPosition.y + visualizationConfig.height/2
            );  // First letter of handedness
            ctx.textAlign = 'start'; // Reset text alignment
            ctx.textBaseline = 'alphabetic'; // Reset text baseline
            
            // Store the visualization for future placement calculations
            allDetectedObjects.visualizations.push({
                x: stabilizedPosition.x,
                y: stabilizedPosition.y,
                width: visualizationConfig.width,
                height: visualizationConfig.height
            });
        }
    });
}

// Stabilize visualization position to prevent jumping
function stabilizeVisualizationPosition(objectId, newPosition) {
    const currentTime = Date.now();
    
    // If we have no previous position for this physical object, initialize it
    if (!previousVisualizationPositions[objectId]) {
        previousVisualizationPositions[objectId] = {
            x: newPosition.x,
            y: newPosition.y,
            lastSeen: currentTime
        };
        return newPosition;
    }
    
    // Get previous position
    const prevPos = previousVisualizationPositions[objectId];
    
    // Create or update transition state
    if (!positionTransitions[objectId]) {
        positionTransitions[objectId] = {
            targetX: newPosition.x,
            targetY: newPosition.y,
            currentX: prevPos.x,
            currentY: prevPos.y
        };
    } else {
        // Update the target position
        positionTransitions[objectId].targetX = newPosition.x;
        positionTransitions[objectId].targetY = newPosition.y;
    }
    
    const transition = positionTransitions[objectId];
    
    // Apply smoothing (lerp) between current and target
    transition.currentX += (transition.targetX - transition.currentX) * stabilizationConfig.smoothingFactor;
    transition.currentY += (transition.targetY - transition.currentY) * stabilizationConfig.smoothingFactor;
    
    // Update previous position
    previousVisualizationPositions[objectId] = {
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

// Calculate intersection area between two visualizations
function calculateIntersectionArea(rect1, rect2) {
    // Find the intersection coordinates
    const xOverlap = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - Math.max(rect1.x, rect2.x));
    const yOverlap = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - Math.max(rect1.y, rect2.y));
    
    // Calculate intersection area
    return xOverlap * yOverlap;
}

// Find the optimal position for a visualization
function findOptimalVisualizationPosition(physicalObject, visualizationWidth, visualizationHeight, allObjects, canvasWidth, canvasHeight) {
    // Define candidate positions relative to the physicalObject
    const candidatePositions = [
        { name: 'right', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y + (h.height/2) - (visualizationHeight/2) }) },
        { name: 'left', getPosition: (h) => ({ x: h.x - visualizationWidth - 10, y: h.y + (h.height/2) - (visualizationHeight/2) }) },
        { name: 'top', getPosition: (h) => ({ x: h.x + (h.width/2) - (visualizationWidth/2), y: h.y - visualizationHeight - 10 }) },
        { name: 'bottom', getPosition: (h) => ({ x: h.x + (h.width/2) - (visualizationWidth/2), y: h.y + h.height + 10 }) },
        { name: 'topRight', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y - visualizationHeight - 10 }) },
        { name: 'topLeft', getPosition: (h) => ({ x: h.x - visualizationWidth - 10, y: h.y - visualizationHeight - 10 }) },
        { name: 'bottomRight', getPosition: (h) => ({ x: h.x + h.width + 10, y: h.y + h.height + 10 }) },
        { name: 'bottomLeft', getPosition: (h) => ({ x: h.x - visualizationWidth - 10, y: h.y + h.height + 10 }) }
    ];
    
    // Get previous position for this physicalObject if it exists
    const prevPosition = previousVisualizationPositions[physicalObject.id];
    
    // Evaluate each position
    const positionScores = candidatePositions.map(pos => {
        const visualization = {
            ...pos.getPosition(physicalObject),
            width: visualizationWidth,
            height: visualizationHeight
        };
        
        // Check if visualization is within canvas bounds
        if (visualization.x < 0 || visualization.y < 0 || visualization.x + visualization.width > canvasWidth || visualization.y + visualization.height > canvasHeight) {
            return { position: pos.name, visualization, score: -1000 }; // Heavily penalize out-of-bounds
        }
        
        // Calculate scores based on intersections
        let score = 0;
        
        // Penalize intersections with faces (highest penalty)
        allObjects.faces.forEach(face => {
            const intersection = calculateIntersectionArea(visualization, face);
            score -= intersection * 10; // Higher penalty for face intersections
        });
        
        // Penalize intersections with physicalObjects
        allObjects.physicalObjects.forEach(otherPhysicalObject => {
            if (otherPhysicalObject !== physicalObject) { // Don't penalize intersection with self
                const intersection = calculateIntersectionArea(visualization, otherPhysicalObject);
                score -= intersection * 5;
            }
        });
        
        // Penalize intersections with other visualizations
        allObjects.visualizations.forEach(otherVisualization => {
            const intersection = calculateIntersectionArea(visualization, otherVisualization);
            score -= intersection * 5;
        });
        
        // Prefer positions closer to the physicalObject (distance penalty)
        const physicalObjectCenter = {
            x: physicalObject.x + physicalObject.width/2,
            y: physicalObject.y + physicalObject.height/2
        };
        const visualizationCenter = {
            x: visualization.x + visualization.width/2,
            y: visualization.y + visualization.height/2
        };
        const distance = Math.sqrt(
            Math.pow(physicalObjectCenter.x - visualizationCenter.x, 2) + 
            Math.pow(physicalObjectCenter.y - visualizationCenter.y, 2)
        );
        score -= distance * 0.1; // Small distance penalty
        
        // Bonus for preferred positions (right side is preferred)
        if (pos.name === 'top') score += 100;
        
        // Bonus for position consistency - favor previous position
        if (prevPosition) {
            // Check if this position is close to the previous position
            const distanceToPrev = Math.sqrt(
                Math.pow(visualization.x - prevPosition.x, 2) + 
                Math.pow(visualization.y - prevPosition.y, 2)
            );
            
            // If we're fairly close to previous position, add a big bonus
            if (distanceToPrev < 50) {
                score += stabilizationConfig.previousPositionBonus;
            }
        }
        
        return { position: pos.name, visualization, score };
    });
    
    // Find position with highest score
    positionScores.sort((a, b) => b.score - a.score);
    const bestPosition = positionScores[0];
    
    return bestPosition.visualization;
}

// Initialize the app when the page loads
window.addEventListener('load', init); 