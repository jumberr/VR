'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.
let line;
let point;
let pointPos = [0.5, 0.5];
let stereoCamera;
let ui;
let background;
let texture;
let audio = null;
let video, videoTexture, context, mediaSource, biquadFilter, panner;
function deg2rad(angle) {
  return angle * PI / 180;
}
let accelerometer;
function readAccelerometer() {
  accelerometer = new Accelerometer({ frequency: 30 });
  accelerometer.start();
}

function CreateVideoTexture() {
  videoTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function CreateCamera() {
  video = document.createElement('video');
  video.setAttribute('autoplay', true);
  navigator.getUserMedia({ video: true, audio: false }, function(stream) {
    video.srcObject = stream;
  }, function(e) {
    console.error('Rejected!', e);
  });
}


// Constructor
function StereoCamera(
  Convergence,
  EyeSeparation,
  AspectRatio,
  FOV,
  NearClippingDistance,
  FarClippingDistance
) {

  this.mConvergence = Convergence;
  this.mEyeSeparation = EyeSeparation;
  this.mAspectRatio = AspectRatio;
  this.mFOV = FOV * PI / 180.0;
  this.mNearClippingDistance = NearClippingDistance;
  this.mFarClippingDistance = FarClippingDistance;
  this.mProjectionMatrix = m4.identity();
  this.mModelViewMatrix = m4.identity();

  this.ApplyLeftFrustum = function() {
    let top, bottom, left, right;

    top = this.mNearClippingDistance * tan(this.mFOV / 2);
    bottom = -top;

    const a = this.mAspectRatio * tan(this.mFOV / 2) * this.mConvergence;
    const b = a - this.mEyeSeparation / 2;
    const c = a + this.mEyeSeparation / 2;

    left = -b * this.mNearClippingDistance / this.mConvergence;
    right = c * this.mNearClippingDistance / this.mConvergence;

    this.mProjectionMatrix = m4.frustum(left, right, bottom, top,
      this.mNearClippingDistance, this.mFarClippingDistance);
    this.mModelViewMatrix = m4.translation(this.mEyeSeparation / 2, 0.0, 0.0);
  }

  this.ApplyRightFrustum = function() {
    let top, bottom, left, right;

    top = this.mNearClippingDistance * tan(this.mFOV / 2);
    bottom = -top;

    const a = this.mAspectRatio * tan(this.mFOV / 2) * this.mConvergence;
    const b = a - this.mEyeSeparation / 2;
    const c = a + this.mEyeSeparation / 2;

    left = -c * this.mNearClippingDistance / this.mConvergence;
    right = b * this.mNearClippingDistance / this.mConvergence;

    this.mProjectionMatrix = m4.frustum(left, right, bottom, top,
      this.mNearClippingDistance, this.mFarClippingDistance);
    this.mModelViewMatrix = m4.translation(-this.mEyeSeparation / 2, 0.0, 0.0);
  }
}


// Constructor
function Model(name) {
  this.name = name;
  this.iVertexBuffer = gl.createBuffer();
  this.iNormalBuffer = gl.createBuffer();
  this.iTextureBuffer = gl.createBuffer();
  this.count = 0;

  this.BufferData = function(vertices, normals, textures) {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STREAM_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textures), gl.STREAM_DRAW);

    this.count = vertices.length / 3;
  }

  this.Draw = function() {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
    gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribNormal);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
    gl.vertexAttribPointer(shProgram.iAttribTexture, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribTexture);

    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}


// Constructor
function ShaderProgram(name, program) {

  this.name = name;
  this.prog = program;

  // Location of the attribute variable in the shader program.
  this.iAttribVertex = -1;
  // Location of the uniform specifying a color for the primitive.
  this.iColor = -1;
  // Location of the uniform matrix representing the combined transformation.
  this.iModelViewProjectionMatrix = -1;

  this.Use = function() {
    gl.useProgram(this.prog);
  }
}


