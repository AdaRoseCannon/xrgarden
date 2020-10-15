import { renderer, scene, camera, rafCallbacks, water } from "./lib/scene.js";
import "./lib/controllers/controllers.js"; // Adds locomotion
import { InstancedFlow } from "./lib/flow.js";
import { curves, lilyPad1, lilyPad2 } from "./lib/positions.js";
import { models } from "./lib/meshes.js";
import { init as audioInit, playRandomNote } from "./lib/audio.js";

window.canaudio.checked = false;
window.canaudio.addEventListener('change', function () {
	if (this.checked) {
		audioInit();
		window.bgsound.play();
	} else {
		window.bgsound.pause();
	}
});

import {
	AdditiveBlending,
	Vector3,
	CatmullRomCurve3,
	LineBasicMaterial,
	LineLoop,
	CircleGeometry,
	Color
} from "three";
import Stats from 'three/examples/jsm/libs/stats.module.js';
const stats = new Stats();
document.body.appendChild( stats.dom );


const modelsPromise = (async function () {

	const {
		fish: fishScene,
		trees,
		flotsam,
		lilyPad1: lilyPad1Model,
		lilyPad2: lilyPad2Model
	} = await models;

	for (const l of lilyPad1) {
		const newPad = lilyPad1Model.clone();
		newPad.position.copy(l);
		newPad.position.y = 0;
		newPad.rotation.y = Math.PI*2*Math.random();
		newPad.scale.multiplyScalar(0.8 + 0.4 * Math.random());
		water.add(newPad);
	}

	for (const l of lilyPad2) {
		const newPad = lilyPad2Model.clone();
		newPad.position.copy(l);
		newPad.position.y = 0;
		newPad.rotation.y = Math.PI*2*Math.random();
		newPad.scale.multiplyScalar(0.8 + 0.4 * Math.random());
		water.add(newPad);
	}

	water.add(flotsam);
	scene.add(trees);

	class Fishes extends InstancedFlow {
		constructor(count, curveCount) {
			fishScene.children[0].geometry.scale(0.6, 0.6, 0.6);
			fishScene.children[0].geometry.rotateZ(Math.PI);
			fishScene.children[0].geometry.rotateY(-Math.PI / 2);
			super(count, curveCount, fishScene.children[0].geometry, fishScene.children[0].material);
		}
	}
	return { Fishes };
})();

(async function generatePath() {

	const { Fishes } = await modelsPromise;
	let totalFishCount = 60;
	const searchMatch = (window.location.search || "").match(/^\?fish=(\d+)/);
	if (searchMatch) {
		totalFishCount = +searchMatch[1];
	}
	const fishes = new Fishes(totalFishCount, curves.length); // 10 fish models, space for 2 curves
	scene.add(fishes.object3D);
	window.fishes = fishes;

	for (let i = 0; i < curves.length; i++) {
		const curve = new CatmullRomCurve3(curves[i]);
		curve.curveType = "centripetal";
		curve.closed = true;
		fishes.updateCurve(i, curve);
	}

	const totalCurveLength = fishes.curveLengthArray.reduce((a, b) => a + b, 0);
	const noOfFishPersegment = fishes.curveLengthArray.map(length => Math.round(totalFishCount * length / totalCurveLength));
	const noOfFish = noOfFishPersegment.slice(0);
	for (let i=0; i<noOfFish.length; i++) {
		noOfFish[i]+=(i===0?0:noOfFish[i-1])
	}
	for (let i = 0; i < fishes.count; i++) {
		const curveIndex = noOfFish.findIndex(n => i <= n);
		fishes.setCurve(i, curveIndex);
		fishes.moveIndividualAlongCurve(i, (i * 1) / noOfFishPersegment[curveIndex]);
		fishes.object3D.setColorAt(i, new Color(`hsl(${Math.floor(50 * Math.random())}, ${Math.floor(100 * Math.random())}%, ${Math.floor(20 + 80 * Math.random())}%)`));
	}

	const speedPerTick = 0.009 / 10;
	rafCallbacks.add(function () {
		// fishes.moveAlongCurve(speedPerTick);
		for (let i = 0; i < fishes.count; i++) {
			fishes.moveIndividualAlongCurve(i, speedPerTick);
		}
	});

	rafCallbacks.add(() => stats.update());
})();

(function rain() {
	const rainRipples = [];
	const unsedRainRipples = [];
	const geometry = new CircleGeometry(1, 32);
	const dripPos = new Vector3();

	geometry.rotateX(-Math.PI / 2);
	geometry.vertices.splice(0, 1);

	for (let i = 0; i < 5*3; i++) {
		const material = new LineBasicMaterial({
			color: 0x999999,
			blending: AdditiveBlending,
		});
		const mesh = new LineLoop(geometry, material);
		rainRipples.push(mesh);
		unsedRainRipples.push(mesh);
	}

	(function drip() {
		if (unsedRainRipples.length > 3) {
			const ripplesToUse = unsedRainRipples.splice(0, 3);
			const x = 20 * (Math.random() - 0.5);
			const z = 20 * (Math.random() - 0.5);

			dripPos.set(x, water.position.y, z);
			if (window.canaudio.checked) playRandomNote(dripPos);

			for (let ri = 1; ri <= 3; ri++) {
				const ripple = ripplesToUse[ri - 1];
				ripple.position.set(x, -0.1, z);
				setTimeout(() => {
					ripple.scale.multiplyScalar(0);
					ripple.material.color.setHex(0xffffff);
					water.add(ripple);
					setTimeout(() => {
						water.remove(ripple);
						unsedRainRipples.push(ripple)
					}, 3000);
				}, ri * 800);
			}
		}

		setTimeout(drip, Math.random() * 1000);
	}());

	const rippleSpeed = new Vector3(1, 1, 1).multiplyScalar(0.018);
	rafCallbacks.add(function () {
		for (const r of rainRipples) {
			r.scale.add(rippleSpeed);
			const col = (r.material.color.getHex() >> 16)*0.99;
			const newCol = (col << 16) + (col << 8) + col;
			r.material.color.setHex(newCol);
		}
	});
})();

window.renderer = renderer;
window.camera = camera;
window.scene = scene;

if (location.search === "?editor") {
	import("./lib/editor.js");
}