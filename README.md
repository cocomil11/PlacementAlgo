# Face and Hand Detection App

A web application that uses your webcam to detect human faces and hands in real-time and draws bounding boxes around them.

## Features

- Real-time face detection using TensorFlow.js with BlazeFace model
- Real-time hand detection using TensorFlow.js with HandPose model
- Displays colored bounding boxes around detected faces (red) and hands (green)
- Shows confidence scores for detected faces
- Simple and intuitive user interface

## How to Use

1. Clone or download this repository
2. Open the project in a web server. You can use one of these methods:
   - Use a local development server like Live Server in VS Code
   - Run `python -m http.server` from the project directory
   - Use any other web server you prefer

3. Open the application in a web browser (Chrome is recommended)
4. Click the "Start Camera" button to activate your webcam
5. Allow camera access when prompted by the browser
6. The app will start detecting faces and hands in the webcam feed and draw bounding boxes around them
7. Click "Stop Camera" when you're done

## Requirements

- Modern web browser with WebRTC support (Chrome, Firefox, Edge, etc.)
- Webcam or camera
- Internet connection (to load the TensorFlow.js libraries)

## Technologies Used

- HTML5, CSS3, JavaScript
- [TensorFlow.js](https://www.tensorflow.org/js)
- [BlazeFace model](https://github.com/tensorflow/tfjs-models/tree/master/blazeface) for face detection
- [HandPose model](https://github.com/tensorflow/tfjs-models/tree/master/handpose) for hand detection
- Browser's MediaDevices API

## Notes

- The detection is performed client-side, so your webcam feed is not sent to any server
- Detection quality depends on lighting conditions, camera quality, and visibility
- Face detection works best when your face is clearly visible and well-lit
- Hand detection works best when your hand is clearly visible with spread fingers
- For optimal performance, use a device with a good camera and recent hardware

## Performance Tips

- Ensure good lighting for better detection accuracy
- If your device is struggling with performance, try closing other applications
- The front-facing camera is used by default for better face detection 