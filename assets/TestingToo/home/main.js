import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Setup

const scene = new THREE.Scene();
//scene.background = new THREE.Color('rgb(36,43,51)');

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#bg'),
  alpha: true
});

const controls = new OrbitControls( camera, renderer.domElement );

const loader = new GLTFLoader();

let mixer;

let characterObjectsToOutline = [];
let objectsToOutline = [];
let composer = new EffectComposer( renderer );

const renderPass = new RenderPass( scene, camera );
composer.addPass( renderPass );

let characterOutlinePass = new OutlinePass( new THREE.Vector2( window.innerWidth, window.innerHeight ), scene, camera );
let outlinePass = new OutlinePass( new THREE.Vector2( window.innerWidth, window.innerHeight ), scene, camera );

characterOutlinePass.visibleEdgeColor.set('rgb(0, 0, 0)');
characterOutlinePass.hiddenEdgeColor.set('#000000');
characterOutlinePass.edgeThickness = 2;

outlinePass.visibleEdgeColor.set('#000000');
outlinePass.edgeThickness = 2;

characterOutlinePass.edgeGlow = 0; // Enable or increase glow (if needed)
outlinePass.edgeGlow = 0; // Enable or increase glow (if needed)

composer.addPass( characterOutlinePass );
composer.addPass( outlinePass );

let effectFXAA = new ShaderPass( FXAAShader );
effectFXAA.uniforms[ 'resolution' ].value.set( 1 / window.innerWidth, 1 / window.innerHeight );
composer.addPass( effectFXAA );

loader.load( 'model.gltf', function ( gltf ) {

    addOutlineObject(gltf.scene);
	scene.add( gltf.scene );
    
    // Rotate the model 90 degrees on the Y-axis
    gltf.scene.rotation.y = -65 * (Math.PI / 180);
    
    // Check if the model has animations
  if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(gltf.scene);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }

}, undefined, function ( error ) {

	console.error( error );

} );

function addOutlineObject(object){
  let firstMesh = null;

  // Traverse the object hierarchy to find the first mesh
  object.traverse((child) => {
    if (child.isMesh && !firstMesh) {
      firstMesh = child; // Assign the first mesh and stop further assignment
    }
    else{
      objectsToOutline.push(child);
    }
  });

  // If a mesh is found, add it to the outline objects array
  if (firstMesh) {
    characterObjectsToOutline.push(firstMesh);
    characterOutlinePass.selectedObjects = characterObjectsToOutline;
  }
  outlinePass.selectedObjects = objectsToOutline;
  
}

//const modelPosition = new THREE.Vector3(0, 0, 0); // Model's position

camera.position.set(-1.36, 1.47, 1.1);
camera.rotation.set(-0.36, -0.88, -0.28);

const direction = new THREE.Vector3();
camera.getWorldDirection(direction); // Get the camera's direction vector
const target = camera.position.clone().add(direction); // Calculate the target point

//controls.target.set(-1.36, 1.47, 1.1);
controls.target.copy(target);

// Make the camera look at the model
//camera.lookAt(modelPosition);
camera.updateProjectionMatrix();

renderer.render(scene, camera);

// Lights
const pointLight = new THREE.PointLight(0xffffff);
pointLight.position.set(0, 2, 0);
pointLight.intensity = 1;

const ambientLight = new THREE.AmbientLight(0xffffff);
ambientLight.intensity = 5;
scene.add(pointLight, ambientLight);

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  updateCanvasSize();
  
  requestAnimationFrame(animate);
  
  //controls.update();
    
  // Get the time delta since the last frame
  const delta = clock.getDelta();

  // Update the mixer for animation
  if (mixer) {
    mixer.update(delta); // Update based on time delta, here it's 0.01 for simplicity
  }

  //renderer.render(scene, camera);
  composer.render(scene, camera);
}

function updateCanvasSize(){
  let canvasContainer = document.getElementsByClassName("canvas-container")[0];
  let width = canvasContainer.clientWidth / 2;
  let height = 600;
  
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  composer.setPixelRatio(window.devicePixelRatio);
  composer.setSize(width, height);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  //console.log("Position: " + camera.position.x + ", " + camera.position.y + ", " + camera.position.z);
  //console.log("Rotation: " + camera.rotation.x + ", " + camera.rotation.y + ", " + camera.rotation.z);
  console.log("Target: " + controls.target.x + ", " + controls.target.y + ", " + controls.target.z);
}

animate();