/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() {
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  /* Set the values of the projection transformation */
  // let projection = m4.perspective(Math.PI / 8, 1, 8, 12);
  const projVal = 17;
  let projection = m4.orthographic(-projVal, projVal, -projVal, projVal, -projVal, projVal);

  /* Get the view matrix from the SimpleRotator object.*/
  let modelView = spaceball.getViewMatrix();

  let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.01);
  let translateToPointZero = m4.translation(0, 0, -10);

  // let matAccX = m4.axisRotation([0.0, 1.0, 0.0], -Math.PI / 2.0 * accelerometer.x / 10.0);
  // let matAccY = m4.axisRotation([1.0, 0.0, 0.0], Math.PI / 2.0 * accelerometer.y / 10.0);
  let matAccum0 = m4.multiply(rotateToPointZero, modelView);
  let matAccum1 = m4.multiply(translateToPointZero, matAccum0);
  // let matAccum2 = m4.multiply(matAccX, matAccY)
  // let matAccum3 = m4.multiply(matAccum1, matAccum2);

  /* Multiply the projection matrix times the modelview matrix to give the
     combined transformation matrix, and send that to the shader program. */
  let modelViewProjection = m4.identity()
  const normalMat = m4.identity();
  m4.inverse(modelView, normalMat);
  m4.transpose(normalMat, normalMat);

  gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    video
  );
  background.Draw();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const translateAudio = setAudioPos()
  modelViewProjection = m4.translation(...translateAudio)
  gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
  if (panner) {
    panner.setPosition(...translateAudio)
  }
  sphere.Draw()
  gl.clear(gl.DEPTH_BUFFER_BIT);
  /* Draw the six faces of a cube, with different colors. */
  gl.uniform4fv(shProgram.iColor, [1, 1, 0, 1]);
  gl.uniform1f(shProgram.iScale, document.getElementById('scale').value);
  stereoCamera.ApplyLeftFrustum();
  modelViewProjection = m4.multiply(stereoCamera.mProjectionMatrix, m4.multiply(stereoCamera.mModelViewMatrix, m4.multiply(matAccum1, deviceOrientationMatrix)));
  gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
  gl.colorMask(true, false, false, false);
  surface.Draw();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  stereoCamera.ApplyRightFrustum();
  modelViewProjection = m4.multiply(stereoCamera.mProjectionMatrix, m4.multiply(stereoCamera.mModelViewMatrix, m4.multiply(matAccum1, deviceOrientationMatrix)));
  gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
  gl.colorMask(false, true, true, false);
  surface.Draw();
  gl.colorMask(true, true, true, true);
}

function animation() {
  draw()
  window.requestAnimationFrame(animation)
}

const { cos, sin, sqrt, pow, PI, tan } = Math
function CreateSurfaceData() {
  let vertexList = [];
  const NUM_STEPS_U = 50,
    NUM_STEPS_Z = 50,
    MAX_U = PI * 2,
    MAX_Z = 3,
    STEP_U = MAX_U / NUM_STEPS_U,
    STEP_Z = 2 * MAX_Z / NUM_STEPS_Z
  for (let u = 0; u < MAX_U; u += STEP_U) {
    for (let z = -3; z < MAX_Z; z += STEP_Z) {
      let vertex = cassiniVertex(u, z)
      vertexList.push(...vertex)
      vertex = cassiniVertex(u + STEP_U, z)
      vertexList.push(...vertex)
      vertex = cassiniVertex(u, z + STEP_Z)
      vertexList.push(...vertex)
      vertexList.push(...vertex)
      vertex = cassiniVertex(u + STEP_U, z)
      vertexList.push(...vertex)
      vertex = cassiniVertex(u + STEP_U, z + STEP_Z)
      vertexList.push(...vertex)
    }
  }
  return vertexList;
}

function r(u, z) {
  return sqrt(c(z) * c(z) * cos(2 * u) + sqrt(pow(a, 4) - pow(c(z), 4) * pow(sin(2 * u), 2)))
}
function c(z) {
  return 3 * z;
}

const a = 8
const scaler = 0.5;

function cassiniVertex(u, z) {
  // console.log(r(u, z))
  let x = r(u, z) * cos(u),
    y = r(u, z) * sin(u),
    cZ = z;
  return [scaler * x, scaler * y, scaler * cZ];
}

function CreateNormals() {
  let normalList = [];
  const NUM_STEPS_U = 50,
    NUM_STEPS_Z = 50,
    MAX_U = PI * 2,
    MAX_Z = 3,
    STEP_U = MAX_U / NUM_STEPS_U,
    STEP_Z = 2 * MAX_Z / NUM_STEPS_Z
  for (let u = 0; u < MAX_U; u += STEP_U) {
    for (let z = -3; z < MAX_Z; z += STEP_Z) {
      let vertex = normalAnalytic(u, z)
      normalList.push(...vertex)
      vertex = normalAnalytic(u + STEP_U, z)
      normalList.push(...vertex)
      vertex = normalAnalytic(u, z + STEP_Z)
      normalList.push(...vertex)
      normalList.push(...vertex)
      vertex = normalAnalytic(u + STEP_U, z)
      normalList.push(...vertex)
      vertex = normalAnalytic(u + STEP_U, z + STEP_Z)
      normalList.push(...vertex)
    }
  }
  return normalList;
}
const e = 0.0001
function normalAnalytic(u, z) {
  let u1 = cassiniVertex(u, z),
    u2 = cassiniVertex(u + e, z),
    z1 = cassiniVertex(u, z),
    z2 = cassiniVertex(u, z + e);
  const dU = [], dZ = []
  for (let i = 0; i < 3; i++) {
    dU.push((u1[i] - u2[i]) / e)
    dZ.push((z1[i] - z2[i]) / e)
  }
  const n = m4.normalize(m4.cross(dU, dZ))
  return n
}

