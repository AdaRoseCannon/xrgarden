import { curves as initialCurveData } from "./positions.js";
import { camera, rafCallbacks, water, renderer, controls, scene } from "./scene.js";
import { models } from "./meshes.js";

import {
	Vector2,
	Raycaster,
	BufferGeometry,
	LineLoop,
	LineBasicMaterial,
	BoxGeometry,
	MeshBasicMaterial,
	Mesh,
	CatmullRomCurve3
} from "three";
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

let mode = 'none';
const lilyPad1Array = [];
const lilyPad2Array = [];
const curves = [];
let action = false;
let curveAddResolutions = [];

let activeCurve;
let activeCurveHandle;
const splineHandles = [];
const boxGeometry = new BoxGeometry(0.1, 0.1, 0.1);
const boxMaterial = new MeshBasicMaterial(0x99ff99);

const modeToElementMap = {
	item1: lilyPad1Array,
	item2: lilyPad2Array,
	curve: splineHandles
};

function makeHandle() {
	const control = new TransformControls(camera, renderer.domElement);
	control.addEventListener('dragging-changed', function (event) {
		if (control.object.curve) {
			control.object.curve.redraw();
		}
		controls.enabled = ! event.value;
	});
	return control;
}

const raycaster = new Raycaster();
const mouse = new Vector2();
const handle = makeHandle();

function arrayRemove(array, el) {
	const index = array.indexOf(el);
	if (index !== -1) array.splice(index, 1);
}

function arrayInsertAfter(array, el, newEl) {
	const index = array.indexOf(el);
	array.splice(index, 0, newEl);
}

function drawCurve(vector3Array) {
	const curveHandles = [];
	for (const handlePos of vector3Array) {
		const handle = new Mesh(boxGeometry, boxMaterial);
		splineHandles.push(handle);
		curveHandles.push(handle);
		scene.add(handle);
		handle.position.copy(handlePos);
	}

	const curve = new CatmullRomCurve3(
		curveHandles.map(handle => handle.position)
	);
	curve.curveType = "centripetal";
	curve.closed = true;

	curves.push(curve);

	const points = curve.getPoints(50);
	const line = new LineLoop(
		new BufferGeometry().setFromPoints(points),
		new LineBasicMaterial({ color: 0x00ff00 })
	);

	curve.redraw = function () {
		const points = curve.getPoints(50);
		line.geometry.setFromPoints(points);
	}

	curve.line = line;

	for (const handle of curveHandles) {
		handle.curve = curve;
		handle.remove = function () {
			if (curve.points.length > 1) {
				arrayRemove(curve.points, handle.position);
			} else {
				// delete curve
				scene.remove(curve.line);
				arrayRemove(curves, curve);
			}
		}
	}

	scene.add(line);

	return { curve, handles: curveHandles};
}

(function drawCurves() {
	for (const curvePoints of initialCurveData) {
		drawCurve(curvePoints);
	}
}());

window.overlay.insertAdjacentHTML('afterbegin', `
	<label><input type="radio" name="mode" value="none" /> None</label><br />
	<label><input type="radio" name="mode" value="item1" /> Place Lily Pad 1</label><br />
	<label><input type="radio" name="mode" value="item2" /> Place Lily Pad 2</label><br />
	<label><input type="radio" name="mode" value="curve" /> Curves</label>
	<section>
		<h2>Curve Actions</h2>
		<button id="curvecreate">Create New Curve</button>
		<button id="addhandle">Add Handle</button>
		<button id="curvedeletehandle">Delete Handle</button>
		<button id="updatefish">Update Fish</button>
	</section>
	<button id="consolelog">Console Log Data</button>
`);

function addHandle(point) {
	window.overlay.querySelector('[value="curve"]').click();
	const newHandleBox = new Mesh(boxGeometry, boxMaterial);
	splineHandles.push(newHandleBox);
	scene.add(newHandleBox);

	const curve = activeCurve;
	const oldHandle = activeCurveHandle;

	if (point) {
		newHandleBox.position.copy(point);
	} else {
		newHandleBox.position.copy(oldHandle.position);
		newHandleBox.position.x += 1.4 * (Math.random() - 0.5);
		newHandleBox.position.z += 1.4 * (Math.random() - 0.5);
	}

	newHandleBox.curve = curve;
	newHandleBox.remove = function () {
		if (curve.points.length > 1) {
			arrayRemove(curve.points, handle.position);
		} else {
			// delete curve
			scene.remove(curve.line);
			arrayRemove(curves, curve);
		}
	}

	arrayInsertAfter(curve.points, oldHandle.position, newHandleBox.position);
	curve.redraw();

	handle.attach(newHandleBox);
	scene.add(handle);
	activeCurveHandle = newHandleBox;
}
window.addhandle.addEventListener('click', () => { addHandle() });

