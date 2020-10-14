import resolve from "@rollup/plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import { terser } from "rollup-plugin-terser";

export default {
	input: "src/garden.js",
	output: {
		dir: "build/",
		format: "esm",
		sourcemap: true,
		manualChunks: {
			three: ['three']
		},
		preserveEntrySignatures: false
	},
	plugins: [
		resolve(),
		commonjs({
			include: ["node_modules/**"],
		}),
		terser()
	],
	external: [
		"https://cdn.jsdelivr.net/npm/webxr-polyfill@latest/build/webxr-polyfill.js",
	],
};