function CreateTextures() {
  let textureList = [];
  const NUM_STEPS_U = 50,
    NUM_STEPS_Z = 50;
  for (let u = 0; u < NUM_STEPS_U; u++) {
    for (let z = 0; z < NUM_STEPS_Z; z++) {
      textureList.push(u / NUM_STEPS_U, z / NUM_STEPS_Z)
      textureList.push((u + 1) / NUM_STEPS_U, z / NUM_STEPS_Z)
      textureList.push(u / NUM_STEPS_U, (z + 1) / NUM_STEPS_Z)
      textureList.push(u / NUM_STEPS_U, (z + 1) / NUM_STEPS_Z)
      textureList.push((u + 1) / NUM_STEPS_U, z / NUM_STEPS_Z)
      textureList.push((u + 1) / NUM_STEPS_U, (z + 1) / NUM_STEPS_Z)
    }
  }
  return textureList;
}
function map(value, a, b, c, d) {
  value = (value - a) / (b - a);
  return c + value * (d - c);
}
let sphere;
function CreateSphereData() {
  let vertexList = [];

  let u = 0,
    t = 0;
  while (u < Math.PI * 2) {
    while (t < Math.PI) {
      let v = getSphereVertex(u, t);
      let w = getSphereVertex(u + 0.1, t);
      let wv = getSphereVertex(u, t + 0.1);
      let ww = getSphereVertex(u + 0.1, t + 0.1);
      vertexList.push(...v);
      vertexList.push(...w);
      vertexList.push(...wv);
      vertexList.push(...wv);
      vertexList.push(...w);
      vertexList.push(...ww);
      t += 0.1;
    }
    t = 0;
    u += 0.1;
  }
  return vertexList;
}
function getSphereVertex(long, lat) {
  return [
    0.1 * Math.cos(long) * Math.sin(lat),
    0.1 * Math.sin(long) * Math.sin(lat),
    0.1 * Math.cos(lat)
  ]
}

const planeVertices = [1, 1, 0, -1, -1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1, -1, 0]
const planeTextures = [0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1]
/* Initialize the WebGL context. Called from init() */
function initGL() {

  CreateVideoTexture()
  let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  shProgram = new ShaderProgram('Basic', prog);
  shProgram.Use();

  shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
  shProgram.iAttribNormal = gl.getAttribLocation(prog, "normal");
  shProgram.iAttribTexture = gl.getAttribLocation(prog, "texture");
  shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
  shProgram.iNormalMat = gl.getUniformLocation(prog, "normalMat");
  shProgram.iColor = gl.getUniformLocation(prog, "color");
  shProgram.iTMU = gl.getUniformLocation(prog, 'tmu');
  shProgram.iScale = gl.getUniformLocation(prog, 'scaleFactor');
  shProgram.iPointPos = gl.getUniformLocation(prog, 'pointPos');

  LoadTexture();
  ui = new dat.GUI()
  console.log(ui)

  stereoCamera = new StereoCamera(
    4,          // Convergence
    0.25,       // Eye Separation
    1,          // Aspect Ratio
    120,         // FOV along Y in degrees
    1.0,        // Near Clipping Distance
    15.0        // Far Clipping Distance
  );
  ui.add(stereoCamera, 'mConvergence', 0.5, 10, 0.1)
  ui.add(stereoCamera, 'mEyeSeparation', 0.1, 5, 0.1)
  ui.add(stereoCamera, 'mFOV', 0.1, 3.1)
  ui.add(stereoCamera, 'mNearClippingDistance', 1, 15, 0.1)

  surface = new Model('Surface');
  sphere = new Model('Sphere');
  // console.log(CreateSurfaceData().length)
  // console.log(CreateNormals().length)
  // console.log(CreateTextures().length)
  surface.BufferData(CreateSurfaceData(), CreateNormals(), CreateTextures());
  background = new Model('Background');
  background.BufferData(planeVertices, planeVertices, planeTextures);
  const sphereVertices = CreateSphereData();
  sphere.BufferData(sphereVertices, sphereVertices, sphereVertices)


  gl.enable(gl.DEPTH_TEST);
}


