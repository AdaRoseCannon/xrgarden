import {
	renderer,
	scene,
	camera,
	rafCallbacks
} from './lib/scene.js';

import {
	controller1
} from './lib/controllers/controllers.js';

import {
	gamepad
} from './lib/controllers/gamepad.js';

import {
	initSplineTexture,
	modifyShader,
	updateSplineTexture,
	getUniforms
} from './lib/flow.js';

import {
	Mesh,
	PlaneGeometry,
	AdditiveBlending,
	CanvasTexture,
	DoubleSide,
	MeshBasicMaterial,
	Vector3,
	CatmullRomCurve3,
	BufferGeometry,
	LineBasicMaterial,
	Line
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Debugging

const canvas = document.createElement('canvas');
const canvasTexture = new CanvasTexture(canvas);
canvas.width = 1024;
canvas.height = 256;
const ctx = canvas.getContext('2d');
function writeText(text) {
	if (typeof text !== 'string') text = JSON.stringify(text,null,2);
	ctx.font = "120px fantasy";
	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'white';
	text.split('\n').forEach((str, i) => ctx.fillText(str, 0, (i+1)*120));
	canvasTexture.needsUpdate = true;
}

const geometry = new PlaneGeometry( 0.3 * canvas.width/1024, 0.3 * canvas.height/1024 );
const material = new MeshBasicMaterial( {map: canvasTexture, blending: AdditiveBlending, transparent: true} );
const consolePlane = new Mesh( geometry, material );
consolePlane.renderOrder = 1;
consolePlane.position.set(0, 0.5 * 0.3 * canvas.height/1024, -0.1);
consolePlane.rotation.set(-Math.PI/4,0,0);
controller1.add( consolePlane );
writeText('hi');

gamepad.addEventListener('gamepadInteraction', function (event) {
	writeText(`${event.detail.type} ${event.detail.value}`);
});

const modelsPromise = (async function () {

	// Forest from Google Poly, https://poly.google.com/view/2_fv3tn3NG_
	const {scene: treesScene} = await new Promise(resolve => loader.load('./assets/forest.glb', resolve));
	const trees = treesScene.children[0];
	trees.position.z = 0;
	trees.position.y = 2.5;
	trees.scale.multiplyScalar(10);
	trees.traverse(o => {
		if (o.material) {
			o.material.side = DoubleSide;
			o.material.depthWrite = true;
		}
	});
	scene.add(trees);

	// Fish by RunemarkStudio, https://sketchfab.com/3d-models/koi-fish-8ffded4f28514e439ea0a26d28c1852a
	const { scene: fish } = await new Promise(resolve => loader.load('./assets/fish.glb', resolve));
	fish.position.y = 0.15;
	fish.children[0].children[0].children[0].children[0].children[0].scale.set(0.2, 0.2, 0.2);
	fish.children[0].children[0].children[0].children[0].children[0].position.set(0,-0.18,0);
	fish.children[0].children[0].children[0].children[0].children[0].rotation.set(Math.PI/2,0,Math.PI/2);
	fish.traverse(o => {
		if (o.material) {
			o.material.side = DoubleSide;
			o.material.depthWrite = true;
		}
	});
	window.fish = fish;
	scene.add(fish);

	return {fish, trees};
}());

(async function generatePath() {
	//Create a closed wavey loop
	const curve = new CatmullRomCurve3( [
		new Vector3( -1, 0.15, 1 ),
		new Vector3( -1, 0.15, -1 ),
		new Vector3( 0, 0.15, 0 ),
		new Vector3( 1, 0.15, -1 ),
		new Vector3( 2, 0.15, 2 )
	] );

	curve.curveType = 'centripetal';
	curve.closed = true;

	const points = curve.getPoints( 50 );
	const geometry = new BufferGeometry().setFromPoints( points );

	const material = new LineBasicMaterial( { color : 0x00ff00 } );

	// Create the final object to add to the scene
	const line = new Line( geometry, material );

	scene.add(line);

	const splineTexure = initSplineTexture(renderer);
	const uniforms = getUniforms(splineTexure);
	updateSplineTexture(curve, splineTexure, uniforms);

	const {fish} = await modelsPromise;
	fish.traverse( function ( child ) {
		if ( child instanceof Mesh ) {
			modifyShader( child.material, uniforms );
		}
	});

	window.uniforms = uniforms;

	const speedPerTick = 0.05 / curve.getLength();

	rafCallbacks.add(function () {
		uniforms.pathOffset.value += speedPerTick;
	});
}())

window.renderer = renderer;
window.camera = camera;
window.scene = scene;