window.consolelog.addEventListener('click', function () {
	console.log(`
		const curveData = JSON.parse("${JSON.stringify(curves.map(curve => curve.points.map(p => [p.x, p.y, p.z].map(n => +n.toFixed(3)))))}");
	`);
	console.log('const lilypad1Positions = ', JSON.stringify(lilyPad1Array.map(p => p.position).map(t => [+t.x.toFixed(3),+t.y.toFixed(3),+t.z.toFixed(3)])));
	console.log('const lilypad2Positions = ', JSON.stringify(lilyPad2Array.map(p => p.position).map(t => [+t.x.toFixed(3),+t.y.toFixed(3),+t.z.toFixed(3)])));
});

window.curvedeletehandle.addEventListener('click', function () {
	window.overlay.querySelector('[value="curve"]').click();
	activeCurveHandle.remove();
	activeCurve.redraw();
	activeCurveHandle.parent.remove(activeCurveHandle);
	arrayRemove(splineHandles, activeCurveHandle);
	scene.remove(handle);
});

window.curvecreate.addEventListener('click', async function () {
	window.overlay.querySelector('[value="curve"]').click();
	const points = [
		await new Promise(resolve => curveAddResolutions.push(resolve))
	];

	const { curve, handles } = drawCurve(points);

	handle.attach(handles[0]);
	scene.add(handle);
	activeCurve = curve;
	activeCurveHandle = handles[0];
});

window.overlay.addEventListener('change', function (e) {
	if (e.target.name === "mode") {
		mode = e.target.value;
	}
});

window.overlay.querySelector('[value="item1"]').click();

models.then(function ({ trees }) {
	setTimeout(() => scene.remove(trees), 2000);
});

rafCallbacks.add(async function () {
	if (mode === 'none' || !action) return;
	const task = action;
	action = false;

	raycaster.setFromCamera( mouse, camera );

	if (task === "select") {
		const elements = modeToElementMap[mode];
		const intersects = raycaster.intersectObjects(elements);
		if (!intersects.length) return;
		const target = intersects[0].object;
		handle.attach(target);
		scene.add(handle);

		activeCurveHandle = false;
		if (target.curve) {
			activeCurve = target.curve;
			activeCurveHandle = target;
		}
	}

	if (mode === "curve" && task === "add") {
		const intersects = raycaster.intersectObjects([water]);
		if (!intersects.length) return;
		intersects[0].point.y = 0;


		if (curveAddResolutions.length) {
			curveAddResolutions.shift()(intersects[0].point);
		} else {
			addHandle(intersects[0].point);
		}
	}

	if (mode === "item1" && task === "add") {
		const intersects = raycaster.intersectObjects([water]);
		if (!intersects.length) return;
		const { lilyPad1 } = await models;
		const newItem = lilyPad1.children[4].clone();
		newItem.position.x = intersects[0].point.x;
		newItem.position.z = intersects[0].point.z;
		lilyPad1Array.push(newItem);
		water.add(newItem);
		handle.attach(newItem);
		scene.add(handle);
	}

	if (mode === "item2" && task === "add") {
		const intersects = raycaster.intersectObjects([water]);
		if (!intersects.length) return;
		const { lilyPad2 } = await models;
		const newItem = lilyPad2.children[2].clone();
		newItem.position.x = intersects[0].point.x;
		newItem.position.z = intersects[0].point.z;
		lilyPad2Array.push(newItem);
		water.add(newItem);
		handle.attach(newItem);
		scene.add(handle);
	}
});

renderer.domElement.addEventListener('click', function (event) {
	action = 'select';
	mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}, false);

renderer.domElement.addEventListener( 'dblclick', function (event) {
	action = 'add';
	mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}, false );