/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.  If an error occurs while compiling or
 * linking the program, an exception of type Error is thrown.  The error
 * string contains the compilation or linking error.  If no error occurs,
 * the program identifier is the return value of the function.
 * The second and third parameters are strings that contain the
 * source code for the vertex shader and for the fragment shader.
 */
function createProgram(gl, vShader, fShader) {
  let vsh = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vsh, vShader);
  gl.compileShader(vsh);
  if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
  }
  let fsh = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fsh, fShader);
  gl.compileShader(fsh);
  if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
  }
  let prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
  }
  return prog;
}


/**
 * initialization function that will be called when the page has loaded
 */
let deviceOrientationMatrix;
let xA = 0, yA = 0, zA = 0;
function init() {
  audioInitin()
  deviceOrientationMatrix = m4.identity()
  // readAccelerometer()
  CreateCamera()
  let canvas;
  try {
    canvas = document.getElementById("webglcanvas");
    gl = canvas.getContext("webgl");
    if (!gl) {
      throw "Browser does not support WebGL";
    }
  }
  catch (e) {
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not get a WebGL graphics context.</p>";
    return;
  }
  try {
    initGL();  // initialize the WebGL graphics context
  }
  catch (e) {
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
    return;
  }

  window.addEventListener(
    "deviceorientation",
    (event) => {
      let x = m4.xRotation(deg2rad(event.beta))
      let y = m4.yRotation(deg2rad(event.gamma))
      let z = m4.zRotation(deg2rad(event.alpha))
      xA = event.alpha
      yA = event.beta
      zA = event.gamma

      deviceOrientationMatrix = m4.multiply(x, m4.multiply(y, z))
    },
    true,
  );

  spaceball = new TrackballRotator(canvas, draw, 0);

  animation();
}

function LoadTexture() {
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const image = new Image();
  image.crossOrigin = 'anonymus';
  image.src = "https://raw.githubusercontent.com/jumberr/vggi/CGW/CGW/img/texture.jpg";
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image
    );
    console.log("imageLoaded")
    draw()
  }
}

function audioInitin() {
  audio = document.getElementById('musicalId');

  audio.addEventListener('play', () => {
    if (!context) {
      context = new AudioContext();
      mediaSource = context.createMediaElementSource(audio);
      panner = context.createPanner();
      biquadFilter = context.createBiquadFilter();

      mediaSource.connect(panner);
      panner.connect(biquadFilter);
      biquadFilter.connect(context.destination);

      biquadFilter.type = 'bandpass';
      biquadFilter.Q.value = 0.77;
      biquadFilter.frequency.value = 1000;
      // biquadFilter.gain.value = 111; // не використовується у фільтрі смугового типу
      context.resume();
    }
  })


  audio.addEventListener('pause', () => {
    console.log('pause');
    context.resume();
  })
  let bandState = document.getElementById('bandState');
  bandState.addEventListener('change', function() {
    if (bandState.checked) {
      panner.disconnect();
      panner.connect(biquadFilter);
      biquadFilter.connect(context.destination);
    } else {
      panner.disconnect();
      panner.connect(context.destination);
    }
  });
  audio.play();
}

function setAudioPos() {
  // Convert angles to radians
  const alphaRad = deg2rad(xA)
  const betaRad = deg2rad(yA)
  const gammaRad = deg2rad(zA)

  // Define the initial vector along the x-axis
  let vector = [0, 1, 0];

  // Rotation around the z-axis (gamma)
  const rotZ = [
    [Math.cos(gammaRad), -Math.sin(gammaRad), 0],
    [Math.sin(gammaRad), Math.cos(gammaRad), 0],
    [0, 0, 1]
  ];
  vector = multiplyMatrixVector(rotZ, vector);

  // Rotation around the y-axis (beta)
  const rotY = [
    [Math.cos(betaRad), 0, Math.sin(betaRad)],
    [0, 1, 0],
    [-Math.sin(betaRad), 0, Math.cos(betaRad)]
  ];
  vector = multiplyMatrixVector(rotY, vector);

  // Rotation around the x-axis (alpha)
  const rotX = [
    [1, 0, 0],
    [0, Math.cos(alphaRad), -Math.sin(alphaRad)],
    [0, Math.sin(alphaRad), Math.cos(alphaRad)]
  ];
  vector = multiplyMatrixVector(rotX, vector);

  return vector;
}

function multiplyMatrixVector(matrix, vector) {
  const result = [];
  for (let i = 0; i < matrix.length; i++) {
    let sum = 0;
    for (let j = 0; j < vector.length; j++) {
      sum += matrix[i][j] * vector[j];
    }
    result.push(sum);
  }
  return result;
}