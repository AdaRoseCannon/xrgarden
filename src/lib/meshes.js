import { BackSide } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const loader = new GLTFLoader();

async function loadModels() {
	// Forest from Google Poly, https://poly.google.com/view/2_fv3tn3NG_
	const { scene: trees } = await new Promise((resolve) =>
		loader.load("./assets/forest.glb", resolve)
	);
	const flotsam = trees.children[0];
	flotsam.position.y = 0;
	flotsam.material.side = BackSide;
	flotsam.material.transparent = true;
	flotsam.material.opacity = 0.5;

	// LilyPad by Poly by Google, https://poly.google.com/view/0-_GjMekeob
	const { scene: lilyPad1 } = await new Promise((resolve) =>
		loader.load("./assets/LilyPad.glb", resolve)
	);

	const { scene: lilyPad2 } = await new Promise((resolve) =>
		loader.load("./assets/LilyPad2.glb", resolve)
	);

	// Fish by RunemarkStudio, https://sketchfab.com/3d-models/koi-fish-8ffded4f28514e439ea0a26d28c1852a
	const { scene: fish } = await new Promise((resolve) =>
		loader.load("./assets/fish.glb", resolve)
	);

	return {
		fish,
		lilyPad2,
		lilyPad1,
		trees,
		flotsam
	};
}

export const models = loadModels();